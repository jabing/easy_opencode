const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { main } = require('../src/cli/ecosystem-cli.js');

function runCli(argv, overrides = {}) {
  let stdout = '';
  let stderr = '';
  let exitCode = null;
  main({
    argv,
    stdout: { write(chunk) { stdout += String(chunk); } },
    stderr: { write(chunk) { stderr += String(chunk); } },
    exit(code) { exitCode = code; },
    formatManagedInvocation(command, args) {
      return ['node', 'scripts/ecosystem.js', command].concat(args || []).join(' ');
    },
    loadEcosystemState(root) {
      return { schema_version: 1, enabled_bundles: ['release-governance'], applied_bundles: [], disabled_bundles: [], root };
    },
    buildWorkspaceProfile(root) {
      return { recommended_bundles: ['node-service', 'release-governance'], explanation: [`root=${root}`, 'detector=tooling'] };
    },
    listBundles() {
      return [
        { id: 'node-service', summary: 'Node service defaults' },
        { id: 'release-governance', summary: 'Release governance defaults' },
      ];
    },
    applyBundles(options) {
      return { ok: true, root: options.rootDir, command: options.command, bundle_ids: options.bundle_ids };
    },
    ...overrides,
  });
  return { stdout, stderr, exitCode };
}

test('ecosystem status emits state and derived profile as JSON', () => {
  const result = runCli(['node', 'ecosystem', 'status', '--json']);
  assert.equal(result.exitCode, null);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.command, 'status');
  assert.ok(payload.root);
  assert.deepEqual(payload.ecosystem_state.enabled_bundles, ['release-governance']);
  assert.deepEqual(payload.workspace_profile.recommended_bundles, ['node-service', 'release-governance']);
});

test('ecosystem list emits built-in bundles', () => {
  const result = runCli(['node', 'ecosystem', 'list', '--json']);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.command, 'list');
  assert.equal(payload.bundles.length, 2);
  assert.equal(payload.bundles[0].id, 'node-service');
});

test('ecosystem recommend returns recommendations without mutation', () => {
  let applyCalled = false;
  const result = runCli(['node', 'ecosystem', 'recommend', '--json'], {
    applyBundles() {
      applyCalled = true;
      return { ok: true };
    },
  });
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.command, 'recommend');
  assert.deepEqual(payload.recommendations, ['node-service', 'release-governance']);
  assert.equal(applyCalled, false);
});

test('ecosystem enable forwards explicit bundle ids to applyBundles', () => {
  const result = runCli(['node', 'ecosystem', 'enable', '--bundle', 'node-service', '--bundle', 'mcp-devtools', '--json']);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.command, 'enable');
  assert.deepEqual(payload.result.bundle_ids, ['node-service', 'mcp-devtools']);
});

test('ecosystem disable requires at least one bundle id', () => {
  const result = runCli(['node', 'ecosystem', 'disable']);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /requires at least one --bundle/i);
});

test('ecosystem usage is shown for help requests', () => {
  const result = runCli(['node', 'ecosystem', '--help']);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /ecosystem status/);
});
