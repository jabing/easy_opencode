#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const bridge = require('./eoc-bridge.js');
const scheduler = require('../src/cli/eoc-scheduler-cli.js');
const eocStart = require('./eoc-start.js');
const qualityGate = require('./quality-gate.js');
const { runCoverageCheck } = require('./coverage-check.js');
const { runReviewGate } = require('./review-gate.js');
const { normalizeWorkdir } = require('../src/control-plane/policy/execution-policy.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { executeEocUltraworkWorkflow } = require('../src/control-plane/workflows/eoc-ultrawork.js');
const { parseArgs } = require('../src/shared/cli.js');

const ROOT = process.cwd();

function usage() {
  console.log('Usage:');
  console.log(`  ${formatManagedInvocation('eoc-ultrawork', ['--packet', '<execution-packet.json>', '--scope-evidence', '<file>', '--implementation-evidence', '<file>', '--code-review', '<file>', '--security-review', '<file>', '--docs-evidence', '<file>', '--archive-evidence', '<file>', '--plan-id', '<id>', '--simulate'])}`);
  console.log(`  cat plan.md | ${formatManagedInvocation('eoc-ultrawork', ['--stdin', '--scope-evidence', '<file>', '--implementation-evidence', '<file>', '--code-review', '<file>', '--security-review', '<file>', '--docs-evidence', '<file>', '--archive-evidence', '<file>', '--simulate'])}`);
}

function runNpm(args) {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || '').trim() || `Command failed: ${cmd} ${args.join(' ')}`);
  }
}

function mark(runId, field, value) {
  return eocStart.markField(runId, field, value);
}

function advance(runId) {
  const res = eocStart.advanceGate(runId);
  if (!res.advanced && res.reason === 'blocked') {
    throw new Error(`Gate blocked: ${(res.unmet || []).join(', ')}`);
  }
  if (!res.advanced && res.reason !== 'final') {
    throw new Error(`Cannot advance gate. reason=${res.reason}`);
  }
  return res;
}

function loadRun(runId) {
  const p = path.join(ROOT, '.opencode', 'eoc-run', `${runId}.json`);
  if (!fs.existsSync(p)) throw new Error(`Run not found: ${runId}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function assertEvidenceFile(filePath, runId, kind) {
  if (!filePath) throw new Error(`Missing required ${kind} evidence file.`);
  const absolute = normalizeWorkdir(path.resolve(ROOT, String(filePath)), ROOT, `${kind}-evidence`);
  if (!fs.existsSync(absolute)) {
    throw new Error(`${kind} evidence file not found: ${absolute}`);
  }
  const raw = fs.readFileSync(absolute, 'utf8').trim();
  if (!raw) throw new Error(`${kind} evidence file is empty: ${absolute}`);
  if (absolute.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(raw);
    const evidenceRunId = String(parsed.run_id || '').trim();
    if (!evidenceRunId) {
      throw new Error(`${kind} evidence missing run_id: ${absolute}`);
    }
    if (evidenceRunId !== runId) {
      throw new Error(`${kind} evidence run_id mismatch: expected=${runId} got=${evidenceRunId}`);
    }
  }
}

async function runQualityGateInline() {
  if (typeof qualityGate.runQualityGate === 'function') {
    const r = await qualityGate.runQualityGate({ full: true, strict: true, json: true, silent: true });
    if (!r || r.gate !== 'PASS') throw new Error('quality-gate failed');
    return r;
  }
  runNpm(['run', 'quality-gate:full']);
  return null;
}

async function runUltrawork(opts, packetRaw) {
  if (opts.help || opts.h || (!opts.packet && !opts.stdin)) {
    return { ok: false, usage: true };
  }
  if (!opts['scope-evidence'] || !opts['implementation-evidence']) {
    throw new Error('Missing required implementation evidence. Provide --scope-evidence <file> and --implementation-evidence <file>.');
  }
  if (!opts['code-review'] || !opts['security-review']) {
    throw new Error('Missing required review evidence. Provide --code-review <file> and --security-review <file>.');
  }
  if (!opts['docs-evidence'] || !opts['archive-evidence']) {
    throw new Error('Missing required gate-5 evidence. Provide --docs-evidence <file> and --archive-evidence <file>.');
  }

  const run = bridge.bridgeFromOptions(
    {
      packet: opts.packet,
      'plan-id': opts['plan-id'],
      simulate: opts.simulate,
    },
    packetRaw
  );
  const runId = run.run_id;
  const workflowContext = {
    opts,
    rootDir: ROOT,
    run,
    runScheduler: async () => {
      await scheduler.runSchedulerById(runId, { simulate: Boolean(opts.simulate) });
      return 'scheduler completed';
    },
    advanceFromBacklog: () => {
      advance(runId);
      return 'gate advanced to scope lock';
    },
    lockScopeEvidence: () => {
      assertEvidenceFile(opts['scope-evidence'], runId, 'scope');
      mark(runId, 'scope_locked', true);
      mark(runId, 'acceptance_criteria_locked', true);
      advance(runId);
      const runAfterScheduler = loadRun(runId);
      const schedulerStatus = String(runAfterScheduler.scheduler?.status || '');
      if (schedulerStatus !== 'completed') {
        throw new Error(`Scheduler did not complete successfully. status=${schedulerStatus}`);
      }
      return 'scope locked';
    },
    markImplementationComplete: () => {
      assertEvidenceFile(opts['implementation-evidence'], runId, 'implementation');
      mark(runId, 'implementation_completed', true);
      advance(runId);
      return 'implementation completed';
    },
    runQualityGateAndCoverage: async () => {
      await runQualityGateInline();
      mark(runId, 'build_passed', true);
      mark(runId, 'test_passed', true);
      mark(runId, 'lint_passed', true);
      const coverage = runCoverageCheck({
        summary: path.join(ROOT, 'coverage', 'coverage-summary.json'),
        threshold: 80,
      });
      if (!coverage.ok) throw new Error(`coverage check failed: ${coverage.detail}`);
      mark(runId, 'coverage_passed', true);
      advance(runId);
      return 'quality gate and coverage passed';
    },
    runReviewStage: () => {
      const review = runReviewGate({
        runId,
        codeFile: opts['code-review'],
        securityFile: opts['security-review'],
      });
      if (!review.ok) throw new Error(`review gate failed: ${review.detail}`);
      mark(runId, 'code_review_verdict', review.verdicts.code);
      mark(runId, 'security_review_verdict', review.verdicts.security);
      advance(runId);
      return 'review gate passed';
    },
    finalizeDocsAndArchive: () => {
      assertEvidenceFile(opts['docs-evidence'], runId, 'docs');
      assertEvidenceFile(opts['archive-evidence'], runId, 'archive');
      mark(runId, 'docs_updated', true);
      mark(runId, 'archive_completed', true);
      advance(runId);
      return 'docs and archive completed';
    },
  };

  await executeEocUltraworkWorkflow(workflowContext);
  const finalRun = loadRun(runId);
  return { ok: true, runId, gate: finalRun.current_gate, status: finalRun.status };
}

async function mainForTesting() {
  try {
    const opts = parseArgs(process.argv);
    let packetRaw = undefined;
    if (opts.stdin) packetRaw = fs.readFileSync(0, 'utf8');
    const result = await runUltrawork(opts, packetRaw);
    if (result && result.usage) {
      usage();
      process.exit(0);
    }
    console.log(`Ultrawork completed. run_id=${result.runId} gate=${result.gate} status=${result.status}`);
  } catch (err) {
    console.error(`[eoc-ultrawork] ${err.message}`);
    usage();
    process.exit(1);
  }
}

if (require.main === module) {
  mainForTesting();
}

module.exports = { mainForTesting, runUltrawork };
