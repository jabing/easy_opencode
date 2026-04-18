const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, runNodeResult } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const PREFLIGHT = path.join(ROOT, 'scripts', 'preflight-production.js');

test('production preflight emits machine-readable blocking summary', () => {
  const result = runNodeResult(PREFLIGHT, ['--json'], { cwd: ROOT, env: { CI: '1' } });
  assert.notEqual(result.code, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.decision, 'blocked');
  assert.equal(report.steps[0].name, 'lint');
  assert.equal(report.steps[3].name, 'test');
  assert.ok(report.steps.every((item) => typeof item.duration_ms === 'number'));
});
