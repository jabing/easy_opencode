#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { generateReleaseEvidence, readLatestReleaseRehearsal } = require('../src/core/release/evidence.js');
const { runReleaseCheck } = require('../src/core/release/check.js');
const { readBenchmarkBaseline } = require('../src/core/benchmark/baselines.js');
const { resolveApprovalStatus } = require('../src/core/benchmark/baseline-approvals.js');
const { listPolicyOverrides } = require('../src/core/release/policy-overrides.js');
const { readEvents } = require('../src/control-plane/observability/index.js');
const {
  buildReleaseConclusion,
  buildReleaseConclusionEnvelope,
  buildReleaseConclusionLegacySummary,
  normalizeReleaseConclusion,
} = require('../src/core/release/conclusion.js');
const { buildReleaseAuditSummary } = require('../src/core/release/audit-summary.js');

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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stable(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveOutputPath(rootDir, opts) {
  if (opts.out) return path.resolve(rootDir, String(opts.out));
  const dir = path.join(rootDir, '.opencode', 'observability', 'release-audits');
  ensureDir(dir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(dir, `release-audit-${stamp}.json`);
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(stable(data), null, 2) + '\n', 'utf8');
}

function writeText(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(data), 'utf8');
}


function buildAuditHomepage(bundle) {
  const conclusion = normalizeReleaseConclusion(bundle.release_conclusion || {});
  const summary = bundle.evidence && bundle.evidence.summary ? bundle.evidence.summary : {};
  return buildReleaseAuditSummary({
    generated_at: bundle.generated_at,
    policy: bundle.policy,
    baseline_name: bundle.baseline_name,
    release_conclusion: conclusion,
    final_decision_summary: summary.final_decision_summary || conclusion.reason,
    why_blocked_or_caution: Array.isArray(summary.why_blocked_or_caution) ? summary.why_blocked_or_caution.slice(0, 5) : [],
    benchmark_readiness: summary.benchmark_readiness || 'unknown',
    benchmark_freshness: summary.benchmark_freshness || 'unknown',
    baseline_status: summary.baseline_status || 'unknown',
    approval_status: summary.approval_status || 'unknown',
    latest_rehearsal_decision: summary.latest_rehearsal_decision || 'unknown',
    rollback_ready: conclusion.rollback_ready,
    override_pressure: {
      status: conclusion.override_pressure_status,
      last_30_days_count: conclusion.override_pressure_last_30_days,
    },
    entrypoints: {
      manifest: 'manifest.json',
      summary: 'summary.json',
      readme: 'README.md',
      evidence: 'evidence.json',
      release_check: 'release-check.json',
      rehearsal: 'rehearsal.json',
      baseline: 'baseline.json',
      approval: 'approval.json',
      overrides: 'overrides.json',
      observability_events: 'observability-events.json',
      bundle: 'bundle.json',
    },
  });
}

function renderAuditReadme(homepage) {
  const c = homepage.release_conclusion || {};
  const reasons = Array.isArray(homepage.why_blocked_or_caution) && homepage.why_blocked_or_caution.length > 0
    ? homepage.why_blocked_or_caution
    : [homepage.final_decision_summary || c.reason || 'release conclusion unavailable'];
  return [
    '# Release Audit Summary',
    '',
    `- Decision: ${c.release_decision || 'unknown'}`,
    `- Ready state: ${c.ready_state || c.release_decision || 'unknown'}`,
    `- Policy: ${homepage.policy || c.release_policy || 'unknown'}`,
    `- Baseline: ${c.selected_baseline_name || homepage.baseline_name || 'n/a'}`,
    `- Canonical baseline: ${c.canonical_baseline_name || 'n/a'}`,
    `- Baseline approved: ${c.baseline_approved === true ? 'yes' : 'no'}`,
    `- Benchmark fresh enough: ${c.benchmark_fresh_enough === true ? 'yes' : 'no'}`,
    `- Rollback ready: ${c.rollback_ready === true ? 'yes' : 'no'}`,
    `- Override pressure: ${c.override_pressure_status || 'unknown'} (last_30_days=${Number(c.override_pressure_last_30_days || 0)})`,
    '',
    '## Why blocked / caution',
    '',
    ...reasons.map((item) => `- ${item}`),
    '',
    '## Audit bundle entrypoints',
    '',
    `- summary.json`,
    `- manifest.json`,
    `- evidence.json`,
    `- release-check.json`,
    `- rehearsal.json`,
    `- baseline.json`,
    `- approval.json`,
    `- overrides.json`,
    `- observability-events.json`,
    `- bundle.json`,
    '',
  ].join('\n');
}

function buildBundle(rootDir, opts) {
  const policy = String(opts.policy || 'production');
  const requestedBaselineName = opts['baseline-name'] ? String(opts['baseline-name']) : null;
  const releaseCheck = runReleaseCheck(rootDir, { policy, baselineName: requestedBaselineName || null });
  const baselineName = releaseCheck && releaseCheck.benchmark_baseline_naming && releaseCheck.benchmark_baseline_naming.selected_name
    ? releaseCheck.benchmark_baseline_naming.selected_name
    : String(requestedBaselineName || 'release');
  const eventLimit = Number(opts['event-limit'] || 100);
  const evidence = generateReleaseEvidence(rootDir, { policy, baselineName, eventLimit });
  const releaseConclusion = evidence && evidence.summary && (evidence.summary.release_conclusion || evidence.summary.topline)
    ? normalizeReleaseConclusion(evidence.summary.release_conclusion || evidence.summary.topline)
    : buildReleaseConclusion({
        release_decision: evidence && evidence.summary ? evidence.summary.release_decision : 'unknown',
        release_policy: policy,
        rollback_ready: evidence && evidence.summary ? evidence.summary.rollback_ready : false,
        override_pressure_status: evidence && evidence.summary && evidence.summary.override_pressure ? evidence.summary.override_pressure.status : 'unknown',
        override_pressure_last_30_days: evidence && evidence.summary && evidence.summary.override_pressure ? evidence.summary.override_pressure.last_30_days_count : 0,
        baseline_approved: evidence && evidence.summary ? evidence.summary.approval_status === 'approved' : false,
        benchmark_fresh_enough: evidence && evidence.summary ? (evidence.summary.benchmark_freshness === 'fresh' || evidence.summary.benchmark_freshness === 'aging') : false,
        canonical_baseline_name: releaseCheck && releaseCheck.benchmark_baseline_naming ? releaseCheck.benchmark_baseline_naming.recommended_name : null,
        selected_baseline_name: baselineName,
        reason: evidence && evidence.summary ? evidence.summary.final_decision_summary : 'release conclusion unavailable',
      });
  const generatedAt = new Date().toISOString();
  const homepage = buildAuditHomepage({
    generated_at: generatedAt,
    policy,
    baseline_name: baselineName,
    release_conclusion: releaseConclusion,
    evidence,
  });
  return {
    schema_version: '1.4',
    generated_at: generatedAt,
    root_dir: rootDir,
    policy,
    baseline_name: baselineName,
    release_conclusion: releaseConclusion,
    homepage,
    manifest: {
      policy,
      baseline_name: baselineName,
      requested_baseline_name: requestedBaselineName,
      release_decision: releaseConclusion.release_decision,
      override_pressure: releaseConclusion.override_pressure_status,
      rollback_ready: releaseConclusion.rollback_ready,
      release_conclusion: releaseConclusion,
      release_conclusion_schema: buildReleaseConclusionEnvelope(releaseConclusion),
      release_conclusion_legacy: buildReleaseConclusionLegacySummary(releaseConclusion),
      homepage,
      opening_summary: [
        `decision=${releaseConclusion.release_decision}`,
        `reason=${releaseConclusion.reason}`,
        `baseline=${releaseConclusion.selected_baseline_name || baselineName}`,
        `rollback_ready=${releaseConclusion.rollback_ready}`,
        `override_pressure=${releaseConclusion.override_pressure_status}` ,
      ],
      included_sections: ['summary', 'readme', 'evidence', 'release_check', 'rehearsal', 'baseline', 'approval', 'overrides', 'observability_events'],
    },
    evidence,
    release_check: releaseCheck,
    rehearsal: readLatestReleaseRehearsal(rootDir),
    baseline: readBenchmarkBaseline(rootDir, baselineName),
    approval: resolveApprovalStatus(rootDir, baselineName),
    overrides: listPolicyOverrides(rootDir),
    observability_events: readEvents(rootDir, { limit: eventLimit, reverse: false }),
  };
}

function exportDirectory(dir, bundle) {
  ensureDir(dir);
  writeJson(path.join(dir, 'manifest.json'), bundle.manifest);
  writeJson(path.join(dir, 'summary.json'), bundle.homepage);
  writeText(path.join(dir, 'README.md'), renderAuditReadme(bundle.homepage));
  writeJson(path.join(dir, 'evidence.json'), bundle.evidence);
  writeJson(path.join(dir, 'release-check.json'), bundle.release_check);
  writeJson(path.join(dir, 'rehearsal.json'), bundle.rehearsal);
  writeJson(path.join(dir, 'baseline.json'), bundle.baseline);
  writeJson(path.join(dir, 'approval.json'), bundle.approval);
  writeJson(path.join(dir, 'overrides.json'), bundle.overrides);
  writeJson(path.join(dir, 'observability-events.json'), bundle.observability_events);
  writeJson(path.join(dir, 'bundle.json'), bundle);
}

function main() {
  try {
    const opts = parseArgs(process.argv);
    const rootDir = path.resolve(String(opts.root || process.cwd()));
    const bundle = buildBundle(rootDir, opts);
    const out = resolveOutputPath(rootDir, opts);
    if (opts.dir) {
      exportDirectory(out, bundle);
      if (opts.json) process.stdout.write(JSON.stringify({ decision: 'exported', type: 'directory', file: out }, null, 2) + '\n');
      else console.log(`Release audit exported: ${out}`);
      return;
    }
    writeJson(out, bundle);
    if (opts.json) process.stdout.write(JSON.stringify({ decision: 'exported', type: 'file', file: out }, null, 2) + '\n');
    else console.log(`Release audit exported: ${out}`);
  } catch (error) {
    console.error(`[release-audit-export] ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { buildAuditHomepage, buildBundle, exportDirectory, parseArgs, renderAuditReadme, resolveOutputPath, stable };
