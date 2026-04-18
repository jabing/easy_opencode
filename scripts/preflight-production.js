#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const {
  buildReleaseConclusion,
  buildReleaseConclusionEnvelope,
  buildReleaseConclusionLegacySummary,
  normalizeReleaseConclusion,
} = require('../src/core/release/conclusion.js');
const { buildReleaseAuditSummary } = require('../src/core/release/audit-summary.js');

const DEFAULT_STEP_TIMEOUT_MS = Number(process.env.PREFLIGHT_STEP_TIMEOUT_MS || 10 * 60 * 1000);
const PREFLIGHT_ACTIVE_ENV = 'EASY_OPENCODE_PREFLIGHT_ACTIVE';
const JSON_STEP_NAMES = new Set(['quality-gate:json', 'release-check:production', 'release-evidence:production', 'test:stability']);

const STEPS = [
  { name: 'lint', command: ['npm', 'run', 'lint', '--silent'] },
  { name: 'typecheck', command: ['npm', 'run', 'typecheck', '--silent'] },
  { name: 'build', command: ['npm', 'run', 'build', '--silent'] },
  { name: 'test', command: ['npm', 'test', '--silent'] },
  { name: 'quality-gate:json', command: ['npm', 'run', 'quality-gate:json', '--silent'] },
  { name: 'release-check:production', command: ['npm', 'run', 'release:check:json', '--silent', '--', '--policy', 'production'] },
  { name: 'release-evidence:production', command: ['npm', 'run', 'release:evidence:json', '--silent', '--', '--policy', 'production'] },
];

function parseArgs(argv) {
  const opts = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      opts[key] = true;
      continue;
    }
    opts[key] = next;
    i += 1;
  }
  return opts;
}

function summarizeText(text) {
  const line = String(text || '').split(/\r?\n/).find((entry) => entry.trim());
  return (line || '').trim().slice(0, 200);
}

function tryParseJson(text) {
  try {
    return JSON.parse(String(text || ''));
  } catch {
    return null;
  }
}

function normalizeStepList(value) {
  if (Array.isArray(value)) return value.flatMap((entry) => normalizeStepList(entry));
  if (value === undefined || value === null || value === false) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function shouldAutoSkipTest(opts = {}, env = process.env) {
  return Boolean(opts['summary-only'])
    && (String(env.npm_lifecycle_event || '') === 'test' || String(env[PREFLIGHT_ACTIVE_ENV] || '') === '1');
}

function buildStepPlan(opts = {}, env = process.env) {
  const includeNames = new Set(normalizeStepList(opts['only-step']));
  const skipNames = new Set(normalizeStepList(opts['skip-step']));
  if (opts['skip-tests']) skipNames.add('test');
  if (shouldAutoSkipTest(opts, env)) skipNames.add('test');
  const source = includeNames.size > 0
    ? STEPS.filter((step) => includeNames.has(step.name))
    : STEPS.slice();
  return source.filter((step) => !skipNames.has(step.name));
}

function runStep(step, cwd, timeoutMs = DEFAULT_STEP_TIMEOUT_MS) {
  const start = Date.now();
  const result = spawnSync(step.command[0], step.command.slice(1), {
    cwd,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, CI: process.env.CI || '1', [PREFLIGHT_ACTIVE_ENV]: process.env[PREFLIGHT_ACTIVE_ENV] || '1' },
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  return {
    name: step.name,
    code: typeof result.status === 'number' ? result.status : 1,
    signal: result.signal || null,
    timed_out: result.error && result.error.code === 'ETIMEDOUT',
    duration_ms: Date.now() - start,
    timeout_ms: timeoutMs,
    stdout,
    stderr,
    parsed_json: JSON_STEP_NAMES.has(step.name) ? tryParseJson(stdout) : null,
  };
}

function buildTopline(results) {
  const releaseCheck = results.find((item) => item.name === 'release-check:production');
  const releaseEvidence = results.find((item) => item.name === 'release-evidence:production');
  const checkJson = releaseCheck && releaseCheck.parsed_json ? releaseCheck.parsed_json : null;
  const evidenceJson = releaseEvidence && releaseEvidence.parsed_json ? releaseEvidence.parsed_json : null;
  const evidenceSummary = evidenceJson && evidenceJson.summary ? evidenceJson.summary : null;
  const releaseConclusion = evidenceSummary && (evidenceSummary.release_conclusion || evidenceSummary.topline)
    ? normalizeReleaseConclusion(evidenceSummary.release_conclusion || evidenceSummary.topline)
    : buildReleaseConclusion({
        release_decision: checkJson ? checkJson.decision : 'unknown',
        release_reason: checkJson
          ? summarizeText(
              (checkJson.checks || [])
                .filter((item) => item.status !== 'pass' && item.status !== 'skip')
                .map((item) => `${item.check}: ${item.detail}`)
                .join(' | '),
            ) || 'release evidence unavailable'
          : 'release evidence unavailable',
        release_policy: checkJson && checkJson.selected_policy ? checkJson.selected_policy.id : 'production',
        override_used: false,
        baseline_approved: false,
        benchmark_fresh_enough: false,
        rollback_ready: false,
        canonical_baseline_name: checkJson && checkJson.benchmark_baseline_naming ? checkJson.benchmark_baseline_naming.recommended_name : null,
        selected_baseline_name: checkJson && checkJson.benchmark_baseline_naming ? checkJson.benchmark_baseline_naming.selected_name : null,
        override_pressure_status: evidenceSummary && evidenceSummary.override_pressure ? evidenceSummary.override_pressure.status : 'unknown',
        override_pressure_last_30_days: evidenceSummary && evidenceSummary.override_pressure ? evidenceSummary.override_pressure.last_30_days_count : 0,
      });
  const failed = results.filter((item) => item.code !== 0);
  const preflightDecision = failed.length === 0 ? 'ready' : 'blocked';
  const legacySummary = buildReleaseConclusionLegacySummary(releaseConclusion, { preflight_decision: preflightDecision });
  const auditSummary = buildReleaseAuditSummary({
    preflight_decision: preflightDecision,
    policy: releaseConclusion.release_policy,
    baseline_name: releaseConclusion.selected_baseline_name,
    release_conclusion: releaseConclusion,
    final_decision_summary: releaseConclusion.reason,
    why_blocked_or_caution: evidenceSummary && Array.isArray(evidenceSummary.why_blocked_or_caution) ? evidenceSummary.why_blocked_or_caution : [],
    benchmark_readiness: evidenceSummary ? evidenceSummary.benchmark_readiness : 'unknown',
    benchmark_freshness: evidenceSummary ? evidenceSummary.benchmark_freshness : 'unknown',
    baseline_status: evidenceSummary ? evidenceSummary.baseline_status : 'unknown',
    approval_status: evidenceSummary ? evidenceSummary.approval_status : 'unknown',
    latest_rehearsal_decision: evidenceSummary ? evidenceSummary.latest_rehearsal_decision : 'unknown',
    rollback_ready: releaseConclusion.rollback_ready,
    override_pressure: {
      status: releaseConclusion.override_pressure_status,
      last_30_days_count: releaseConclusion.override_pressure_last_30_days,
    },
  });
  return {
    ...legacySummary,
    release_conclusion: releaseConclusion,
    release_conclusion_schema: buildReleaseConclusionEnvelope(releaseConclusion, { preflight_decision: preflightDecision }),
    audit_summary: auditSummary,
  };
}

function buildSummary(results, options = {}) {
  const failed = results.filter((item) => item.code !== 0);
  return {
    schema_version: '1.4',
    generated_at: new Date().toISOString(),
    decision: failed.length === 0 ? 'ready' : 'blocked',
    counts: {
      pass: results.length - failed.length,
      fail: failed.length,
    },
    topline: buildTopline(results),
    optional_evidence: options.optionalEvidence || null,
    steps: results.map((item) => ({
      name: item.name,
      status: item.code === 0 ? 'pass' : 'fail',
      code: item.code,
      signal: item.signal,
      timed_out: item.timed_out,
      duration_ms: item.duration_ms,
      timeout_ms: item.timeout_ms,
      summary:
        item.code === 0
          ? summarizeText(item.stdout) || 'ok'
          : item.timed_out
            ? `timed out after ${item.timeout_ms}ms`
            : summarizeText(`${item.stdout}\n${item.stderr}`) || 'failed',
      parsed_json: item.parsed_json,
    })),
  };
}

function printHuman(summary) {
  console.log(`Production preflight: ${summary.decision}`);
  if (summary.topline) {
    console.log(`Release decision: ${summary.topline.release_decision}`);
    console.log(`Why: ${summary.topline.release_reason}`);
    console.log(`Baseline: ${summary.topline.selected_baseline_name || 'n/a'} (recommended=${summary.topline.canonical_baseline_name || 'n/a'}) approved=${summary.topline.baseline_approved}`);
    console.log(`Benchmark fresh enough: ${summary.topline.benchmark_fresh_enough}`);
    console.log(`Rollback ready: ${summary.topline.rollback_ready}`);
    console.log(`Override pressure: ${summary.topline.override_pressure_status} (last_30_days=${summary.topline.override_pressure_last_30_days})`);
  }
  for (const step of summary.steps) console.log(`- [${step.status}] ${step.name}: ${step.summary}`);
  console.log(`Counts: pass=${summary.counts.pass} fail=${summary.counts.fail}`);
}

function printSummaryOnly(summary, asJson = false) {
  const payload = summary.topline && summary.topline.audit_summary
    ? summary.topline.audit_summary
    : buildReleaseAuditSummary({
        preflight_decision: summary.decision,
        release_conclusion: summary.topline && summary.topline.release_conclusion ? summary.topline.release_conclusion : {},
      });
  if (asJson) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return;
  }
  console.log(`Preflight decision: ${payload.preflight_decision || summary.decision}`);
  console.log(`Release decision: ${payload.release_conclusion && payload.release_conclusion.release_decision ? payload.release_conclusion.release_decision : 'unknown'}`);
  console.log(`Why: ${payload.final_decision_summary || (payload.release_conclusion ? payload.release_conclusion.reason : 'release conclusion unavailable')}`);
  console.log(`Baseline: ${payload.baseline_name || (payload.release_conclusion ? payload.release_conclusion.selected_baseline_name : 'n/a') || 'n/a'}`);
  console.log(`Rollback ready: ${payload.rollback_ready === true ? 'yes' : 'no'}`);
  const pressure = payload.override_pressure || {};
  console.log(`Override pressure: ${pressure.status || 'unknown'} (last_30_days=${Number(pressure.last_30_days_count || 0)})`);
}

function main() {
  const opts = parseArgs(process.argv);
  const cwd = path.resolve(String(opts.root || process.cwd()));
  const timeoutMs = Number(opts['step-timeout-ms'] || DEFAULT_STEP_TIMEOUT_MS);
  const steps = buildStepPlan(opts, process.env);
  const results = steps.map((step) => runStep(step, cwd, timeoutMs));
  let optionalEvidence = null;
  if (opts['include-test-stability']) {
    const repeat = Math.max(1, Number(opts['test-stability-repeat'] || 5));
    const command = ['node', 'scripts/test-stability.js', '--json', '--repeat', String(repeat)];
    if (opts['test-stability-temp-copy']) command.push('--temp-copy');
    if (opts['test-stability-keep-going']) command.push('--keep-going');
    if (opts['test-stability-iteration-timeout-ms']) {
      command.push('--iteration-timeout-ms', String(opts['test-stability-iteration-timeout-ms']));
    }
    const testStability = runStep({ name: 'test:stability', command }, cwd, Number(opts['test-stability-step-timeout-ms'] || Math.max(timeoutMs, repeat * 60 * 1000)));
    optionalEvidence = {
      included: true,
      name: 'test_stability',
      status: testStability.code === 0 ? 'pass' : 'fail',
      summary: testStability.parsed_json,
      code: testStability.code,
      timed_out: testStability.timed_out,
      duration_ms: testStability.duration_ms,
    };
  }
  const summary = buildSummary(results, { optionalEvidence });
  if (opts['summary-only']) printSummaryOnly(summary, Boolean(opts.json));
  else if (opts.json) process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  else printHuman(summary);
  process.exit(summary.decision === 'ready' ? 0 : 1);
}

module.exports = {
  DEFAULT_STEP_TIMEOUT_MS,
  STEPS,
  PREFLIGHT_ACTIVE_ENV,
  buildStepPlan,
  buildSummary,
  buildTopline,
  parseArgs,
  printSummaryOnly,
  runStep,
  summarizeText,
  tryParseJson,
};
if (require.main === module) main();
