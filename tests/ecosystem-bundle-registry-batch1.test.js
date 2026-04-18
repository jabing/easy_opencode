const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { withTempDir } = require('./test-helpers.js');

test('bundle registry exposes stable built-in bundle definitions', () => {
  const { getBundle, listBundles } = require('../src/core/ecosystem/bundle-registry.js');

  const bundles = listBundles();
  assert.deepEqual(bundles.map((item) => item.id), [
    'node-service',
    'release-governance',
    'lsp-refactor',
    'mcp-devtools',
  ]);

  for (const bundle of bundles) {
    assert.equal(typeof bundle.summary, 'string');
    assert.ok(bundle.summary.length > 0);
    assert.ok(Array.isArray(bundle.requires));
    assert.ok(bundle.requires.every((item) => typeof item === 'string'));
    assert.equal(typeof bundle.contributes, 'object');
    assert.ok(Array.isArray(bundle.contributes.commands));
    assert.ok(Array.isArray(bundle.contributes.hooks));
    assert.ok(Array.isArray(bundle.contributes.workspace_signals));
    assert.equal(typeof bundle.contributes.automation_policy, 'object');
    assert.deepEqual(getBundle(bundle.id), bundle);
  }
});

test('resolveEffectiveBundles merges recommendations and explicit bundle intent with disable precedence', () => {
  const { resolveEffectiveBundles } = require('../src/core/ecosystem/apply-bundles.js');

  const resolution = resolveEffectiveBundles({
    enabled_bundles: ['lsp-refactor', 'release-governance'],
    disabled_bundles: ['mcp-devtools', 'release-governance'],
    recommended_bundles: ['node-service', 'mcp-devtools'],
  });

  assert.deepEqual(resolution.effective_bundles, [
    'node-service',
    'lsp-refactor',
  ]);
  assert.deepEqual(resolution.unknown_bundles, []);
  assert.match(resolution.explanation.join('\n'), /recommended:node-service/);
  assert.match(resolution.explanation.join('\n'), /enabled:lsp-refactor/);
  assert.match(resolution.explanation.join('\n'), /disabled:release-governance/);
  assert.deepEqual(resolution.bundles.map((item) => item.id), resolution.effective_bundles);
});

test('applyBundles writes managed ecosystem state with normalized explicit intent', () => {
  const { applyBundles } = require('../src/core/ecosystem/apply-bundles.js');

  withTempDir(() => {}, (dir) => {
    const result = applyBundles({
      rootDir: dir,
      enabled_bundles: ['lsp-refactor', 'lsp-refactor'],
      disabled_bundles: ['mcp-devtools'],
      recommended_bundles: ['node-service', 'mcp-devtools'],
      bootstrap: { strategy: 'recommend' },
    });

    const ecosystemPath = path.join(dir, '.opencode', 'ecosystem.json');
    assert.equal(fs.existsSync(ecosystemPath), true);

    const persisted = JSON.parse(fs.readFileSync(ecosystemPath, 'utf8'));
    assert.deepEqual(persisted.enabled_bundles, ['lsp-refactor']);
    assert.deepEqual(persisted.disabled_bundles, ['mcp-devtools']);
    assert.deepEqual(persisted.applied_bundles, ['node-service', 'lsp-refactor']);
    assert.deepEqual(persisted.bootstrap, { strategy: 'recommend' });

    assert.equal(result.state.source, 'managed');
    assert.deepEqual(result.state.applied_bundles, ['node-service', 'lsp-refactor']);
    assert.deepEqual(result.effective_bundles, ['node-service', 'lsp-refactor']);
    assert.match(result.explanation.join('\n'), /wrote:/);
  });
});

test('updateEcosystemState preserves existing fields while applying normalized updates', () => {
  const { loadEcosystemState, updateEcosystemState } = require('../src/core/ecosystem/state.js');

  withTempDir(() => {}, (dir) => {
    updateEcosystemState(dir, {
      enabled_bundles: ['node-service'],
      applied_bundles: ['node-service'],
      bootstrap: { applied_at: '2026-04-18T00:00:00.000Z' },
    });

    const updated = updateEcosystemState(dir, {
      enabled_bundles: ['node-service', 'release-governance'],
      disabled_bundles: ['mcp-devtools', 'mcp-devtools'],
    });

    assert.deepEqual(updated.enabled_bundles, ['node-service', 'release-governance']);
    assert.deepEqual(updated.disabled_bundles, ['mcp-devtools']);
    assert.deepEqual(updated.applied_bundles, ['node-service']);
    assert.deepEqual(updated.bootstrap, { applied_at: '2026-04-18T00:00:00.000Z' });

    const reloaded = loadEcosystemState(dir);
    assert.equal(reloaded.source, 'managed');
    assert.deepEqual(reloaded.enabled_bundles, ['node-service', 'release-governance']);
    assert.deepEqual(reloaded.disabled_bundles, ['mcp-devtools']);
    assert.deepEqual(reloaded.bootstrap, { applied_at: '2026-04-18T00:00:00.000Z' });
  });
});
