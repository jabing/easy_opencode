const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { checkPackageHygiene } = require('../scripts/package-hygiene.js');

const ROOT = path.resolve(__dirname, '..');

test('publish whitelist excludes runtime .opencode state and keeps static assets', () => {
  const result = checkPackageHygiene(ROOT);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.ok(!result.files.includes('.opencode/'));
  assert.ok(result.files.includes('.opencode/instructions/'));
  assert.ok(result.files.includes('.opencode/plugins/'));
  assert.ok(result.files.includes('.opencode/hooks-config.json'));
  assert.ok(result.files.includes('.opencode/command-policy.json'));
});
