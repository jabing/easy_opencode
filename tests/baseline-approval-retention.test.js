const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { runNodeJson, runNodeResult, withTempDir, writeFiles, writeBenchmarkRun, makeBenchmarkResult, initCommittedGitRepo } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
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

test('production release-check requires approved baseline bound to current baseline run', () => {
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
    runNodeJson(BENCHMARK_SUITE, ['baseline', '--name', 'release', '--latest', '--json'], { cwd: dir });

    const blocked = runNodeResult(RELEASE_CHECK, ['--policy', 'production', '--now', '2026-04-12T00:00:00.000Z', '--json'], { cwd: dir });
    assert.notEqual(blocked.code, 0);
    const blockedReport = JSON.parse(blocked.stdout);
    const approvalCheck = blockedReport.checks.find((item) => item.check === 'benchmark.baseline_approval');
    assert.ok(approvalCheck);
    assert.equal(approvalCheck.status, 'warn');
    assert.match(approvalCheck.detail, /approval is missing|required by policy/i);

    runNodeJson(BENCHMARK_SUITE, ['approve', '--name', 'release', '--approver', 'qa-lead', '--json'], { cwd: dir });
    const ready = runNodeJson(RELEASE_CHECK, ['--policy', 'production', '--now', '2026-04-12T00:00:00.000Z', '--json'], { cwd: dir });
    assert.equal(ready.decision, 'ready');
    assert.equal(ready.baseline_approval.status, 'approved');

    writeHealthyRun(dir, 'run-9', '2026-04-13T10:00:00.000Z');
    runNodeJson(BENCHMARK_SUITE, ['baseline', '--name', 'release', '--latest', '--json'], { cwd: dir });
    const stale = runNodeResult(RELEASE_CHECK, ['--policy', 'production', '--now', '2026-04-13T12:00:00.000Z', '--json'], { cwd: dir });
    assert.notEqual(stale.code, 0);
    const staleReport = JSON.parse(stale.stdout);
    assert.equal(staleReport.baseline_approval.status, 'stale_approval');
  });
});

test('benchmark archive keeps latest runs and protects baseline-approved run', () => {
  withTempDir((dir) => {
    for (let i = 1; i <= 9; i += 1) {
      const day = String(i).padStart(2, '0');
      writeHealthyRun(dir, `run-${i}`, `2026-02-${day}T10:00:00.000Z`);
    }
  }, (dir) => {
    runNodeJson(BENCHMARK_SUITE, ['baseline', '--name', 'release', '--from', 'run-2', '--json'], { cwd: dir });
    runNodeJson(BENCHMARK_SUITE, ['approve', '--name', 'release', '--approver', 'qa-lead', '--json'], { cwd: dir });

    const dryRun = runNodeJson(BENCHMARK_SUITE, ['archive', '--policy', 'production', '--keep-latest', '3', '--now', '2026-04-12T00:00:00.000Z', '--json'], { cwd: dir });
    assert.ok(dryRun.archive_candidates.length >= 1);
    assert.ok(!dryRun.archive_candidates.some((item) => item.run_id === 'run-2'));
    assert.ok(!dryRun.archive_candidates.some((item) => item.run_id === 'run-9'));

    const applied = runNodeJson(BENCHMARK_SUITE, ['archive', '--policy', 'production', '--keep-latest', '3', '--now', '2026-04-12T00:00:00.000Z', '--apply', '--json'], { cwd: dir });
    assert.ok(applied.archived_count >= 1);
    assert.equal(fs.existsSync(path.join(dir, '.opencode', 'observability', 'benchmarks', 'run-2.json')), true);
    assert.equal(fs.existsSync(path.join(dir, '.opencode', 'observability', 'benchmarks', 'run-9.json')), true);
    const archivedRun = applied.archived.find((item) => item.run_id === 'run-1');
    assert.ok(archivedRun);
    assert.equal(fs.existsSync(archivedRun.to), true);
  });
});
