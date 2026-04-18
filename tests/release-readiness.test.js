const test = require('node:test');
const assert = require('node:assert/strict');
const { runNodeJson, runNodeResult, withTempDir, writeFiles, initCommittedGitRepo, writeBenchmarkRun, makeBenchmarkResult } = require('./test-helpers.js');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_FEEDBACK = path.join(ROOT, 'scripts', 'benchmark-feedback.js');
const SAFE_APPLY = path.join(ROOT, 'scripts', 'safe-apply.js');
const RELEASE_CHECK = path.join(ROOT, 'scripts', 'release-check.js');

function writeSingleCaseRuns(dir, cases) {
  for (const entry of cases) {
    writeBenchmarkRun(dir, {
      run_id: entry.run_id,
      completed_at: entry.completed_at,
      results: [
        makeBenchmarkResult({
          runtime: entry.runtime || 'node',
          framework: entry.framework || 'express',
          task_family: entry.task_family || 'endpoint',
          selected_skill: entry.selected_skill || 'add-express-route',
          passed: entry.passed,
          task_success: entry.task_success,
          failed_count: entry.failed_count,
          review_verdict: entry.review_verdict,
        }),
      ],
    });
  }
}

test('benchmark-feedback marks shallow history as caution for release readiness', () => {
  withTempDir((dir) => {
    writeSingleCaseRuns(dir, [
      { run_id: 'run-1', completed_at: '2026-04-01T10:00:00.000Z', passed: true, task_success: true, failed_count: 0 },
    ]);
  }, (dir) => {
    const report = runNodeJson(BENCHMARK_FEEDBACK, ['report', '--runtime', 'node', '--framework', 'express', '--task-family', 'endpoint', '--json'], { cwd: dir });
    assert.equal(report.risk_level, 'low');
    assert.equal(report.coverage.status, 'sufficient');
    assert.equal(report.release_readiness.status, 'caution');
    assert.match(report.release_readiness.reasons.join(' | '), /shallow|low/i);
  });
});

test('benchmark-feedback blocks release readiness for high-risk benchmark scope', () => {
  withTempDir((dir) => {
    writeSingleCaseRuns(dir, [
      { run_id: 'run-1', completed_at: '2026-04-01T10:00:00.000Z', passed: false, task_success: false, failed_count: 2 },
      { run_id: 'run-2', completed_at: '2026-04-02T10:00:00.000Z', passed: false, task_success: false, failed_count: 2 },
      { run_id: 'run-3', completed_at: '2026-04-03T10:00:00.000Z', passed: false, task_success: false, failed_count: 2 },
      { run_id: 'run-4', completed_at: '2026-04-04T10:00:00.000Z', passed: false, task_success: false, failed_count: 2 },
      { run_id: 'run-5', completed_at: '2026-04-05T10:00:00.000Z', passed: false, task_success: false, failed_count: 2 },
    ]);
  }, (dir) => {
    const report = runNodeJson(BENCHMARK_FEEDBACK, ['report', '--runtime', 'node', '--framework', 'express', '--task-family', 'endpoint', '--json'], { cwd: dir });
    assert.equal(report.risk_level, 'high');
    assert.equal(report.release_readiness.status, 'blocked');
    assert.match(report.release_readiness.reasons.join(' | '), /high/i);
  });
});

test('benchmark-feedback reports partial coverage when skill-specific history is missing', () => {
  withTempDir((dir) => {
    for (let i = 1; i <= 5; i += 1) {
      writeBenchmarkRun(dir, {
        run_id: `run-${i}`,
        completed_at: `2026-04-0${i}T10:00:00.000Z`,
        results: [
          makeBenchmarkResult({ runtime: 'node', framework: 'express', task_family: 'endpoint', selected_skill: 'add-express-route', passed: true, task_success: true, failed_count: 0 }),
          makeBenchmarkResult({ runtime: 'node', framework: 'express', task_family: 'service', selected_skill: 'add-service-module', passed: true, task_success: true, failed_count: 0, case_id: `svc-${i}` }),
        ],
      });
    }
  }, (dir) => {
    const report = runNodeJson(BENCHMARK_FEEDBACK, ['report', '--runtime', 'node', '--framework', 'express', '--task-family', 'endpoint', '--skill', 'add-fastapi-endpoint', '--json'], { cwd: dir });
    assert.equal(report.coverage.status, 'partial');
    assert.deepEqual(report.coverage.missing_dimensions, ['skill']);
    assert.equal(report.release_readiness.status, 'caution');
    assert.match(report.release_readiness.reasons.join(' | '), /partial/i);
  });
});

test('safe-apply status reports degraded_dirty snapshot readiness on dirty repositories', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', scripts: { build: 'echo build', lint: 'echo lint', test: 'node --test' } }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'export const value = 1;\n',
    });
    initCommittedGitRepo(dir);
    writeFiles(dir, {
      'src/index.js': 'export const value = 2;\n',
    });
  }, (dir) => {
    const report = runNodeJson(SAFE_APPLY, ['status'], { cwd: dir });
    assert.equal(report.snapshot_readiness.status, 'degraded_dirty');
    assert.equal(report.snapshot_readiness.ready, false);
    assert.match(report.snapshot_readiness.reason, /dirty/i);
  });
});

test('release-check warns in non-strict mode and blocks in strict mode when release signals are incomplete', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'fixture-node',
        version: '1.0.0',
        scripts: { build: 'echo build', lint: 'echo lint', test: 'node --test' },
      }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'export const value = 1;\n',
    });
    initCommittedGitRepo(dir);
  }, (dir) => {
    const report = runNodeJson(RELEASE_CHECK, ['--json'], { cwd: dir });
    assert.equal(report.decision, 'caution');
    assert.ok(report.counts.warn >= 1);
    assert.ok(report.policy.require_latest_benchmark_non_regressing);

    const strict = runNodeResult(RELEASE_CHECK, ['--strict', '--json'], { cwd: dir });
    assert.notEqual(strict.code, 0);
  });
});

test('release-check surfaces latest benchmark regressions as warnings', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'fixture-node',
        version: '1.0.0',
        scripts: { test: 'node --test' },
      }, null, 2),
      'src/index.js': 'export const value = 1;\n',
      '.gitignore': 'node_modules\n',
    });
    initCommittedGitRepo(dir);
    writeBenchmarkRun(dir, {
      run_id: 'run-good',
      completed_at: '2026-04-01T10:00:00.000Z',
      results: [makeBenchmarkResult({ passed: true, task_success: true, failed_count: 0 })],
    });
    writeBenchmarkRun(dir, {
      run_id: 'run-bad',
      completed_at: '2026-04-02T10:00:00.000Z',
      results: [makeBenchmarkResult({ passed: false, task_success: false, failed_count: 2, review_verdict: 'BLOCK' })],
    });
  }, (dir) => {
    const result = runNodeResult(RELEASE_CHECK, ['--json'], { cwd: dir });
    assert.notEqual(result.code, 0);
    const report = JSON.parse(result.stdout);
    const latestComparison = report.checks.find((item) => item.check === 'benchmark.latest_comparison');
    assert.ok(latestComparison);
    assert.equal(latestComparison.status, 'warn');
    assert.match(latestComparison.detail, /regressed=1/i);
  });
});
