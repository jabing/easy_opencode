const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, runNodeResult, withTempDir, writeFiles, initCommittedGitRepo, writeBenchmarkRun, makeBenchmarkResult } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');
const RELEASE_CHECK = path.join(ROOT, 'scripts', 'release-check.js');
const RELEASE_REHEARSAL = path.join(ROOT, 'scripts', 'release-rehearsal.js');

function writeHealthyRuns(dir) {
  for (let i = 1; i <= 6; i += 1) {
    writeBenchmarkRun(dir, {
      run_id: `run-${i}`,
      completed_at: `2026-04-${String(i).padStart(2, '0')}T10:00:00.000Z`,
      results: [makeBenchmarkResult({ passed: true, task_success: true, failed_count: 0, review_verdict: 'ACCEPT' })],
    });
  }
}

test('release-check emits a shared release conclusion object', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0', scripts: { test: 'node --test' }, dependencies: { express: '^4.0.0' } }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'module.exports = {}\n',
    });
    initCommittedGitRepo(dir);
    writeHealthyRuns(dir);
    runNodeJson(BENCHMARK_SUITE, ['baseline', '--profile', 'node-api', '--policy', 'production', '--latest', '--json'], { cwd: dir });
    runNodeJson(BENCHMARK_SUITE, ['approve', '--profile', 'node-api', '--policy', 'production', '--json'], { cwd: dir });
  }, (dir) => {
    const result = runNodeResult(RELEASE_CHECK, ['--policy', 'production', '--json'], { cwd: dir });
    assert.ok([0, 1].includes(result.code));
    const report = JSON.parse(result.stdout);
    assert.ok(report.release_conclusion);
    assert.equal(report.release_conclusion.release_decision, report.decision);
    assert.equal(report.release_conclusion.release_policy, 'production');
    assert.equal(report.release_conclusion.selected_baseline_name, report.benchmark_baseline_naming.selected_name);
    assert.equal(report.release_conclusion.canonical_baseline_name, report.benchmark_baseline_naming.recommended_name);
    assert.equal(report.release_conclusion.rollback_ready, report.snapshot_readiness.ready);
  });
});

test('release-rehearsal surfaces the same release conclusion as the nested release report', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0', scripts: { test: 'node --test' }, dependencies: { express: '^4.0.0' } }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'module.exports = {}\n',
    });
    initCommittedGitRepo(dir);
    writeHealthyRuns(dir);
    runNodeJson(BENCHMARK_SUITE, ['baseline', '--profile', 'node-api', '--policy', 'production', '--latest', '--json'], { cwd: dir });
    runNodeJson(BENCHMARK_SUITE, ['approve', '--profile', 'node-api', '--policy', 'production', '--json'], { cwd: dir });
  }, (dir) => {
    const result = runNodeResult(RELEASE_REHEARSAL, ['--policy', 'production', '--json'], { cwd: dir });
    assert.ok([0, 1].includes(result.code));
    const report = JSON.parse(result.stdout);
    assert.ok(report.release_conclusion);
    assert.deepEqual(report.release_conclusion, report.release_report.release_conclusion);
    assert.equal(report.release_conclusion.release_decision, report.decision);
  });
});
