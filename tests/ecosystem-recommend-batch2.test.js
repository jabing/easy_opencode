const test = require('node:test');
const assert = require('node:assert/strict');
const { withTempDir, writeFiles } = require('./test-helpers.js');

test('buildWorkspaceProfile returns preset recommendations alongside bundle recommendations', () => {
  const { buildWorkspaceProfile } = require('../src/core/ecosystem/workspace-profile.js');

  withTempDir(() => {}, (dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0' }, null, 2),
      'package-lock.json': JSON.stringify({ name: 'fixture-node', lockfileVersion: 3 }, null, 2),
      '.github/workflows/ci.yml': 'name: ci\n',
      '.opencode/product-mode.json': JSON.stringify({ schema_version: '1.0', mode: 'team' }, null, 2),
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }, null, 2),
      '.opencode/lsp.json': JSON.stringify({ provider: 'typescript-language-server' }, null, 2),
    });

    const profile = buildWorkspaceProfile(dir);

    assert.deepEqual(profile.recommended_presets, ['node-team']);
    assert.deepEqual(
      profile.preset_recommendations.map((entry) => [entry.preset, entry.reason]),
      [['node-team', 'mode=team+runtime=node']],
    );
    assert.deepEqual(profile.recommended_bundles, ['release-governance', 'node-service', 'lsp-refactor']);
    assert.match(profile.explanation.join(' | '), /recommend:preset:node-team:mode=team\+runtime=node/);
  });
});

test('buildWorkspaceProfile suppresses preset recommendations that conflict with disabled bundles', () => {
  const { buildWorkspaceProfile } = require('../src/core/ecosystem/workspace-profile.js');

  withTempDir(() => {}, (dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0' }, null, 2),
      'package-lock.json': JSON.stringify({ name: 'fixture-node', lockfileVersion: 3 }, null, 2),
      '.github/workflows/ci.yml': 'name: ci\n',
      '.opencode/product-mode.json': JSON.stringify({ schema_version: '1.0', mode: 'platform' }, null, 2),
      '.opencode/mcp.json': JSON.stringify({ servers: { devtools: { command: 'node' } } }, null, 2),
      '.opencode/ecosystem.json': JSON.stringify({
        schema_version: 1,
        disabled_bundles: ['mcp-devtools'],
      }, null, 2),
    });

    const profile = buildWorkspaceProfile(dir);

    assert.deepEqual(profile.recommended_presets, []);
    assert.deepEqual(profile.preset_recommendations, []);
    assert.equal(profile.recommended_bundles.includes('node-service'), true);
    assert.equal(profile.recommended_bundles.includes('mcp-devtools'), false);
  });
});
