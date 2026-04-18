const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');

test('benchmark-suite sample production-readiness preset expands task-family coverage', () => {
  const suite = runNodeJson(BENCHMARK_SUITE, ['sample', '--preset', 'production-readiness'], { cwd: ROOT });
  assert.equal(suite.name, 'production-readiness-multilang');
  assert.ok(Array.isArray(suite.cases));
  assert.ok(suite.cases.length >= 8);
  const skills = suite.cases.map((item) => item.skill).sort();
  assert.ok(skills.includes('add-service-module'));
  assert.ok(skills.includes('add-config-module'));
  assert.ok(skills.includes('add-django-model'));
  assert.ok(skills.includes('add-unit-test'));
});

test('benchmark-suite sample deep-task-families preset focuses on newer task bundles', () => {
  const suite = runNodeJson(BENCHMARK_SUITE, ['sample', '--preset', 'deep-task-families'], { cwd: ROOT });
  assert.equal(suite.name, 'deep-task-families');
  assert.deepEqual(suite.cases.map((item) => item.skill), [
    'add-service-module',
    'add-config-module',
    'add-unit-test',
    'add-django-model',
  ]);
});
