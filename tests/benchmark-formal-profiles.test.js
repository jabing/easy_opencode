const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, withTempDir, writeBenchmarkRun, makeBenchmarkResult } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');

for (const profile of ['node-api', 'python-service', 'go-service', 'java-service', 'plugin-self-release']) {
  test(`benchmark-suite sample exposes formal profile ${profile}`, () => {
    const suite = runNodeJson(BENCHMARK_SUITE, ['sample', '--preset', profile], { cwd: ROOT });
    assert.equal(suite.profile, profile);
    assert.ok(Array.isArray(suite.cases));
    assert.ok(suite.cases.length >= 2);
  });
}

test('benchmark trend report includes multiple comparison windows', () => {
  withTempDir(() => {}, (dir) => {
    for (let i = 1; i <= 6; i += 1) {
      writeBenchmarkRun(dir, {
        run_id: `run-${i}`,
        completed_at: `2026-04-0${i}T10:00:00.000Z`,
        results: [
          makeBenchmarkResult({
            runtime: 'node',
            framework: 'express',
            task_family: 'endpoint',
            selected_skill: 'add-express-route',
            passed: i >= 4,
            task_success: i >= 4,
            failed_count: i >= 4 ? 0 : 2,
          }),
        ],
      });
    }
    const report = runNodeJson(BENCHMARK_SUITE, ['trend', '--group-by', 'runtime-framework', '--limit', '6', '--json'], { cwd: dir });
    assert.ok(Array.isArray(report.windows));
    assert.deepEqual(report.windows.map((item) => item.window_runs), [3, 5, 6]);
    assert.equal(report.windows[0].summary.directions.improving >= 0, true);
  });
});
