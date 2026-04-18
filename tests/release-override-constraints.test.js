const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { initCommittedGitRepo, makeBenchmarkResult, runNodeJson, runNodeResult, withTempDir, writeBenchmarkRun, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const SAFE_APPLY = path.join(ROOT, 'scripts', 'safe-apply.js');
const RELEASE_CHECK = path.join(ROOT, 'scripts', 'release-check.js');
const RELEASE_EVIDENCE = path.join(ROOT, 'scripts', 'release-evidence.js');
const RELEASE_OVERRIDE = path.join(ROOT, 'scripts', 'release-override.js');

function setupRepo(dir) {
  writeFiles(dir, {
    'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0', scripts: { test: 'node --test' } }, null, 2),
    '.gitignore': 'node_modules\n',
    'src/index.js': 'export const value = 1;\n',
  });
  initCommittedGitRepo(dir);
}


function prepareOverrideFixture(dir) {
  for (let i = 1; i <= 5; i += 1) {
    writeBenchmarkRun(dir, {
      run_id: `run-${i}`,
      completed_at: `2026-04-${String(i).padStart(2, '0')}T10:00:00.000Z`,
      results: [makeBenchmarkResult({ passed: true, task_success: true, failed_count: i === 5 ? 1 : 0, review_verdict: 'ACCEPT' })],
    });
  }
  runNodeJson(SAFE_APPLY, ['snapshot'], { cwd: dir });
}


test('production override rejects expiry beyond policy maximum', () => {
  withTempDir((dir) => {
    setupRepo(dir);
  }, (dir) => {
    const result = runNodeResult(RELEASE_OVERRIDE, ['request', '--policy', 'production', '--reason', 'temporary production waiver for narrow solo release', '--checks', 'benchmark.latest_comparison', '--expires-at', '2026-04-20T00:00:00.000Z', '--now', '2026-04-13T00:00:00.000Z', '--json'], { cwd: dir });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /max duration of 8 hours/);
  });
});

test('production override cannot bypass baseline approval blockers', () => {
  withTempDir((dir) => {
    setupRepo(dir);
  }, (dir) => {
    const requested = runNodeJson(RELEASE_OVERRIDE, ['request', '--policy', 'production', '--reason', 'temporary production waiver for missing benchmark approval', '--checks', 'benchmark.baseline_approval', '--expires-at', '2026-04-13T06:00:00.000Z', '--now', '2026-04-13T00:00:00.000Z', '--json'], { cwd: dir });
    runNodeJson(RELEASE_OVERRIDE, ['approve', '--id', requested.override_id, '--by', 'solo-author', '--json'], { cwd: dir });
    const result = runNodeResult(RELEASE_CHECK, ['--policy', 'production', '--override-id', requested.override_id, '--now', '2026-04-13T01:00:00.000Z', '--json'], { cwd: dir });
    const report = JSON.parse(result.stdout);
    assert.notEqual(report.decision, 'ready_with_override');
    assert.ok(report.policy_override.blocked_checks.includes('benchmark.baseline_approval'));
  });
});

test('standard override is exhausted after its maximum usage count', () => {
  withTempDir((dir) => {
    setupRepo(dir);
    prepareOverrideFixture(dir);
  }, (dir) => {
    const base = JSON.parse(runNodeResult(RELEASE_CHECK, ['--json'], { cwd: dir }).stdout);
    const checks = base.checks.filter((item) => item.status === 'warn' || item.status === 'fail').map((item) => item.check).join(',');
    const requested = runNodeJson(RELEASE_OVERRIDE, ['request', '--policy', 'standard', '--reason', 'temporary standard waiver for local solo release', '--checks', checks, '--expires-at', '2026-04-13T10:00:00.000Z', '--now', '2026-04-13T00:00:00.000Z', '--json'], { cwd: dir });
    runNodeJson(RELEASE_OVERRIDE, ['approve', '--id', requested.override_id, '--by', 'solo-author', '--json'], { cwd: dir });

    const first = runNodeJson(RELEASE_CHECK, ['--override-id', requested.override_id, '--now', '2026-04-13T01:00:00.000Z', '--json'], { cwd: dir });
    const second = runNodeJson(RELEASE_CHECK, ['--override-id', requested.override_id, '--now', '2026-04-13T02:00:00.000Z', '--json'], { cwd: dir });
    const status = runNodeJson(RELEASE_OVERRIDE, ['status', '--id', requested.override_id, '--policy', 'standard', '--now', '2026-04-13T03:00:00.000Z', '--json'], { cwd: dir });

    assert.equal(first.decision, 'ready_with_override');
    assert.equal(second.decision, 'ready_with_override');
    assert.equal(status.status, 'exhausted');
    assert.equal(status.ready, false);
  });
});

test('release evidence highlights override-based release decisions', () => {
  withTempDir((dir) => {
    setupRepo(dir);
    prepareOverrideFixture(dir);
  }, (dir) => {
    const base = JSON.parse(runNodeResult(RELEASE_CHECK, ['--json'], { cwd: dir }).stdout);
    const checks = base.checks.filter((item) => item.status === 'warn' || item.status === 'fail').map((item) => item.check).join(',');
    const requested = runNodeJson(RELEASE_OVERRIDE, ['request', '--policy', 'standard', '--reason', 'temporary standard waiver for evidence visibility', '--checks', checks, '--expires-at', '2026-04-13T10:00:00.000Z', '--now', '2026-04-13T00:00:00.000Z', '--json'], { cwd: dir });
    runNodeJson(RELEASE_OVERRIDE, ['approve', '--id', requested.override_id, '--by', 'solo-author', '--json'], { cwd: dir });
    const report = runNodeJson(RELEASE_EVIDENCE, ['--override-id', requested.override_id, '--now', '2026-04-13T01:00:00.000Z', '--json'], { cwd: dir });
    assert.equal(report.summary.override_release, true);
    assert.ok(report.summary.override_pressure);
    assert.equal(report.release_report.decision, 'ready_with_override');
    assert.equal(report.policy_overrides.active[0].usage_count, 1);
    assert.ok(report.policy_overrides.active[0].constraints.max_usage_count >= 1);
  });
});
