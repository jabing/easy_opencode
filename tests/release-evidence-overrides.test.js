const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { initCommittedGitRepo, makeBenchmarkResult, runNodeJson, runNodeResult, withTempDir, writeBenchmarkRun, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const SAFE_APPLY = path.join(ROOT, 'scripts', 'safe-apply.js');
const RELEASE_CHECK = path.join(ROOT, 'scripts', 'release-check.js');
const RELEASE_EVIDENCE = path.join(ROOT, 'scripts', 'release-evidence.js');
const RELEASE_OVERRIDE = path.join(ROOT, 'scripts', 'release-override.js');
const RELEASE_REHEARSAL = path.join(ROOT, 'scripts', 'release-rehearsal.js');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');

function writeHealthyRuns(dir) {
  for (let i = 1; i <= 8; i += 1) {
    writeBenchmarkRun(dir, {
      run_id: `run-${i}`,
      completed_at: `2026-04-${String(i).padStart(2, '0')}T10:00:00.000Z`,
      results: [makeBenchmarkResult({ passed: true, task_success: true, failed_count: 0, review_verdict: 'ACCEPT' })],
    });
  }
}

function prepareOverrideFixture(dir) {
  writeHealthyRuns(dir);
  writeBenchmarkRun(dir, {
    run_id: 'run-9',
    completed_at: '2026-04-09T10:00:00.000Z',
    results: [makeBenchmarkResult({ passed: true, task_success: true, failed_count: 1, review_verdict: 'ACCEPT' })],
  });
  runNodeJson(SAFE_APPLY, ['snapshot'], { cwd: dir });
}

test('release-check can apply an approved policy override with audit trail', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0', scripts: { test: 'node --test' } }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'export const value = 1;\n',
    });
    initCommittedGitRepo(dir);
    prepareOverrideFixture(dir);
  }, (dir) => {
    const base = JSON.parse(runNodeResult(RELEASE_CHECK, ['--json'], { cwd: dir }).stdout);
    assert.equal(base.decision, 'blocked');
    const checks = base.checks.filter((item) => item.status === 'warn' || item.status === 'fail').map((item) => item.check).join(',');
    const requested = runNodeJson(RELEASE_OVERRIDE, ['request', '--policy', 'standard', '--reason', 'temporary local trial for solo author release', '--checks', checks, '--expires-at', '2026-04-13T12:00:00.000Z', '--now', '2026-04-13T00:00:00.000Z', '--json'], { cwd: dir });
    const approved = runNodeJson(RELEASE_OVERRIDE, ['approve', '--id', requested.override_id, '--by', 'qa-lead', '--json'], { cwd: dir });
    assert.equal(approved.status, 'approved');

    const overridden = runNodeJson(RELEASE_CHECK, ['--override-id', requested.override_id, '--json'], { cwd: dir });
    assert.equal(overridden.decision, 'ready_with_override');
    assert.equal(overridden.policy_override.applied, true);
    assert.deepEqual(overridden.policy_override.missing_checks, []);

    const overrideStatus = runNodeJson(RELEASE_OVERRIDE, ['status', '--id', requested.override_id, '--policy', 'standard', '--json'], { cwd: dir });
    assert.equal(overrideStatus.ready, true);
    assert.ok(Array.isArray(overrideStatus.usage));
    assert.equal(overrideStatus.usage.length, 1);
    assert.equal(overrideStatus.usage[0].decision_after, 'ready_with_override');
  });
});

test('release-evidence summarizes release state, rehearsal, and active overrides', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0', scripts: { test: 'node --test' } }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'export const value = 1;\n',
    });
    initCommittedGitRepo(dir);
    writeHealthyRuns(dir);
    runNodeJson(BENCHMARK_SUITE, ['baseline', '--name', 'release', '--latest', '--json'], { cwd: dir });
    runNodeJson(BENCHMARK_SUITE, ['approve', '--name', 'release', '--json'], { cwd: dir });
    const requested = runNodeJson(RELEASE_OVERRIDE, ['request', '--policy', 'production', '--reason', 'temporary production regression acceptance for solo author release', '--checks', 'benchmark.latest_comparison', '--expires-at', '2026-04-13T06:00:00.000Z', '--now', '2026-04-13T00:00:00.000Z', '--json'], { cwd: dir });
    runNodeJson(RELEASE_OVERRIDE, ['approve', '--id', requested.override_id, '--by', 'release-manager', '--json'], { cwd: dir });
    execFileSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' });
    execFileSync('git', ['commit', '-qm', 'record release evidence fixtures'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'tester', GIT_AUTHOR_EMAIL: 'tester@example.com', GIT_COMMITTER_NAME: 'tester', GIT_COMMITTER_EMAIL: 'tester@example.com' } });
  }, (dir) => {
    const rehearsal = runNodeResult(RELEASE_REHEARSAL, ['--policy', 'production', '--json'], { cwd: dir });
    assert.equal(rehearsal.code, 0);
    const report = runNodeJson(RELEASE_EVIDENCE, ['--policy', 'production', '--json'], { cwd: dir });
    assert.equal(report.summary.release_policy, 'production');
    assert.equal(report.summary.baseline_status, 'present');
    assert.equal(report.summary.approval_status, 'approved');
    assert.equal(report.summary.latest_rehearsal_decision, 'ready');
    assert.match(report.summary.final_decision_summary, /decision=ready/);
    assert.equal(report.summary.topline.release_decision, 'ready');
    assert.equal(report.summary.topline.baseline_approved, true);
    assert.equal(report.summary.topline.rollback_ready, true);
    assert.equal(report.summary.rollback_ready, true);
    assert.equal(report.policy_overrides.active.length, 1);
    assert.ok(report.latest_rehearsal);
    assert.ok(report.observability.event_summary.event_count >= 1);
  });
});
