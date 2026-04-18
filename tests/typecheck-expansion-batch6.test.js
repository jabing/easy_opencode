const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const tsconfig = require('../tsconfig.json');
const { runTypecheck } = require('../src/core/ts-typecheck.js');

const ROOT = path.resolve(__dirname, '..');
const WAVE_FILES = [
  'src/core/build/pipeline.js',
  'src/core/quality/static-scan.js',
  'src/core/quality/script-checks.js',
];

test('batch6 adds build pipeline and quality script modules to typecheck coverage', () => {
  for (const file of WAVE_FILES) {
    assert.ok(tsconfig.files.includes(file), `expected ${file} to be covered by tsconfig files`);
  }
});

test('typecheck coverage expands again without failures', () => {
  const result = runTypecheck(ROOT);
  assert.equal(result.ok, true);
  assert.equal(result.degraded, false);
  assert.ok(result.checked >= 84, `expected checked count >= 84, got ${result.checked}`);
});
