const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNode, runNodeJson, withTempDir } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');

test('benchmark-suite sample materializes runnable roots and key formal presets execute', () => {
  withTempDir(() => {}, (dir) => {
    const nodeSuitePath = path.join(dir, 'node-api.json');
    runNode(BENCHMARK_SUITE, ['sample', '--preset', 'node-api', '--out', nodeSuitePath], { cwd: ROOT });
    const nodeSuite = JSON.parse(fs.readFileSync(nodeSuitePath, 'utf8'));
    assert.ok(Array.isArray(nodeSuite.cases) && nodeSuite.cases.length >= 1);
    for (const item of nodeSuite.cases) {
      assert.match(String(item.root), /^\//);
      assert.equal(fs.existsSync(item.root), true);
    }
    const nodeRun = runNodeJson(BENCHMARK_SUITE, ['run', '--suite', nodeSuitePath, '--limit', '1', '--json'], { cwd: dir });
    assert.equal(nodeRun.summary.failed, 0);

    for (const preset of ['python-service', 'go-service', 'java-service']) {
      const suitePath = path.join(dir, `${preset}.json`);
      runNode(BENCHMARK_SUITE, ['sample', '--preset', preset, '--out', suitePath], { cwd: ROOT });
      const run = runNodeJson(BENCHMARK_SUITE, ['run', '--suite', suitePath, '--limit', '1', '--json'], { cwd: dir });
      assert.equal(run.summary.failed, 0, `${preset} should be runnable for at least one shipped case`);
    }
  });
});
