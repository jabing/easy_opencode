const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { buildCapabilityRegistry } = require('../src/core/capabilities/registry.js');
const { buildSupportTierReport } = require('../src/core/support-tiers/report.js');
const { main } = require('../src/cli/ecosystem-cli.js');

const ROOT = path.resolve(__dirname, '..');

function runEcosystemCli(argv, overrides = {}) {
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
      return {
        schema_version: 1,
        enabled_bundles: [],
        applied_bundles: [],
        disabled_bundles: [],
        bootstrap: null,
        mode_overrides: {},
        automation_policy_overrides: {},
        source: 'default',
        file_path: path.join(root, '.opencode', 'ecosystem.json'),
      };
    },
    buildWorkspaceProfile() {
      return {
        recommended_bundles: ['node-service', 'release-governance', 'lsp-refactor'],
        recommended_presets: ['node-team'],
        preset_recommendations: [{ preset: 'node-team', source: 'detector', reason: 'mode=team+runtime=node' }],
        effective_bundles: ['node-service', 'release-governance', 'lsp-refactor'],
        explanation: ['recommend:preset:node-team:mode=team+runtime=node'],
      };
    },
    listBundles() {
      return [
        { id: 'node-service', summary: 'Node service defaults' },
        { id: 'release-governance', summary: 'Release governance defaults' },
        { id: 'lsp-refactor', summary: 'LSP refactor defaults' },
      ];
    },
    applyBundles() {
      return { ok: true };
    },
    ...overrides,
  });

  return { stdout, stderr, exitCode };
}

test('ecosystem recommend emits preset recommendations and resolved bundle plan', () => {
  const result = runEcosystemCli(['node', 'ecosystem', 'recommend', '--json']);
  assert.equal(result.exitCode, null);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.recommendations, ['node-service', 'release-governance', 'lsp-refactor']);
  assert.deepEqual(payload.recommended_presets, ['node-team']);
  assert.deepEqual(payload.preset_recommendations, [{ preset: 'node-team', source: 'detector', reason: 'mode=team+runtime=node' }]);
  assert.deepEqual(payload.resolved_bundle_plan, ['node-service', 'release-governance', 'lsp-refactor']);
});

test('capability registry exposes ecosystem bundles and presets metadata', () => {
  const registry = buildCapabilityRegistry(ROOT);
  assert.equal(registry.ecosystem.bundle_count, 4);
  assert.equal(registry.ecosystem.preset_count, 4);
  assert.ok(registry.ecosystem.public_surfaces.includes('bootstrap'));
  assert.ok(registry.ecosystem.public_surfaces.includes('ecosystem'));
  assert.ok(registry.ecosystem.presets.some((preset) => preset.id === 'node-team'));
  assert.ok(registry.ecosystem.bundles.some((bundle) => bundle.id === 'mcp-devtools'));
});

test('support-tier report includes ecosystem maturity and automation coverage', () => {
  const report = buildSupportTierReport(ROOT);
  assert.equal(report.domains.ecosystem.support_tier, 'tier1');
  assert.equal(report.domains.ecosystem.maturity, 'preset-backed');
  assert.equal(report.domains.ecosystem.automation_coverage.bootstrap, 'public');
  assert.equal(report.domains.ecosystem.automation_coverage.ecosystem, 'managed');
  assert.equal(report.scripts.bootstrap.support_tier, 'tier1');
  assert.deepEqual(new Set(report.scripts.bootstrap.support_scope.bundles), new Set(['node-service', 'release-governance', 'lsp-refactor', 'mcp-devtools']));
});
