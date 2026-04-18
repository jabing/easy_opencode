const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

test('run-tests json summary includes timeout and truncation fields', () => {
  const result = spawnSync(process.execPath, ['scripts/run-tests.js', '--target', 'tests/package-hygiene.test.js', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.schema_version, '1.1');
  assert.ok(typeof summary.output_max_bytes === 'number');
  assert.equal(summary.files.length, 1);
  assert.equal(typeof summary.files[0].timed_out, 'boolean');
  assert.equal(typeof summary.files[0].truncated, 'boolean');
});
