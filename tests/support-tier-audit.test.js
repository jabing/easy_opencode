const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { buildSupportTierReport } = require('../src/core/support-tiers/report.js');
const { buildCapabilityRegistry } = require('../src/core/capabilities/registry.js');
const { describeProviders } = require('../src/core/refactor/service.js');
const { runNodeJson, runNodeResult } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const SUPPORT_TIER_AUDIT = path.join(ROOT, 'scripts', 'support-tier-audit.js');
const EOC_SCRIPT = path.join(ROOT, 'bin', 'eoc-script.js');


test('support-tier report distinguishes ast and indexed refactor coverage', () => {
  const report = buildSupportTierReport(ROOT);
  assert.equal(report.domains.feature_generation.support_tier, 'tier1');
  assert.equal(report.domains.semantic_refactor.support_tier, 'tier2');
  assert.deepEqual(new Set(report.domains.semantic_refactor.accepted_languages), new Set(['typescript', 'javascript', 'python']));
  assert.deepEqual(new Set(report.domains.semantic_refactor.indexed_languages), new Set(['go', 'java']));
  assert.deepEqual(new Set(report.domains.semantic_refactor.extended_languages), new Set(['typescript', 'javascript', 'python', 'go', 'java']));
  assert.deepEqual(new Set(report.domains.semantic_refactor.missing_target_languages), new Set([]));
  assert.equal(report.domains.framework_wiring.support_tier, 'tier2');
  assert.ok(report.domains.framework_wiring.skills.some((skill) => skill.id === 'add-fastapi-endpoint'));
  assert.ok(report.domains.framework_wiring.skills.some((skill) => skill.id === 'add-go-handler'));
  assert.ok(report.domains.framework_wiring.skills.some((skill) => skill.id === 'add-spring-controller'));
});


test('capability registry writes semantic refactor promotion into the ast-rewrite script tier', () => {
  const registry = buildCapabilityRegistry(ROOT);
  const astRewrite = registry.capabilities.find((item) => item.id === 'script:ast-rewrite');
  assert.ok(astRewrite);
  assert.equal(astRewrite.support_tier, 'tier2');
  assert.ok(Array.isArray(astRewrite.metadata.acceptance.provider_profiles));
  assert.ok(astRewrite.metadata.acceptance.provider_profiles.some((provider) => provider.id === 'python-semantic' && provider.support_tier === 'tier1'));
  assert.deepEqual(new Set(astRewrite.metadata.support_scope.languages), new Set(['typescript', 'javascript', 'python', 'go', 'java']));
  assert.deepEqual(new Set(astRewrite.metadata.support_scope.indexed_languages), new Set(['go', 'java']));
});


test('refactor provider catalog surfaces support tiers and the audit script emits the same semantic tier', () => {
  const providers = describeProviders();
  const goProvider = providers.find((provider) => provider.id === 'go-semantic');
  const fallback = providers.find((provider) => provider.id === 'text-fallback');
  assert.ok(goProvider);
  assert.equal(goProvider.support_tier, 'tier2');
  assert.equal(goProvider.execution_mode, 'indexed_symbol');
  assert.equal(goProvider.cross_file_symbol_graph, true);
  assert.equal(goProvider.ambiguity_safe, true);
  assert.equal(goProvider.conflict_safe_failures, true);
  assert.deepEqual(goProvider.missing_primitives, []);
  assert.ok(fallback);
  assert.equal(fallback.support_tier, 'tier3');

  const report = runNodeJson(SUPPORT_TIER_AUDIT, ['--root', ROOT, '--json'], { cwd: ROOT });
  assert.equal(report.scripts['ast-rewrite'].support_tier, 'tier2');
  const goProfile = report.scripts['ast-rewrite'].acceptance.provider_profiles.find((provider) => provider.id === 'go-semantic');
  assert.ok(goProfile);
  assert.equal(goProfile.cross_file_symbol_graph, true);
  assert.equal(goProfile.ambiguity_safe, true);
  assert.equal(goProfile.conflict_safe_failures, true);
  assert.equal(report.scripts['generate-feature'].support_tier, 'tier1');
});

test('support-tier audit works through the managed launcher without legacy wrapper flags', () => {
  const result = runNodeResult(EOC_SCRIPT, ['support-tier-audit', '--root', ROOT, '--json'], { cwd: ROOT });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.domains.semantic_refactor.support_tier, 'tier2');
  assert.equal(report.domains.framework_wiring.support_tier, 'tier2');
  assert.match(result.stderr, /^$/);
});
