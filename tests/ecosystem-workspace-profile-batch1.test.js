const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { withTempDir, writeFiles } = require('./test-helpers.js');

test('buildWorkspaceProfile detects package manager and CI markers from local repository facts', () => {
  const { buildWorkspaceProfile } = require('../src/core/ecosystem/workspace-profile.js');

  withTempDir(() => {}, (dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0' }, null, 2),
      'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
      '.github/workflows/ci.yml': 'name: ci\n',
    });

    const profile = buildWorkspaceProfile(dir);

    assert.equal(profile.tooling.package_manager, 'pnpm');
    assert.deepEqual(profile.tooling.ci_providers, ['github-actions']);
    assert.deepEqual(profile.detected_runtimes, ['node']);
    assert.ok(profile.tooling.markers.includes('package.json'));
    assert.equal(profile.detectors.tooling.summary, 'package_manager=pnpm ci=github-actions runtimes=node');
    assert.equal(profile.recommended_bundles.includes('node-service'), true);
    assert.match(profile.explanation.join(' | '), /tooling:package_manager=pnpm/);
    assert.match(profile.explanation.join(' | '), /tooling:ci=github-actions/);
  });
});

test('buildWorkspaceProfile aggregates deterministic LSP and MCP signals into recommendations', () => {
  const { buildWorkspaceProfile } = require('../src/core/ecosystem/workspace-profile.js');

  withTempDir(() => {}, (dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0' }, null, 2),
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }, null, 2),
      '.opencode/lsp.json': JSON.stringify({ provider: 'typescript-language-server' }, null, 2),
      '.opencode/mcp.json': JSON.stringify({ servers: { local: { command: 'node' } } }, null, 2),
    });

    const profile = buildWorkspaceProfile(dir);

    assert.equal(profile.lsp.available, true);
    assert.deepEqual(profile.lsp.signals, ['opencode-lsp-config', 'tsconfig']);
    assert.equal(profile.detectors.lsp.summary, 'signals=opencode-lsp-config,tsconfig');
    assert.equal(profile.mcp.available, true);
    assert.deepEqual(profile.mcp.signals, ['opencode-mcp-config']);
    assert.equal(profile.detectors.mcp.summary, 'signals=opencode-mcp-config');
    assert.equal(profile.recommended_bundles.includes('lsp-refactor'), true);
    assert.equal(profile.recommended_bundles.includes('mcp-devtools'), true);
  });
});

test('buildWorkspaceProfile generates mode-aware recommendations with stable explanation ordering', () => {
  const { buildWorkspaceProfile } = require('../src/core/ecosystem/workspace-profile.js');

  withTempDir(() => {}, (dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0' }, null, 2),
      'package-lock.json': JSON.stringify({ name: 'fixture-node', lockfileVersion: 3 }, null, 2),
      '.github/workflows/release.yml': 'name: release\n',
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }, null, 2),
      '.opencode/lsp.json': JSON.stringify({ provider: 'typescript-language-server' }, null, 2),
      '.opencode/mcp.json': JSON.stringify({ servers: { devtools: { command: 'node' } } }, null, 2),
      '.opencode/product-mode.json': JSON.stringify({ schema_version: '1.0', mode: 'team' }, null, 2),
      '.opencode/ecosystem.json': JSON.stringify({
        schema_version: 1,
        enabled_bundles: ['release-governance'],
        disabled_bundles: ['mcp-devtools'],
      }, null, 2),
    });

    const profile = buildWorkspaceProfile(dir);

    assert.equal(profile.mode.id, 'team');
    assert.deepEqual(profile.recommended_bundles, ['release-governance', 'node-service', 'lsp-refactor']);
    assert.deepEqual(
      profile.recommendations.map((entry) => [entry.bundle, entry.source]),
      [
        ['release-governance', 'enabled'],
        ['node-service', 'detector'],
        ['lsp-refactor', 'detector'],
      ],
    );
    assert.deepEqual(
      profile.explanation.filter((entry) => entry.startsWith('recommend:') && !entry.startsWith('recommend:preset:')),
      [
        'recommend:release-governance:enabled_bundle',
        'recommend:node-service:package_manager=npm',
        'recommend:lsp-refactor:lsp_signal=opencode-lsp-config',
      ],
    );
    assert.deepEqual(profile.recommended_presets, ['node-team', 'release-governance']);
    assert.deepEqual(
      profile.preset_recommendations.map((entry) => [entry.preset, entry.source]),
      [
        ['node-team', 'detector'],
        ['release-governance', 'enabled'],
      ],
    );
    assert.equal(profile.recommended_bundles.includes('mcp-devtools'), false);
    assert.equal(profile.effective_bundles.includes('release-governance'), true);
    assert.equal(profile.effective_bundles.includes('mcp-devtools'), false);
    assert.deepEqual(Object.keys(profile.detectors), ['tooling', 'lsp', 'mcp']);
    assert.equal(profile.state.source, 'managed');
    assert.equal(profile.state.file_path, path.join(dir, '.opencode', 'ecosystem.json'));
  });
});
