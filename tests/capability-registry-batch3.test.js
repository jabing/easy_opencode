const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildCapabilityRegistry, resolveCapability } = require('../src/core/capabilities/registry.js');
const { buildEocConfig } = require('../src/shared/opencode-config.js');

const ROOT = path.join(__dirname, '..');

function runNode(args, cwd = ROOT) {
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('batch3 capability registry indexes agents, skills, scripts, and command aliases', () => {
  const registry = buildCapabilityRegistry(ROOT);
  const config = buildEocConfig('.', path.join(ROOT, 'commands'));
  const skillDirs = fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, 'skills', entry.name, 'SKILL.md')));
  assert.equal(registry.counts.agents, Object.keys(config.agent || {}).length);
  assert.equal(registry.counts.skills, skillDirs.length);
  assert.ok(registry.counts.scripts >= 40);
  assert.equal(registry.counts.aliases, Object.keys(config.command || {}).length);
  assert.ok(registry.capabilities.some((item) => item.id === 'agent:eoc_orchestrator' && item.execution_mode === 'agent'));
  assert.equal(registry.root_dir, '.');
  const byId = Object.fromEntries(registry.capabilities.map((item) => [item.id, item]));
  assert.equal(byId['agent:eoc_code_reviewer'].kind, 'reviewer');
  assert.equal(byId['agent:e2e-runner'].kind, 'verifier');
  assert.equal(byId['agent:security-reviewer'].kind, 'reviewer');
  assert.equal(byId['agent:repo-aware-coder'].kind, 'implementer');
  assert.equal(byId['agent:ts-coder'].kind, 'implementer');
  assert.equal(byId['agent:build-error-resolver'].kind, 'transformer');
  assert.equal(byId['agent:go-build-resolver'].kind, 'transformer');
  assert.ok(registry.capabilities.some((item) => item.id === 'skill:add-express-route' && item.execution_mode === 'hybrid'));
  assert.ok(registry.capabilities.some((item) => item.id === 'script:implement-task' && item.execution_mode === 'script'));
  assert.ok(registry.aliases.some((item) => item.id === 'command:implement-task' && item.target_id));
});

test('batch3 skill-registry writes capability registry as companion output', () => {
  const result = runNode(['scripts/skill-registry.js', '--write', 'skills/registry.test.json', '--capabilities-write', 'capabilities/registry.test.json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const capabilityPath = path.join(ROOT, 'capabilities', 'registry.test.json');
  assert.ok(fs.existsSync(capabilityPath));
  const capabilityRegistry = JSON.parse(fs.readFileSync(capabilityPath, 'utf8'));
  const config = buildEocConfig('.', path.join(ROOT, 'commands'));
  const skillDirs = fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, 'skills', entry.name, 'SKILL.md')));
  assert.equal(capabilityRegistry.counts.agents, Object.keys(config.agent || {}).length);
  assert.equal(capabilityRegistry.counts.skills, skillDirs.length);
  fs.rmSync(path.join(ROOT, 'skills', 'registry.test.json'), { force: true });
  fs.rmSync(capabilityPath, { force: true });
});

test('batch3 skill-runner exposes unified capability listing and capability metadata', () => {
  const listResult = runNode(['scripts/skill-runner.js', 'capabilities', '--source', 'agent', '--json']);
  assert.equal(listResult.status, 0, listResult.stderr || listResult.stdout);
  const items = JSON.parse(listResult.stdout);
  assert.ok(items.some((item) => item.id === 'agent:eoc_orchestrator'));

  const showResult = runNode(['scripts/skill-runner.js', 'show', 'add-express-route', '--json']);
  assert.equal(showResult.status, 0, showResult.stderr || showResult.stdout);
  const skill = JSON.parse(showResult.stdout);
  assert.equal(skill.capability_id, 'skill:add-express-route');
  assert.equal(skill.execution_mode, 'hybrid');

  const capability = resolveCapability(ROOT, 'skill:add-express-route');
  assert.equal(capability.kind, 'implementer');
});
