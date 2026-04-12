#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const bridge = require('./eoc-bridge.js');
const scheduler = require('./eoc-scheduler.js');
const { runReviewGate } = require('./review-gate.js');
const { runCoverageCheck } = require('./coverage-check.js');

const ROOT = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function testUnsafeCommandBlocked() {
  let threw = false;
  try {
    bridge.bridgeFromPacket({
      objective: 'unsafe',
      tasks: [{ id: 'x', command: 'echo ok; echo bad', validation: 'node -e "process.exit(0)"' }],
    });
  } catch {
    threw = true;
  }
  assert(threw, 'unsafe shell operator should be blocked');
}

async function testReviewEvidenceRequired() {
  const runId = `RUN-${Date.now()}`;
  const r = runReviewGate({ runId, codeFile: '.tmp/missing-code.json', securityFile: '.tmp/missing-sec.json' });
  assert(!r.ok, 'review gate should fail when evidence files missing');
}

async function testReviewRunIdMismatchRejected() {
  const runId = `RUN-${Date.now()}-MISMATCH`;
  const code = path.join(ROOT, '.tmp', 'code-review-mismatch.json');
  const security = path.join(ROOT, '.tmp', 'security-review-mismatch.json');
  writeJson(code, {
    run_id: `${runId}-other`,
    generated_at: new Date().toISOString(),
    reviewer: 'external-code-reviewer',
    source: 'external',
    verdict: 'APPROVE',
    findings: [],
  });
  writeJson(security, {
    run_id: runId,
    generated_at: new Date().toISOString(),
    reviewer: 'external-security-reviewer',
    source: 'external',
    verdict: 'APPROVE',
    findings: [],
  });
  const r = runReviewGate({ runId, codeFile: code, securityFile: security });
  assert(!r.ok, 'review gate should reject run_id mismatch');
  fs.rmSync(code, { force: true });
  fs.rmSync(security, { force: true });
}

async function testCoverageThreshold() {
  const summary = path.join(ROOT, '.tmp', 'coverage-summary-test.json');
  writeJson(summary, { total: { lines: { pct: 79.9 } } });
  const fail = runCoverageCheck({ summary, threshold: 80 });
  assert(!fail.ok, 'coverage should fail below threshold');
  writeJson(summary, { total: { lines: { pct: 80 } } });
  const pass = runCoverageCheck({ summary, threshold: 80 });
  assert(pass.ok, 'coverage should pass at threshold');
  fs.rmSync(summary, { force: true });
}

async function testSafeSchedulerPath() {
  const packet = {
    objective: 'safe',
    tasks: [
      { id: 'a', command: 'node -e "console.log(\'a\')"', validation: 'node -e "process.exit(0)"', deps: [], priority: 120, owner_hint: 'qa' },
      { id: 'b', command: 'node -e "console.log(\'b\')"', validation: 'node -e "process.exit(0)"', deps: ['a'], priority: 100, owner_hint: 'qa' },
    ],
  };
  const run = bridge.bridgeFromPacket(packet, { 'plan-id': 'PLAN-REGRESSION' });
  await scheduler.runSchedulerById(run.run_id, { simulate: true });
  const done = scheduler.loadRun(run.run_id);
  assert(done.scheduler && done.scheduler.status === 'completed', 'scheduler should complete safe DAG');
}

async function testUltraworkRequiresGate5Evidence() {
  const script = fs.readFileSync(path.join(ROOT, 'scripts', 'eoc-ultrawork.js'), 'utf8');
  assert(script.includes("opts['docs-evidence']"), 'ultrawork should require docs evidence option');
  assert(script.includes("opts['archive-evidence']"), 'ultrawork should require archive evidence option');
  assert(script.includes('Missing required gate-5 evidence'), 'ultrawork should expose gate-5 evidence error');
}

async function runRegressionSuite() {
  await testUnsafeCommandBlocked();
  await testReviewEvidenceRequired();
  await testReviewRunIdMismatchRejected();
  await testCoverageThreshold();
  await testSafeSchedulerPath();
  await testUltraworkRequiresGate5Evidence();
  console.log('[regression-suite] PASS');
}

if (require.main === module) {
  runRegressionSuite().catch((err) => {
    console.error(`[regression-suite] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { runRegressionSuite };
