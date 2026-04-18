const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, runNodeResult, withTempDir, writeFiles, writeBenchmarkRun, makeBenchmarkResult } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');
const RELEASE_REHEARSAL = path.join(ROOT, 'scripts', 'release-rehearsal.js');

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

test('release-rehearsal runs release-check inside a sandbox git repo with snapshot readiness', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'plain-node-app',
        version: '1.0.0',
        scripts: { test: 'node --test' },
      }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'export const value = 1;\n',
    });
    for (let i = 1; i <= 5; i += 1) {
      writeHealthyRun(dir, `run-${i}`, `2026-04-0${i}T10:00:00.000Z`);
    }
    runNodeJson(BENCHMARK_SUITE, ['baseline', '--name', 'release', '--latest', '--json'], { cwd: dir });
  }, (dir) => {
    const report = runNodeJson(RELEASE_REHEARSAL, ['--json'], { cwd: dir });
    assert.equal(report.rehearsal_repo_state.is_git_repo, true);
    assert.equal(report.rehearsal_repo_state.dirty, false);
    assert.equal(report.snapshot.status, 'ready');
    assert.equal(report.release_report.snapshot_readiness.status, 'ready');
    assert.equal(report.release_report.decision, 'ready');
    assert.equal(report.decision, 'ready');
  });
});

test('release-rehearsal json mode returns a parseable blocked report without failing the process', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'plain-node-app',
        version: '1.0.0',
        scripts: { test: 'node --test' },
      }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'export const value = 1;\n',
    });
    for (let i = 1; i <= 8; i += 1) {
      writeHealthyRun(dir, `run-${i}`, `2026-02-${String(i).padStart(2, '0')}T10:00:00.000Z`);
    }
    runNodeJson(BENCHMARK_SUITE, ['baseline', '--name', 'release', '--latest', '--json'], { cwd: dir });
    runNodeJson(BENCHMARK_SUITE, ['approve', '--name', 'release', '--json'], { cwd: dir });
  }, (dir) => {
    const jsonResult = runNodeResult(RELEASE_REHEARSAL, ['--policy', 'production', '--json'], { cwd: dir });
    assert.equal(jsonResult.code, 0);
    const jsonReport = JSON.parse(jsonResult.stdout);
    assert.equal(jsonReport.decision, 'blocked');

    const humanResult = runNodeResult(RELEASE_REHEARSAL, ['--policy', 'production'], { cwd: dir });
    assert.equal(humanResult.code, 1);
  });
});
