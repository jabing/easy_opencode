const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, runNodeResult, withTempDir, writeFiles, writeBenchmarkRun, makeBenchmarkResult, initCommittedGitRepo } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');
const RELEASE_CHECK = path.join(ROOT, 'scripts', 'release-check.js');

function writeRun(dir, runId, completedAt, options = {}) {
  writeBenchmarkRun(dir, {
    run_id: runId,
    completed_at: completedAt,
    results: [
      makeBenchmarkResult({
        runtime: 'node',
        framework: 'express',
        task_family: 'endpoint',
        selected_skill: 'add-express-route',
        passed: options.passed,
        task_success: options.task_success,
        failed_count: options.failed_count,
        review_verdict: options.review_verdict,
      }),
    ],
  });
}

test('benchmark-suite can save, list, and compare named baselines', () => {
  withTempDir((dir) => {
    writeRun(dir, 'run-good', '2026-04-01T10:00:00.000Z', { passed: true, task_success: true, failed_count: 0, review_verdict: 'ACCEPT' });
    writeRun(dir, 'run-bad', '2026-04-02T10:00:00.000Z', { passed: false, task_success: false, failed_count: 2, review_verdict: 'BLOCK' });
  }, (dir) => {
    const baseline = runNodeJson(BENCHMARK_SUITE, ['baseline', '--name', 'release', '--from', 'run-good', '--json'], { cwd: dir });
    assert.equal(baseline.name, 'release');
    assert.equal(baseline.baseline_summary.run_id, 'run-good');

    const listing = runNodeJson(BENCHMARK_SUITE, ['baseline', '--list', '--json'], { cwd: dir });
    assert.equal(listing.baselines.length, 1);
    assert.equal(listing.baselines[0].name, 'release');

    const comparison = runNodeJson(BENCHMARK_SUITE, ['compare', '--baseline-name', 'release', '--current', 'run-bad', '--allow-regressions', '--json'], { cwd: dir });
    assert.equal(comparison.baseline_name, 'release');
    assert.equal(comparison.comparison.summary.regressed, 1);
    assert.equal(comparison.comparison.current_run_id, 'run-bad');
  });
});

test('release-check surfaces named benchmark baseline regressions as warnings', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0', scripts: { test: 'node --test' } }, null, 2),
      'src/index.js': 'export const value = 1;\n',
      '.gitignore': 'node_modules\n',
    });
    initCommittedGitRepo(dir);
    writeRun(dir, 'run-good', '2026-04-01T10:00:00.000Z', { passed: true, task_success: true, failed_count: 0, review_verdict: 'ACCEPT' });
    writeRun(dir, 'run-bad', '2026-04-02T10:00:00.000Z', { passed: false, task_success: false, failed_count: 2, review_verdict: 'BLOCK' });
    runNodeJson(BENCHMARK_SUITE, ['baseline', '--name', 'release', '--from', 'run-good', '--json'], { cwd: dir });
  }, (dir) => {
    const result = runNodeResult(RELEASE_CHECK, ['--json'], { cwd: dir });
    assert.notEqual(result.code, 0);
    const report = JSON.parse(result.stdout);
    const baselineCheck = report.checks.find((item) => item.check === 'benchmark.baseline_comparison');
    assert.ok(baselineCheck);
    assert.equal(baselineCheck.status, 'warn');
    assert.match(baselineCheck.detail, /baseline=release/i);
    assert.equal(report.benchmark_baseline.name, 'release');
  });
});
