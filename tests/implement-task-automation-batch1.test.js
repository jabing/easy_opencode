const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeFiles } = require('./test-helpers.js');
const { executeImplementTaskWorkflow } = require('../src/control-plane/workflows/implement-task.js');

function withTempRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-implement-task-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('implement-task resolves automation policy before validation and skips validation when verification is off', async () => {
  await withTempRoot(async (root) => {
    writeFiles(root, {
      'package.json': JSON.stringify({ name: 'demo-app', version: '1.0.0', scripts: { test: 'node --version' } }, null, 2) + '\n',
      'src/index.js': 'module.exports = 1;\n',
    });

    const result = await executeImplementTaskWorkflow({
      rootDir: root,
      traceId: 'implement-policy-trace',
      profile: { runtime: 'node' },
      benchmarkFeedback: { risk_level: 'low' },
      snapshot: { status: 'ok' },
      opts: { 'no-snapshot': true },
      selectedSkill: null,
      selection: null,
      automationPolicy: {
        scheduler: { enabled: true },
        verification: { level: 'off' },
        review_gate: { enabled: false },
        explanation: ['mode=solo'],
      },
      runScaffold() { return { status: 'skipped', created: false }; },
      createCoderRun() { return { run_id: 'run-1' }; },
      executeCoderRound() { return { checks: [{ id: 'fast-test' }] }; },
      loadCoderRun() { return { checks: [{ id: 'fast-test' }] }; },
      writePlanArtifacts() { return { plan: { plan_id: 'plan-1' }, promptText: 'hello' }; },
    });

    const stepIds = result.trace.steps.map((step) => step.step_id);
    assert.ok(stepIds.includes('resolve-automation-policy'));
    assert.ok(stepIds.includes('execute-validation-round'));

    const policyStep = result.trace.steps.find((step) => step.step_id === 'resolve-automation-policy');
    assert.ok(policyStep);
    assert.match(policyStep.summary, /verification=off/);
    assert.match(policyStep.summary, /mode=solo/);

    const validationStep = result.trace.steps.find((step) => step.step_id === 'execute-validation-round');
    assert.ok(validationStep);
    assert.equal(validationStep.status, 'skipped');
    assert.equal(validationStep.summary, 'Skipped by condition');
  });
});
