const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMainCommandPlan } = require('../src/control-plane/product/main-commands.js');

test('doctor --bootstrap appends a diagnostic bootstrap preview without apply flags', () => {
  const plan = buildMainCommandPlan('doctor', ['--bootstrap'], { rootDir: process.cwd(), mode: 'team' });
  assert.equal(plan.command, 'doctor');
  assert.deepEqual(
    plan.runs.map((run) => run.script),
    ['build-check', 'quality-gate', 'project-profile', 'bootstrap'],
  );
  assert.deepEqual(plan.runs[3].args, ['--json']);
});
