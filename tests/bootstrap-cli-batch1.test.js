const test = require('node:test');
const assert = require('node:assert/strict');
const { main } = require('../src/cli/bootstrap-cli.js');

function runCli(argv, overrides = {}) {
  let stdout = '';
  let stderr = '';
  let exitCode = null;
  /** @type {Array<Record<string, unknown>>} */
  const calls = [];

  main({
    argv,
    stdout: { write(chunk) { stdout += String(chunk); } },
    stderr: { write(chunk) { stderr += String(chunk); } },
    exit(code) { exitCode = code; },
    formatManagedInvocation(command, args) {
      return ['node', 'scripts/bootstrap.js', command].concat(args || []).join(' ');
    },
    bootstrapEcosystem(rootDir, options) {
      calls.push({ rootDir, ...options });
      return {
        root_dir: rootDir,
        apply: Boolean(options.apply),
        changed: Boolean(options.apply),
        selected_presets: options.presets || [],
        selected_bundles: options.bundles || [],
        recommended_presets: ['node-team'],
        recommended_bundles: ['node-service', 'release-governance'],
        effective_bundles: ['node-service', 'release-governance'],
        verification: options.apply ? { ok: true, persisted: true } : { ok: true, persisted: false },
      };
    },
    ...overrides,
  });

  return { stdout, stderr, exitCode, calls };
}

test('bootstrap defaults to preview mode and does not mutate state', () => {
  const result = runCli(['node', 'bootstrap', '--json']);
  assert.equal(result.exitCode, null);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].apply, false);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.command, 'bootstrap');
  assert.equal(payload.result.apply, false);
  assert.equal(payload.result.changed, false);
  assert.deepEqual(payload.result.recommended_presets, ['node-team']);
});

test('bootstrap apply forwards preset and bundle selections to shared bootstrap helper', () => {
  const result = runCli(['node', 'bootstrap', '--apply', '--preset', 'node-team', '--bundle', 'release-governance', '--json']);
  assert.equal(result.exitCode, null);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].apply, true);
  assert.deepEqual(result.calls[0].presets, ['node-team']);
  assert.deepEqual(result.calls[0].bundles, ['release-governance']);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.result.apply, true);
  assert.equal(payload.result.changed, true);
  assert.deepEqual(payload.result.selected_presets, ['node-team']);
  assert.deepEqual(payload.result.selected_bundles, ['release-governance']);
  assert.deepEqual(payload.result.verification, { ok: true, persisted: true });
});

test('bootstrap surfaces stable errors for invalid preset requests', () => {
  const result = runCli(['node', 'bootstrap', '--apply', '--preset', 'missing-preset'], {
    bootstrapEcosystem() {
      throw new Error('unknown preset: missing-preset');
    },
  });

  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /unknown preset: missing-preset/i);
  assert.match(result.stderr, /Usage:/);
});

test('bootstrap usage is shown for help requests', () => {
  const result = runCli(['node', 'bootstrap', '--help']);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /bootstrap --apply --preset node-team/);
});
