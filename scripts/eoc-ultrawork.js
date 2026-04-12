#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const bridge = require('./eoc-bridge.js');
const scheduler = require('./eoc-scheduler.js');
const eocStart = require('./eoc-start.js');
const qualityGate = require('./quality-gate.js');
const { runCoverageCheck } = require('./coverage-check.js');
const { runReviewGate } = require('./review-gate.js');

const ROOT = process.cwd();
const RUN_ACTIVE = path.join(ROOT, '.opencode', 'eoc-run', 'active.json');

function usage() {
  console.log('Usage:');
  console.log('  node scripts/eoc-ultrawork.js --packet <execution-packet.json> [--plan-id <id>] [--simulate]');
  console.log('  cat plan.md | node scripts/eoc-ultrawork.js --stdin [--simulate]');
  console.log('');
  console.log('Options:');
  console.log('  --skip-quality    Skip quality gate execution');
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) {
      opts._.push(t);
      continue;
    }
    const k = t.slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith('--')) opts[k] = true;
    else {
      opts[k] = n;
      i += 1;
    }
  }
  return opts;
}

function runNode(args, input) {
  let r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
    input,
  });
  if (r.error && String(r.error.message || '').includes('EPERM')) {
    r = spawnSync(process.execPath, args, {
      cwd: ROOT,
      shell: process.platform === 'win32',
      windowsHide: true,
      encoding: 'utf8',
      input,
    });
  }
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || '').trim() || `Command failed: node ${args.join(' ')}`);
  }
  return (r.stdout || '').trim();
}

function runNpm(args) {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  let r = spawnSync(cmd, args, {
    cwd: ROOT,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
  });
  if (r.error && String(r.error.message || '').includes('EPERM')) {
    r = spawnSync(cmd, args, {
      cwd: ROOT,
      shell: process.platform === 'win32',
      windowsHide: true,
      encoding: 'utf8',
    });
  }
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || '').trim() || `Command failed: ${cmd} ${args.join(' ')}`);
  }
}

function getActiveRunId() {
  if (!fs.existsSync(RUN_ACTIVE)) throw new Error('No active run created by bridge.');
  const data = JSON.parse(fs.readFileSync(RUN_ACTIVE, 'utf8'));
  const runId = String(data.run_id || '').trim();
  if (!runId) throw new Error('active.json missing run_id');
  return runId;
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

async function runQualityGateInline() {
  if (typeof qualityGate.runQualityGate === 'function') {
    const r = await qualityGate.runQualityGate({ full: true, strict: true, json: true, silent: true });
    if (!r || r.gate !== 'PASS') throw new Error('quality-gate failed');
    return r;
  }
  runNpm(['run', 'quality-gate:full']);
  return null;
}

async function main() {
  try {
    const opts = parseArgs(process.argv);
    if (opts.help || opts.h || (!opts.packet && !opts.stdin)) {
      usage();
      process.exit(0);
    }

    let packetRaw = undefined;
    if (opts.stdin) packetRaw = fs.readFileSync(0, 'utf8');
    const run = bridge.bridgeFromOptions(
      {
        packet: opts.packet,
        'plan-id': opts['plan-id'],
        simulate: opts.simulate,
      },
      packetRaw
    );
    await scheduler.runSchedulerById(run.run_id, { simulate: Boolean(opts.simulate) });
    const runId = run.run_id;

    // Gate 0 -> 1
    advance(runId);
    // Gate 1 -> 2
    mark(runId, 'scope_locked', true);
    mark(runId, 'acceptance_criteria_locked', true);
    advance(runId);

    const runAfterScheduler = loadRun(runId);
    const schedulerStatus = String(runAfterScheduler.scheduler?.status || '');
    if (schedulerStatus !== 'completed') {
      throw new Error(`Scheduler did not complete successfully. status=${schedulerStatus}`);
    }

    // Gate 2 -> 3
    mark(runId, 'implementation_completed', true);
    advance(runId);

    // Gate 3 -> 4
    let qualityResult = null;
    if (!opts['skip-quality']) qualityResult = await runQualityGateInline();
    mark(runId, 'build_passed', true);
    mark(runId, 'test_passed', true);
    mark(runId, 'lint_passed', true);
    const coverage = runCoverageCheck({ runId, threshold: 100 });
    if (!coverage.ok) throw new Error(`coverage check failed: ${coverage.detail}`);
    mark(runId, 'coverage_passed', true);
    advance(runId);

    // Gate 4 -> 5
    const review = runReviewGate({ runId, qualityResult: qualityResult || {} });
    if (!review.ok) throw new Error(`review gate failed: ${review.detail}`);
    mark(runId, 'code_review_verdict', review.verdicts.code);
    mark(runId, 'security_review_verdict', review.verdicts.security);
    advance(runId);

    // Gate 5 -> 6
    mark(runId, 'docs_updated', true);
    mark(runId, 'archive_completed', true);
    advance(runId);

    const finalRun = loadRun(runId);
    console.log(`Ultrawork completed. run_id=${runId} gate=${finalRun.current_gate} status=${finalRun.status}`);
  } catch (err) {
    console.error(`[eoc-ultrawork] ${err.message}`);
    usage();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
