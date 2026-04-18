const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNode, runNodeJson, runNodeResult, withTempDir } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');

test('benchmark-suite sample materializes runnable roots and key formal presets execute', () => {
  withTempDir(() => {}, (dir) => {
    const nodeSuitePath = path.join(dir, 'node-api.json');
    runNode(BENCHMARK_SUITE, ['sample', '--preset', 'node-api', '--out', nodeSuitePath], { cwd: ROOT });
    const nodeSuite = JSON.parse(fs.readFileSync(nodeSuitePath, 'utf8'));
    assert.ok(Array.isArray(nodeSuite.cases) && nodeSuite.cases.length >= 1);
    for (const item of nodeSuite.cases) {
      assert.equal(path.isAbsolute(String(item.root)), true);
      assert.equal(fs.existsSync(item.root), true);
    }
    const nodeRunResult = runNodeResult(BENCHMARK_SUITE, ['run', '--suite', nodeSuitePath, '--limit', '1', '--json'], { cwd: dir });
    const nodeRun = JSON.parse(nodeRunResult.stdout);
    assert.equal(nodeRun.summary.total >= 1, true);
    assert.equal(Array.isArray(nodeRun.results), true);

    for (const preset of ['python-service', 'go-service', 'java-service']) {
      const suitePath = path.join(dir, `${preset}.json`);
      runNode(BENCHMARK_SUITE, ['sample', '--preset', preset, '--out', suitePath], { cwd: ROOT });
      const runResult = runNodeResult(BENCHMARK_SUITE, ['run', '--suite', suitePath, '--limit', '1', '--json'], { cwd: dir });
      const run = JSON.parse(runResult.stdout);
      assert.equal(run.summary.total >= 1, true, `${preset} should emit benchmark results`);
    }
  });
});
