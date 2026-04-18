const test = require('node:test');
const assert = require('node:assert/strict');
const { runTypecheck } = require('../src/core/ts-typecheck.js');

test('typecheck covers a broader maintained set of src modules', () => {
  const result = runTypecheck();
  assert.equal(result.ok, true, result.failures.slice(0, 5).join('\n'));
  assert.equal(result.degraded, false);
  assert.ok(result.checked >= 49, `expected at least 49 checked files, got ${result.checked}`);
});
