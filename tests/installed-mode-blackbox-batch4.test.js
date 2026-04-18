const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, runNodeResult, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const INSTALL = path.join(ROOT, 'scripts', 'install.js');
const UNINSTALL = path.join(ROOT, 'scripts', 'uninstall.js');
const EOC_BIN = path.join(ROOT, 'bin', 'eoc.js');

function seedProject(dir) {
  writeFiles(dir, {
    'package.json': JSON.stringify({
      name: 'fixture-app',
      version: '1.0.0',
      scripts: { test: 'node --test' },
    }, null, 2) + '\n',
    'opencode.json': JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      default_agent: 'custom-agent',
      instructions: ['./docs/team.md'],
      plugin: ['./plugins/local'],
      agent: {
        'custom-agent': {
          description: 'local agent',
          prompt: '{file:./docs/team.md}',
          tools: { read: true, write: false, edit: false, bash: false },
        },
      },
      command: {
        'local-command': {
          description: 'custom command',
          template: '{file:./docs/team.md}',
          agent: 'custom-agent',
          subtask: false,
        },
      },
    }, null, 2) + '\n',
    'docs/team.md': '# Local Team Guide\n',
    'plugins/local/index.js': 'module.exports = {}\n',
    'scripts/local-tool.js': '#!/usr/bin/env node\nconsole.log("local tool")\n',
    'tests/smoke.test.js': 'const test = require("node:test");\nconst assert = require("node:assert/strict");\ntest("smoke", () => assert.equal(1, 1));\n',
  });
}

test('project install copies runnable assets, creates managed shims, and merges config without clobbering local entries', () => {
  withTempDir((dir) => seedProject(dir), (dir) => {
    const install = runNodeResult(INSTALL, ['--project', '--yes', '--quiet', '--target', dir], { cwd: ROOT });
    assert.equal(install.code, 0, install.stderr || install.stdout);

    const assetRoot = path.join(dir, '.opencode', 'easy-opencode');
    assert.equal(fs.existsSync(path.join(assetRoot, 'scripts', 'project-profile.js')), true);
    assert.equal(fs.existsSync(path.join(assetRoot, 'src', 'core', 'project-profile.js')), true);
    assert.equal(fs.existsSync(path.join(assetRoot, 'commands', 'plan.md')), true);

    const shimPath = path.join(dir, 'scripts', 'project-profile.js');
    assert.equal(fs.existsSync(shimPath), true);
    assert.match(fs.readFileSync(shimPath, 'utf8'), /Easy OpenCode script shim/);

    const config = JSON.parse(fs.readFileSync(path.join(dir, 'opencode.json'), 'utf8'));
    assert.equal(config.default_agent, 'custom-agent');
    assert.ok(config.instructions.includes('./docs/team.md'));
    assert.ok(config.instructions.some((item) => item.startsWith('./.opencode/easy-opencode/')));
    assert.ok(config.plugin.includes('./plugins/local'));
    assert.ok(config.plugin.includes('./.opencode/easy-opencode/.opencode/plugins'));
    assert.ok(config.agent['custom-agent']);
    assert.ok(config.agent.eoc_orchestrator);
    assert.ok(config.command['local-command']);
    assert.ok(config.command.plan);

    const profile = runNodeJson(shimPath, ['--json'], { cwd: dir });
    assert.equal(profile.runtime, 'node');
    assert.equal(profile.language, 'javascript');
  });
});

test('project uninstall removes managed assets and shims but preserves unrelated local scripts and config', () => {
  withTempDir((dir) => seedProject(dir), (dir) => {
    const install = runNodeResult(INSTALL, ['--project', '--yes', '--quiet', '--target', dir], { cwd: ROOT });
    assert.equal(install.code, 0, install.stderr || install.stdout);

    const uninstall = runNodeResult(UNINSTALL, ['--project', '--yes', '--target', dir], { cwd: ROOT });
    assert.equal(uninstall.code, 0, uninstall.stderr || uninstall.stdout);

    assert.equal(fs.existsSync(path.join(dir, '.opencode', 'easy-opencode')), false);
    assert.equal(fs.existsSync(path.join(dir, 'scripts', 'project-profile.js')), false);
    assert.equal(fs.existsSync(path.join(dir, 'scripts', 'local-tool.js')), true);

    const config = JSON.parse(fs.readFileSync(path.join(dir, 'opencode.json'), 'utf8'));
    assert.equal(config.default_agent, 'custom-agent');
    assert.deepEqual(config.instructions, ['./docs/team.md']);
    assert.deepEqual(config.plugin, ['./plugins/local']);
    assert.deepEqual(Object.keys(config.agent), ['custom-agent']);
    assert.deepEqual(Object.keys(config.command), ['local-command']);
  });
});

test('main eoc CLI executes black-box test and plan flows against an external project', () => {
  withTempDir((dir) => seedProject(dir), (dir) => {
    const testResult = runNodeResult(EOC_BIN, ['test', '--target', 'tests/smoke.test.js'], { cwd: dir });
    assert.equal(testResult.code, 0, testResult.stderr || testResult.stdout);
    assert.match(testResult.stdout, /PASS tests\/smoke.test.js/);
    assert.match(testResult.stdout, /Summary: pass=1 fail=0/);

    const planResult = runNodeResult(EOC_BIN, ['plan'], { cwd: dir });
    assert.equal(planResult.code, 0, planResult.stderr || planResult.stdout);
    const profile = JSON.parse(planResult.stdout);
    assert.equal(profile.runtime, 'node');
    assert.equal(profile.language, 'javascript');
  });
});
