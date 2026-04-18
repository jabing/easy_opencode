const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const tsconfig = require('../tsconfig.json');
const { runTypecheck } = require('../src/core/ts-typecheck.js');

const ROOT = path.resolve(__dirname, '..');
const WAVE_FILES = [
  'src/shared/cli.js',
  'src/shared/opencode-config.js',
  'src/shared/contracts.js',
  'src/shared/product-scope.js',
  'src/core/project-profile/runners/go.js',
  'src/core/project-profile/runners/index.js',
  'src/core/project-profile/runners/java.js',
  'src/core/project-profile/runners/node.js',
  'src/core/project-profile/runners/python.js',
  'src/core/lint/config.js',
  'src/core/lint/engine.js',
  'src/core/quality/shared.js',
  'src/control-plane/product/modes.js',
  'src/control-plane/product/main-commands.js',
];

function isCoveredByTsconfig(filePath) {
  if (Array.isArray(tsconfig.files)) return tsconfig.files.includes(filePath);
  if (!Array.isArray(tsconfig.include)) return false;
  return tsconfig.include.some((pattern) => {
    if (pattern === 'src/**/*.js') return /^src\/.+\.js$/.test(filePath);
    if (pattern === 'src/**/*.d.ts') return /^src\/.+\.d\.ts$/.test(filePath);
    return false;
  });
}

test('batch3 adds a first wave of typechecked source files', () => {
  for (const file of WAVE_FILES) {
    assert.ok(isCoveredByTsconfig(file), `expected ${file} to be covered by tsconfig`);
  }
});

test('typecheck coverage expands beyond the original baseline without failures', () => {
  const result = runTypecheck(ROOT);
  assert.equal(result.ok, true);
  assert.equal(result.degraded, false);
  assert.ok(result.checked >= 63, `expected checked count >= 63, got ${result.checked}`);
});
