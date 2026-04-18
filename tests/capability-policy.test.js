const test = require('node:test');
const assert = require('node:assert/strict');
const { getAgentCapabilityPolicy, getScriptCapabilityPolicy, isRecommendedScript } = require('../src/shared/capability-policy.js');

test('capability policy exposes stable defaults for primary agents', () => {
  const orchestrator = getAgentCapabilityPolicy('eoc_orchestrator');
  assert.equal(orchestrator.surface, 'recommended');
  assert.equal(orchestrator.maturity, 'stable');
  assert.equal(orchestrator.recommended, true);
  const planner = getAgentCapabilityPolicy('eoc_planner');
  assert.equal(planner.surface, 'internal');
  assert.equal(planner.recommended, false);
});

test('capability policy marks recommended scripts consistently', () => {
  assert.equal(isRecommendedScript('project-profile'), true);
  assert.equal(isRecommendedScript('implement-task'), true);
  assert.equal(isRecommendedScript('benchmark-suite'), false);
  const releaseEvidence = getScriptCapabilityPolicy('release-evidence');
  assert.equal(releaseEvidence.kind, 'releaser');
  assert.equal(releaseEvidence.recommended, true);
});
