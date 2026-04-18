const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { validateSkillMetadata } = require('../src/core/quality/skill-metadata.js');
const { runNodeJson, withTempDir, writeFiles, runNodeResult } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const QUALITY_GATE = path.join(ROOT, 'scripts', 'quality-gate.js');
const SKILL_REGISTRY = path.join(ROOT, 'scripts', 'skill-registry.js');

function skillFiles(body, manifest) {
  return {
    'skills/demo/SKILL.md': body,
    'skills/demo/manifest.json': JSON.stringify(manifest, null, 2),
    'package.json': JSON.stringify({
      name: 'fixture-plugin',
      version: '1.0.0',
      description: 'Fixture with 16 specialized agents, 1 skills, 1 commands',
      scripts: {},
    }, null, 2),
    '.gitignore': 'node_modules\n',
    '.opencode/command-policy.json': '{}\n',
    'opencode.json': JSON.stringify({ command: {} }, null, 2),
    'AGENTS.md': 'Platform with 16 specialized agents, 1 skills, 1 commands\n',
    'README.md': '- 16 specialized agents\n- 1 skills\n- 1 commands\n',
    'commands/demo.md': '# demo\n',
    'prompts/demo.md': '# prompt\n',
  };
}

test('skill metadata validation stays non-blocking on the plugin workspace and reports partitioned trigger collisions', () => {
  const result = validateSkillMetadata(ROOT);
  assert.equal(result.ok, true);
  assert.equal(result.warnings.some((item) => item.includes('trigger collision "add endpoint" is partitioned by runtime')), true);
  assert.equal(result.warnings.some((item) => item.includes('add-env-example')), true);
});

test('quality-gate surfaces a dedicated skills.metadata check on the plugin workspace', () => {
  const report = runNodeJson(QUALITY_GATE, ['--full', '--strict', '--json'], { cwd: ROOT });
  const checks = Object.fromEntries(report.results.map((item) => [item.check, item]));
  assert.equal(report.gate, 'PASS');
  assert.equal(checks['skills.metadata'].status, 'pass');
  assert.match(checks['skills.metadata'].detail, /skills=\d+/);
  assert.match(checks['skills.metadata'].detail, /warnings=\d+/);
});

test('skill metadata validator blocks executable routing skills with conflicting runtime and framework metadata', () => {
  withTempDir((dir) => {
    writeFiles(dir, skillFiles(
      '---\nname: demo\norigin: EOC\n---\n',
      {
        name: 'demo',
        description: 'demo skill',
        level: 'L3',
        frameworks: ['fastapi'],
        triggers: ['add endpoint'],
        task_family: 'endpoint',
        actions: [{ id: 'demo', type: 'template_scaffold', template: 'x.tpl', default_output: 'x.py', when: { runtime: 'node' } }],
      },
    ));
  }, (dir) => {
    const validation = validateSkillMetadata(dir);
    assert.equal(validation.ok, false);
    assert.equal(validation.failures.some((item) => item.includes('framework/runtime conflict')), true);

    const gateResult = runNodeResult(QUALITY_GATE, ['--json'], { cwd: dir });
    assert.equal(gateResult.code, 1);
    const gate = JSON.parse(gateResult.stdout);
    const checks = Object.fromEntries(gate.results.map((item) => [item.check, item]));
    assert.equal(gate.gate, 'FAIL');
    assert.equal(checks['skills.metadata'].status, 'fail');
  });
});

test('skill-registry carries metadata validation and routing support in json output', () => {
  const result = runNodeResult(SKILL_REGISTRY, ['--write', 'skills/registry.test.json', '--capabilities-write', 'capabilities/registry.test.json'], { cwd: ROOT });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const registryPath = path.join(ROOT, 'skills', 'registry.test.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  assert.equal(typeof registry.counts.metadata_warnings, 'number');
  assert.equal(typeof registry.metadata_validation.ok, 'boolean');
  const expressSkill = registry.skills.find((item) => item.dir === 'add-express-route');
  assert.deepEqual(expressSkill.routing_support.runtimes, ['node']);
  fs.rmSync(registryPath, { force: true });
  fs.rmSync(path.join(ROOT, 'capabilities', 'registry.test.json'), { force: true });
});
