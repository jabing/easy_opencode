const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, runNodeResult, withTempDir, writeFiles, writeBenchmarkRun, makeBenchmarkResult, initCommittedGitRepo } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_FEEDBACK = path.join(ROOT, 'scripts', 'benchmark-feedback.js');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');
const RELEASE_CHECK = path.join(ROOT, 'scripts', 'release-check.js');
const SAFE_APPLY = path.join(ROOT, 'scripts', 'safe-apply.js');

function writeHealthyRun(dir, runId, completedAt) {
  writeBenchmarkRun(dir, {
    run_id: runId,
    completed_at: completedAt,
    results: [
      makeBenchmarkResult({
        runtime: 'node',
        framework: 'express',
        task_family: 'endpoint',
        selected_skill: 'add-express-route',
        passed: true,
        task_success: true,
        failed_count: 0,
        review_verdict: 'ACCEPT',
      }),
    ],
  });
}

test('benchmark-feedback reports benchmark freshness and blocks expired evidence', () => {
  withTempDir((dir) => {
    for (let i = 1; i <= 5; i += 1) {
      writeHealthyRun(dir, `run-${i}`, `2026-02-0${i}T10:00:00.000Z`);
    }
  }, (dir) => {
    const report = runNodeJson(BENCHMARK_FEEDBACK, ['report', '--runtime', 'node', '--framework', 'express', '--task-family', 'endpoint', '--policy', 'standard', '--now', '2026-04-12T00:00:00.000Z', '--json'], { cwd: dir });
    assert.equal(report.freshness.status, 'expired');
    assert.equal(report.release_readiness.status, 'blocked');
    assert.match(report.release_readiness.reasons.join(' | '), /expired/i);
  });
});

test('benchmark-suite freshness summarizes age buckets under a chosen policy', () => {
  withTempDir((dir) => {
    writeHealthyRun(dir, 'run-fresh', '2026-04-10T10:00:00.000Z');
    writeHealthyRun(dir, 'run-aging', '2026-03-27T10:00:00.000Z');
    writeHealthyRun(dir, 'run-expired', '2026-02-20T10:00:00.000Z');
  }, (dir) => {
    const report = runNodeJson(BENCHMARK_SUITE, ['freshness', '--policy', 'standard', '--now', '2026-04-12T00:00:00.000Z', '--json'], { cwd: dir });
    assert.equal(report.latest_status, 'fresh');
    assert.equal(report.by_status.fresh, 1);
    assert.equal(report.by_status.aging, 1);
    assert.equal(report.by_status.expired, 1);
    assert.equal(report.stale_runs.length, 1);
    assert.equal(report.stale_runs[0].run_id, 'run-expired');
  });
});

test('release-check policy tiers differentiate standard and production readiness', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'fixture-node',
        version: '1.0.0',
        scripts: { test: 'node --test' },
      }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'export const value = 1;\n',
      'tests/placeholder.test.js': "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('ok', () => { assert.equal(1, 1); });\n",
    });
    initCommittedGitRepo(dir);
    for (let i = 1; i <= 8; i += 1) {
      const day = String(i + 2).padStart(2, '0');
      writeHealthyRun(dir, `run-${i}`, `2026-04-${day}T10:00:00.000Z`);
    }
  }, (dir) => {
    runNodeJson(SAFE_APPLY, ['snapshot', '--label', 'release-check'], { cwd: dir });
    const standard = runNodeJson(RELEASE_CHECK, ['--policy', 'standard', '--now', '2026-04-12T00:00:00.000Z', '--json'], { cwd: dir });
    assert.equal(standard.selected_policy.id, 'standard');
    assert.equal(standard.decision, 'ready');

    const productionBlocked = runNodeResult(RELEASE_CHECK, ['--policy', 'production', '--now', '2026-04-12T00:00:00.000Z', '--json'], { cwd: dir });
    assert.notEqual(productionBlocked.code, 0);
    const blockedReport = JSON.parse(productionBlocked.stdout);
    const baselineCheck = blockedReport.checks.find((item) => item.check === 'benchmark.baseline_comparison');
    assert.ok(baselineCheck);
    assert.equal(baselineCheck.status, 'warn');
    assert.match(baselineCheck.detail, /required by policy=production/i);

    runNodeJson(BENCHMARK_SUITE, ['baseline', '--name', 'release', '--latest', '--json'], { cwd: dir });
    const approvalBlocked = runNodeResult(RELEASE_CHECK, ['--policy', 'production', '--now', '2026-04-12T00:00:00.000Z', '--json'], { cwd: dir });
    assert.notEqual(approvalBlocked.code, 0);
    const approvalBlockedReport = JSON.parse(approvalBlocked.stdout);
    const approvalCheck = approvalBlockedReport.checks.find((item) => item.check === 'benchmark.baseline_approval');
    assert.ok(approvalCheck);
    assert.equal(approvalCheck.status, 'warn');

    runNodeJson(BENCHMARK_SUITE, ['approve', '--name', 'release', '--approver', 'qa-lead', '--json'], { cwd: dir });
    const productionReady = runNodeJson(RELEASE_CHECK, ['--policy', 'production', '--now', '2026-04-12T00:00:00.000Z', '--json'], { cwd: dir });
    assert.equal(productionReady.selected_policy.id, 'production');
    assert.equal(productionReady.decision, 'ready');
  });
});
