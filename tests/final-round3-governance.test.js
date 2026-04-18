const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { buildCommandRegistry } = require('../src/cli/command-registry.js');
const { assertNamedContract, listKnownContracts } = require('../src/shared/contracts.js');

function mktemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-final-round3-'));
}

test('json-capable internal commands declare contract_name or json_contracts', () => {
  const entries = buildCommandRegistry(path.resolve(__dirname, '..')).filter((entry) => entry.surface === 'internal' && entry.supports_json);
  assert.ok(entries.length > 5);
  for (const entry of entries) {
    const hasSingle = typeof entry.contract_name === 'string';
    const hasMulti = Array.isArray(entry.json_contracts) && entry.json_contracts.length > 0;
    assert.equal(hasSingle || hasMulti, true, `${entry.script} missing contract metadata`);
  }
});

test('known contracts include release-override, safe-apply, capability-registry, and skill-runner subviews', () => {
  const known = new Set(listKnownContracts());
  for (const name of ['release-override', 'safe-apply', 'capability-registry', 'skill-runner-list', 'skill-runner-show', 'skill-runner-match', 'skill-runner-capabilities']) {
    assert.ok(known.has(name), `${name} missing`);
  }
});

test('internal-tools grouped routing delegates model-route plan json', () => {
  const rootDir = path.resolve(__dirname, '..');
  const result = spawnSync(process.execPath, ['scripts/internal-tools.js', 'routing', 'model-route', 'plan', '--objective', 'fix auth bug', '--json'], { cwd: rootDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.doesNotThrow(() => assertNamedContract('model-route-plan', payload));
});

test('legacy model-route wrapper remains a compatibility thin shell', () => {
  const rootDir = path.resolve(__dirname, '..');
  const result = spawnSync(process.execPath, ['scripts/model-route.js', 'show', '--json'], { cwd: rootDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.doesNotThrow(() => assertNamedContract('model-route-view', payload));
});

test('release-override and capability-registry json outputs satisfy new contracts', () => {
  const tmp = mktemp();
  fs.mkdirSync(path.join(tmp, '.opencode', 'release'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.opencode', 'release', 'policy-overrides.json'), '[]');
  const rootDir = path.resolve(__dirname, '..');
  let result = spawnSync(process.execPath, ['scripts/release-override.js', 'list', '--root', tmp, '--json'], { cwd: rootDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotThrow(() => assertNamedContract('release-override', JSON.parse(result.stdout)));
  result = spawnSync(process.execPath, ['scripts/capability-registry.js', '--root', rootDir, '--json', '--no-write'], { cwd: rootDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotThrow(() => assertNamedContract('capability-registry', JSON.parse(result.stdout)));
});
