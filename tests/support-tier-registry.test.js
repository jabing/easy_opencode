const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson } = require('./test-helpers.js');
const { readSkill } = require('../src/core/skills/manifest.js');
const { buildCapabilityRegistry } = require('../src/core/capabilities/registry.js');

const ROOT = path.resolve(__dirname, '..');
const SKILL_RUNNER = path.join(ROOT, 'scripts', 'skill-runner.js');
const CAPABILITY_REGISTRY = path.join(ROOT, 'scripts', 'capability-registry.js');

test('skill manifests infer support tiers from execution model', () => {
  const primary = readSkill(ROOT, 'generate-node-feature');
  const executable = readSkill(ROOT, 'add-spring-controller');
  const advisory = readSkill(ROOT, 'backend-patterns');

  assert.equal(primary.support_tier, 'tier1');
  assert.equal(executable.support_tier, 'tier2');
  assert.equal(advisory.support_tier === 'tier3' || advisory.support_tier === 'tier4', true);
});

test('capability registry records support tiers for skills and scripts', () => {
  const registry = buildCapabilityRegistry(ROOT);
  assert.ok(registry.counts.by_support_tier.tier1 >= 4);
  const generateFeature = registry.capabilities.find((item) => item.id === 'script:generate-feature');
  const astRewrite = registry.capabilities.find((item) => item.id === 'script:ast-rewrite');
  const springController = registry.capabilities.find((item) => item.id === 'skill:add-spring-controller');
  assert.equal(generateFeature.support_tier, 'tier1');
  assert.equal(astRewrite.support_tier, 'tier2');
  assert.equal(springController.support_tier, 'tier2');
  assert.ok(Array.isArray(generateFeature.metadata.support_scope.provider_ids));
  assert.ok(Array.isArray(astRewrite.metadata.support_scope.languages));
});

test('skill-runner and capability-registry surface support tier metadata in json mode', () => {
  const skill = runNodeJson(SKILL_RUNNER, ['show', 'generate-go-feature', '--json'], { cwd: ROOT });
  assert.equal(skill.support_tier, 'tier1');
  assert.deepEqual(skill.runtimes, ['go']);

  const capabilities = runNodeJson(SKILL_RUNNER, ['capabilities', '--source', 'script', '--support-tier', 'tier1', '--json'], { cwd: ROOT });
  assert.ok(capabilities.some((item) => item.id === 'script:generate-feature'));

  const registry = runNodeJson(CAPABILITY_REGISTRY, ['--root', ROOT, '--json', '--no-write'], { cwd: ROOT });
  assert.ok(registry.counts.by_support_tier.tier1 >= 4);
});
