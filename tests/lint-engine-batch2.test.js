const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { withTempDir, writeFiles, runNodeJson, runNodeResult } = require('./test-helpers.js');
const { runLint, matchesInclude } = require('../src/core/lint/engine.js');
const { loadLintConfig } = require('../src/core/lint/config.js');
const pkg = require('../package.json');

const ROOT = path.resolve(__dirname, '..');
const LINT = path.join(ROOT, 'scripts', 'lint.js');

test('package scripts expose dedicated code lint entry points', () => {
  assert.equal(pkg.scripts.lint, 'node scripts/lint.js');
  assert.equal(pkg.scripts['lint:code'], 'node scripts/lint.js');
  assert.equal(pkg.scripts['lint:json'], 'node scripts/lint.js --json');
  assert.equal(pkg.scripts['lint:legacy'], 'node scripts/metadata-check.js');
});

test('matchesInclude accepts rooted glob prefixes used by lint config', () => {
  assert.equal(matchesInclude('src/core/example.js', ['src/**/*.js']), true);
  assert.equal(matchesInclude('scripts/build.js', ['src/**/*.js']), false);
});

test('loadLintConfig falls back to repository defaults', () => {
  const config = loadLintConfig(ROOT);
  assert.equal(config.maxWarnings, 0);
  assert.equal(config.rules['no-debugger'], 'error');
  assert.equal(config.rules['no-var'], 'error');
});

test('lint engine reports debugger var and trailing whitespace violations', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'opencode-lint.json': JSON.stringify({
        include: ['src/**/*.js'],
        maxWarnings: 0,
        rules: {
          'no-debugger': 'error',
          'no-var': 'error',
          'no-trailing-whitespace': 'warn',
          'eol-last': 'warn',
        },
      }, null, 2),
      'src/bad.js': 'var count = 1;  \nfunction demo() {\n  debugger;\n  return count;\n}',
    });
  }, (dir) => {
    const result = runLint(dir);
    assert.equal(result.ok, false);
    assert.equal(result.errors, 2);
    assert.equal(result.warnings, 2);
    assert.deepEqual(result.findings.map((item) => item.rule).sort(), ['eol-last', 'no-debugger', 'no-trailing-whitespace', 'no-var']);
  });
});

test('lint CLI emits machine-readable JSON', () => {
  const report = runNodeJson(LINT, ['--json'], { cwd: ROOT });
  assert.equal(report.ok, true);
  assert.equal(report.errors, 0);
  assert.equal(report.warnings, 0);
  assert.ok(report.files > 100);
});

test('lint CLI exits non-zero on violations', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'opencode-lint.json': JSON.stringify({ include: ['src/**/*.js'], rules: { 'no-debugger': 'error' } }, null, 2),
      'src/bad.js': 'function demo(){ debugger; }\n',
    });
  }, (dir) => {
    const result = runNodeResult(LINT, [], { cwd: dir });
    assert.equal(result.code, 1);
    assert.match(result.stdout, /no-debugger/);
  });
});
