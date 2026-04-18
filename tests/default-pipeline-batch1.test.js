const test = require('node:test');
const assert = require('node:assert/strict');

test('buildAutomationPolicy returns lightweight implement behavior in solo mode', async () => {
  const { buildAutomationPolicy } = require('../src/core/automation/default-pipeline.js');
  const policy = buildAutomationPolicy({
    command: 'implement',
    mode: { id: 'solo' },
    ecosystemState: { enabled_bundles: [], automation_policy_overrides: {} },
    workspaceProfile: { recommended_bundles: ['node-service'] },
  });
  assert.equal(policy.command, 'implement');
  assert.equal(policy.scheduler.enabled, true);
  assert.equal(policy.verification.level, 'fast');
  assert.equal(policy.review_gate.enabled, false);
  assert.match(policy.explanation.join(' | '), /mode=solo/);
  assert.match(policy.explanation.join(' | '), /bundle=node-service/);
});

test('buildAutomationPolicy enables review gate by default in platform mode', async () => {
  const { buildAutomationPolicy } = require('../src/core/automation/default-pipeline.js');
  const policy = buildAutomationPolicy({
    command: 'implement',
    mode: { id: 'platform' },
    ecosystemState: { enabled_bundles: ['release-governance'], automation_policy_overrides: {} },
    workspaceProfile: { recommended_bundles: ['release-governance'] },
  });
  assert.equal(policy.review_gate.enabled, true);
  assert.equal(policy.verification.level, 'standard');
  assert.ok(policy.explanation.some((item) => item.includes('bundle=release-governance')));
});

test('buildMainCommandPlan includes automation policy for implement runs', async () => {
  const { buildMainCommandPlan } = require('../src/control-plane/product/main-commands.js');
  const plan = buildMainCommandPlan('implement', [], {
    rootDir: process.cwd(),
    mode: 'team',
    ecosystemState: {
      schema_version: 1,
      enabled_bundles: [],
      disabled_bundles: [],
      applied_bundles: [],
      automation_policy_overrides: {},
      mode_overrides: {},
      bootstrap: null,
      source: 'default',
      file_path: '',
    },
  });
  assert.equal(plan.command, 'implement');
  assert.equal(plan.automation_policy.review_gate.enabled, true);
  assert.equal(plan.automation_policy.verification.level, 'standard');
  assert.equal(plan.runs[0].script, 'implement-task');
});
