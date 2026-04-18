const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { buildCommandRegistry, validateCommandRegistry } = require('../src/cli/command-registry.js');
const { hasNamedContract, listKnownContracts, assertNamedContract } = require('../src/shared/contracts.js');

function mktemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-ten-point-'));
}

test('public JSON commands declare known contracts', () => {
  const entries = buildCommandRegistry(path.resolve(__dirname, '..')).filter((entry) => entry.surface === 'public' && entry.supports_json);
  assert.ok(entries.length > 5);
  for (const entry of entries) {
    assert.equal(typeof entry.contract_name, 'string');
    assert.equal(hasNamedContract(entry.contract_name), true, `missing contract for ${entry.script}`);
  }
});

test('command registry validation enforces lifecycle and compatibility policy', () => {
  const result = validateCommandRegistry(path.resolve(__dirname, '..'));
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  const publicEntries = result.entries.filter((entry) => entry.surface === 'public');
  assert.ok(publicEntries.every((entry) => entry.lifecycle));
  assert.ok(publicEntries.every((entry) => entry.compatibility));
});

test('known contracts include sprint-expanded automation commands', () => {
  const contracts = listKnownContracts();
  for (const name of ['feature-acceptance', 'failure-strategy', 'delivery-report', 'review-gate', 'command-registry', 'detect-project-runtime']) {
    assert.ok(contracts.includes(name), `${name} missing`);
  }
});

test('create-check, create-gate, and create-runner generators create expected files', () => {
  const tmp = mktemp();
  fs.mkdirSync(path.join(tmp, 'scripts', 'runners'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src', 'core', 'checks'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src', 'core', 'gates'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src', 'core', 'project-profile', 'runners'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'tests'), { recursive: true });
  const rootDir = path.resolve(__dirname, '..');
  let result = spawnSync(process.execPath, ['scripts/create-check.js', 'api-contract-check', '--root', tmp], { cwd: rootDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  result = spawnSync(process.execPath, ['scripts/create-gate.js', 'merge-safety-gate', '--root', tmp], { cwd: rootDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  result = spawnSync(process.execPath, ['scripts/create-runner.js', 'rust', '--root', tmp], { cwd: rootDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(tmp, 'src', 'core', 'checks', 'api-contract-check.js')), true);
  assert.equal(fs.existsSync(path.join(tmp, 'src', 'core', 'gates', 'merge-safety-gate.js')), true);
  assert.equal(fs.existsSync(path.join(tmp, 'src', 'core', 'project-profile', 'runners', 'rust.js')), true);
  assert.equal(fs.existsSync(path.join(tmp, 'scripts', 'runners', 'rust.js')), true);
});

test('command registry JSON payload satisfies contract', () => {
  const payload = { schema_name: 'command_registry', schema_version: '1.0', entries: buildCommandRegistry(path.resolve(__dirname, '..')).slice(0, 3) };
  assert.doesNotThrow(() => assertNamedContract('command-registry', payload));
});
