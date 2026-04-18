const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { buildCommandRegistry, validateCommandRegistry } = require('../src/cli/command-registry.js');
const { listKnownContracts, assertNamedContract } = require('../src/shared/contracts.js');

function mktemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-final-round2-'));
}

test('all JSON-capable managed commands declare a contract', () => {
  const result = validateCommandRegistry(path.resolve(__dirname, '..'));
  assert.equal(result.ok, true, result.errors.join('\n'));
  const jsonEntries = result.entries.filter((entry) => entry.supports_json);
  assert.ok(jsonEntries.length > 10);
  for (const entry of jsonEntries) {
    const hasSingle = typeof entry.contract_name === 'string';
    const hasMulti = Array.isArray(entry.json_contracts) && entry.json_contracts.length > 0;
    assert.equal(hasSingle || hasMulti, true, `${entry.script} missing contract metadata`);
  }
});

test('known contracts include internal JSON subviews and wrapper payloads', () => {
  const contracts = new Set(listKnownContracts());
  for (const name of [
    'command-compatibility',
    'command-registry-validation',
    'orchestrator-state',
    'model-route-view',
    'model-route-plan',
    'observability-events',
    'observability-benchmarks',
    'benchmark-compare',
    'benchmark-trends',
    'benchmark-feedback',
    'analyze-project-structure',
    'implementation-context',
    'implementation-context-envelope',
    'project-memory-sync',
    'debug-fix-loop',
    'scaffold-output',
  ]) {
    assert.ok(contracts.has(name), `${name} missing`);
  }
});

test('legacy internal wrappers are explicitly deprecated in the registry', () => {
  const entries = buildCommandRegistry(path.resolve(__dirname, '..'));
  for (const script of ['analyze-project-structure', 'prepare-implementation-context', 'enrich-implementation-context', 'sync-project-memory', 'debug-fix-loop']) {
    const entry = entries.find((item) => item.script === script);
    assert.ok(entry, `${script} missing`);
    assert.equal(entry.lifecycle, 'deprecated');
    assert.equal(entry.replacement, 'internal-tools');
  }
});

test('command-registry compatibility JSON satisfies contract', () => {
  const rootDir = path.resolve(__dirname, '..');
  const result = spawnSync(process.execPath, ['scripts/command-registry.js', 'compatibility', '--json'], { cwd: rootDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.doesNotThrow(() => assertNamedContract('command-compatibility', payload));
});

test('legacy analyze-project-structure wrapper forwards through internal-tools', () => {
  const tmp = mktemp();
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));
  const rootDir = path.resolve(__dirname, '..');
  const result = spawnSync(process.execPath, ['scripts/analyze-project-structure.js', '--root', tmp, '--json'], { cwd: rootDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.doesNotThrow(() => assertNamedContract('analyze-project-structure', payload));
});
