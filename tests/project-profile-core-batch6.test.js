const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { withTempDir, writeFiles } = require('./test-helpers.js');
const { findRelatedTests, splitCsv, summarizeJsTsFile } = require('../src/core/project-profile.js');

const ROOT = path.resolve(__dirname, '..');

test('project-profile core splitCsv flattens comma-separated values', () => {
  assert.deepEqual(splitCsv(['src/a.ts, src/b.ts', 'tests/a.test.ts']), ['src/a.ts', 'src/b.ts', 'tests/a.test.ts']);
  assert.deepEqual(splitCsv(''), []);
});

test('project-profile core finds likely related tests for targets', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/user-service.ts': 'export const userService = true\n',
      'src/order-service.ts': 'export const orderService = true\n',
      'tests/user-service.test.ts': 'test(\'user-service\', () => {})\n',
      'tests/order-service.test.ts': 'test(\'order-service\', () => {})\n',
      'tests/unrelated.test.ts': 'test(\'unrelated\', () => {})\n',
    });
  }, (dir) => {
    const related = findRelatedTests(dir, ['src/user-service.ts']);
    assert.deepEqual(related, ['tests/user-service.test.ts']);
  });
});

test('project-profile core summarizes JS/TS exports without TypeScript runtime', () => {
  const summary = summarizeJsTsFile(ROOT, 'src/core/project-profile.js');
  assert.equal(summary.exists, true);
  assert.ok(summary.exports.includes('module') === false);
  assert.ok(summary.line_count > 5);
});
