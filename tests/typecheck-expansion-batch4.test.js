const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const tsconfig = require('../tsconfig.json');
const { runTypecheck } = require('../src/core/ts-typecheck.js');

const ROOT = path.resolve(__dirname, '..');
const WAVE_FILES = [
  'src/cli/scaffold/common.js',
  'src/cli/scaffold/check.js',
  'src/cli/scaffold/command.js',
  'src/cli/scaffold/gate.js',
  'src/cli/scaffold/runner.js',
  'src/cli/command-registry.js',
  'src/cli/command.js',
  'src/cli/run-tests-cli.js',
];

test('batch4 adds a second wave of typechecked CLI source files', () => {
  for (const file of WAVE_FILES) {
    assert.ok(tsconfig.files.includes(file), `expected ${file} to be covered by tsconfig files`);
  }
});

test('batch4 removes root-level summary markdown clutter', () => {
  const summaries = fs.readdirSync(ROOT).filter((name) => name.endsWith('.md') && name.includes('SUMMARY'));
  assert.equal(summaries.length, 0);
});

test('typecheck coverage expands again without failures', () => {
  const result = runTypecheck(ROOT);
  assert.equal(result.ok, true);
  assert.equal(result.degraded, false);
  assert.ok(result.checked >= 71, `expected checked count >= 71, got ${result.checked}`);
});
