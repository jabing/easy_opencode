const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const tsconfig = require('../tsconfig.json');
const { runTypecheck } = require('../src/core/ts-typecheck.js');

const ROOT = path.resolve(__dirname, '..');
const WAVE_FILES = [
  'src/types/process-runner.js',
  'src/core/gates/engine.js',
  'src/core/gates/gate-engine.js',
  'src/core/project/dependency-graph.js',
  'src/core/skills/taxonomy.js',
  'src/core/verification/suggestions.js',
  'src/core/verification/schema.js',
  'src/core/release/conclusion.js',
  'src/core/release/policy.js',
  'src/core/release/audit-summary.js',
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

test('batch5 adds low-coupling governance and verification modules to typecheck coverage', () => {
  for (const file of WAVE_FILES) {
    assert.ok(isCoveredByTsconfig(file), `expected ${file} to be covered by tsconfig`);
  }
});

test('typecheck coverage expands to the next plateau without failures', () => {
  const result = runTypecheck(ROOT);
  assert.equal(result.ok, true);
  assert.equal(result.degraded, false);
  assert.ok(result.checked >= 81, `expected checked count >= 81, got ${result.checked}`);
});
