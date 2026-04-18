const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { detectProjectProfile } = require('../src/core/project-profile.js');

const ROOT = path.resolve(__dirname, '..');

test('plugin repo profile exposes test validation command', () => {
  const profile = detectProjectProfile(ROOT);
  assert.equal(profile.runtime, 'node');
  assert.equal(profile.language, 'javascript');
  assert.ok(profile.validation_by_kind.test, 'expected test command to be detected');
  assert.equal(profile.validation_by_kind.test, 'npm run test');
  assert.ok(!profile.validation_gaps.includes('test'));
});
