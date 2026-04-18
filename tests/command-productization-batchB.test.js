const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildCommandRegistry, validateCommandRegistry } = require('../src/cli/command-registry.js');
const { runNodeJson, runNodeResult, withTempDir } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');

test('command registry validates managed scripts and package aliases', () => {
  const result = validateCommandRegistry(ROOT);
  assert.equal(result.ok, true);
  assert.ok(result.entries.length >= 40);
  assert.ok(result.main_entries.some((item) => item.command === 'ship'));
});

test('command registry exposes public governance and core commands', () => {
  const entries = buildCommandRegistry(ROOT);
  const publicEntries = entries.filter((item) => item.surface === 'public');
  assert.ok(publicEntries.some((item) => item.script === 'project-profile' && item.tier === 'core'));
  assert.ok(publicEntries.some((item) => item.script === 'release-evidence' && item.tier === 'governance'));
  assert.ok(publicEntries.some((item) => item.script === 'platform-report' && item.supports_json === true));
});

test('command-registry CLI returns stable JSON envelope', () => {
  const payload = runNodeJson(path.join(ROOT, 'scripts', 'command-registry.js'), ['list', '--json', '--public'], { cwd: ROOT });
  assert.equal(payload.schema_name, 'command_registry');
  assert.equal(payload.schema_version, '1.0');
  assert.ok(Array.isArray(payload.entries));
  assert.ok(payload.entries.some((item) => item.script === 'quality-gate'));
});

test('create-command scaffolds command core, script, docs, and test files', () => withTempDir(
  (dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2));
  },
  (dir) => {
    const payload = runNodeJson(path.join(ROOT, 'scripts', 'create-command.js'), ['demo-insight', '--summary', 'Demo insight report', '--root', dir], { cwd: ROOT });
    assert.equal(payload.ok, true);
    assert.equal(payload.command, 'demo-insight');
    const expected = [
      path.join(dir, 'src', 'core', 'demo-insight.js'),
      path.join(dir, 'scripts', 'demo-insight.js'),
      path.join(dir, 'tests', 'demo-insight.test.js'),
      path.join(dir, 'docs', 'commands', 'demo-insight.md'),
    ];
    for (const file of expected) assert.equal(fs.existsSync(file), true, `expected scaffold file ${file}`);
  },
));

test('eoc-script rejects unknown managed scripts with actionable guidance', () => {
  const result = runNodeResult(path.join(ROOT, 'bin', 'eoc-script.js'), ['missing-script'], { cwd: ROOT });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown managed script/);
  assert.match(result.stderr, /command-registry/);
});
