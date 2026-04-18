const { listFeatureProviders } = require('../feature/providers.js');
const { readAllSkills } = require('../skills/manifest.js');
const { listRegisteredRefactorProviders } = require('../refactor/providers/index.js');
const { listBundles } = require('../ecosystem/bundle-registry.js');
const { listPresets } = require('../ecosystem/presets.js');

/**
 * @typedef {{
 *   id: string,
 *   label?: string,
 *   execution_mode?: string,
 *   supported_primitives?: unknown[],
 *   supported_languages?: unknown[],
 *   isAvailable?: (() => boolean) | null,
 *   isLspAvailable?: (() => boolean) | null,
 *   cross_file_symbol_graph?: boolean,
 *   ambiguity_safe?: boolean,
 *   conflict_safe_failures?: boolean,
 *   experimental_lsp_backend?: boolean,
 *   lsp_server_command?: string | null,
 *   lsp_capability_negotiation?: boolean,
 *   lsp_prepare_rename_support?: boolean,
 *   lsp_workspace_resource_ops_support?: boolean,
 *   lsp_server_requests_support?: boolean,
 *   lsp_workspace_configuration_support?: boolean,
 *   lsp_project_root_detection?: boolean,
 *   lsp_server_probe_support?: boolean,
 *   lsp_failure_classification?: boolean,
 *   lsp_diagnostics_capture?: boolean,
 *   lsp_edit_preview_support?: boolean,
 *   lsp_edit_budget_guards?: boolean,
 *   lsp_workspace_scope_guards?: boolean,
 *   lsp_production_readiness_harness?: boolean,
 *   lsp_real_server_required_for_claim?: boolean,
 *   lsp_real_server_auto_discovery?: boolean,
 *   lsp_production_matrix_support?: boolean,
 *   backend_modes?: unknown[],
 * }} RefactorProviderRecord
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   execution_mode: string,
 *   support_tier: string,
 *   supported_languages: string[],
 *   supported_primitives: string[],
 *   missing_primitives: string[],
 *   missing_indexed_primitives: string[],
 *   available: boolean,
 *   cross_file_symbol_graph: boolean,
 *   ambiguity_safe: boolean,
 *   conflict_safe_failures: boolean,
 *   experimental_lsp_backend: boolean,
 *   lsp_server_command: string | null,
 *   lsp_capability_negotiation: boolean,
 *   lsp_prepare_rename_support: boolean,
 *   lsp_workspace_resource_ops_support: boolean,
 *   lsp_server_requests_support: boolean,
 *   lsp_workspace_configuration_support: boolean,
 *   lsp_project_root_detection: boolean,
 *   lsp_server_probe_support: boolean,
 *   lsp_failure_classification: boolean,
 *   lsp_diagnostics_capture: boolean,
 *   lsp_edit_preview_support: boolean,
 *   lsp_edit_budget_guards: boolean,
 *   lsp_workspace_scope_guards: boolean,
 *   lsp_production_readiness_harness: boolean,
 *   lsp_real_server_required_for_claim: boolean,
 *   lsp_real_server_auto_discovery: boolean,
 *   lsp_production_matrix_support: boolean,
 *   backend_modes: string[],
 *   lsp_available: boolean,
 * }} RefactorProviderProfile
 */

/** @typedef {ReturnType<typeof listFeatureProviders>[number]} FeatureProviderRecord */
/**
 * @typedef {{
 *   dir: string,
 *   name: string,
 *   support_tier?: string,
 *   runtimes?: string[],
 *   languages?: string[],
 *   frameworks?: string[],
 *   actions?: Array<{ id?: string | null, type?: string | null }> | null,
 * }} SkillRecord
 */
/** @typedef {{ support_tier: string, support_scope: Record<string, unknown>, acceptance: Record<string, unknown> }} ScriptSupportProfile */

const REQUIRED_SEMANTIC_PRIMITIVES = ['rename_symbol', 'add_import', 'remove_import', 'ensure_export'];
const REQUIRED_INDEXED_PRIMITIVES = ['rename_at', 'rename_symbol', 'add_import', 'remove_import', 'ensure_export'];
const TARGET_SEMANTIC_LANGUAGES = ['typescript', 'javascript', 'python', 'go', 'java'];
const FRAMEWORK_WIRING_SKILL_IDS = [
  'add-fastapi-endpoint',
  'add-django-model',
  'add-go-handler',
  'add-spring-controller',
];

/** @param {unknown[] | null | undefined} values */
function unique(values) {
  return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)));
}

/** @param {RefactorProviderRecord | null | undefined} provider */
function normalizeSupportedPrimitives(provider) { return unique(provider && provider.supported_primitives); }
/** @param {RefactorProviderRecord | null | undefined} provider */
function normalizeSupportedLanguages(provider) { return unique(provider && provider.supported_languages); }
/** @param {RefactorProviderRecord | null | undefined} provider */
function isSemanticAstProvider(provider) { return Boolean(provider && provider.execution_mode === 'semantic_ast'); }
/** @param {RefactorProviderRecord | null | undefined} provider */
function isIndexedSymbolProvider(provider) { return Boolean(provider && provider.execution_mode === 'indexed_symbol'); }
/** @param {RefactorProviderRecord | null | undefined} provider */
function hasCrossFileSymbolGraph(provider) { return Boolean(provider && provider.cross_file_symbol_graph); }
/** @param {RefactorProviderRecord | null | undefined} provider */
function isAmbiguitySafe(provider) { return Boolean(provider && provider.ambiguity_safe); }
/** @param {RefactorProviderRecord | null | undefined} provider */
function hasConflictSafeFailures(provider) { return Boolean(provider && provider.conflict_safe_failures); }
/** @param {RefactorProviderRecord | null | undefined} provider */
function hasExperimentalLspBackend(provider) { return Boolean(provider && provider.experimental_lsp_backend); }

/** @returns {RefactorProviderProfile[]} */
function buildRefactorProviderProfiles() {
  const providers = /** @type {RefactorProviderRecord[]} */ (listRegisteredRefactorProviders());
  return providers.map((provider) => {
    const supportedPrimitives = normalizeSupportedPrimitives(provider);
    const supportedLanguages = normalizeSupportedLanguages(provider);
    const missingPrimitives = REQUIRED_SEMANTIC_PRIMITIVES.filter((primitive) => !supportedPrimitives.includes(primitive));
    const missingIndexedPrimitives = REQUIRED_INDEXED_PRIMITIVES.filter((primitive) => !supportedPrimitives.includes(primitive));
    let supportTier = 'tier4';
    if (isSemanticAstProvider(provider) && missingPrimitives.length === 0) supportTier = 'tier1';
    else if (isIndexedSymbolProvider(provider) && missingIndexedPrimitives.length === 0) supportTier = 'tier2';
    else if (supportedPrimitives.length > 0) supportTier = 'tier3';
    return {
      id: provider.id,
      label: String(provider.label || provider.id),
      execution_mode: String(provider.execution_mode || ''),
      support_tier: supportTier,
      supported_languages: supportedLanguages,
      supported_primitives: supportedPrimitives,
      missing_primitives: missingPrimitives,
      missing_indexed_primitives: missingIndexedPrimitives,
      available: typeof provider.isAvailable === 'function' ? provider.isAvailable() : true,
      cross_file_symbol_graph: hasCrossFileSymbolGraph(provider),
      ambiguity_safe: isAmbiguitySafe(provider),
      conflict_safe_failures: hasConflictSafeFailures(provider),
      experimental_lsp_backend: hasExperimentalLspBackend(provider),
      lsp_server_command: provider.lsp_server_command ? String(provider.lsp_server_command) : null,
      lsp_capability_negotiation: Boolean(provider.lsp_capability_negotiation),
      lsp_prepare_rename_support: Boolean(provider.lsp_prepare_rename_support),
      lsp_workspace_resource_ops_support: Boolean(provider.lsp_workspace_resource_ops_support),
      lsp_server_requests_support: Boolean(provider.lsp_server_requests_support),
      lsp_workspace_configuration_support: Boolean(provider.lsp_workspace_configuration_support),
      lsp_project_root_detection: Boolean(provider.lsp_project_root_detection),
      lsp_server_probe_support: Boolean(provider.lsp_server_probe_support),
      lsp_failure_classification: Boolean(provider.lsp_failure_classification),
      lsp_diagnostics_capture: Boolean(provider.lsp_diagnostics_capture),
      lsp_edit_preview_support: Boolean(provider.lsp_edit_preview_support),
      lsp_edit_budget_guards: Boolean(provider.lsp_edit_budget_guards),
      lsp_workspace_scope_guards: Boolean(provider.lsp_workspace_scope_guards),
      lsp_production_readiness_harness: Boolean(provider.lsp_production_readiness_harness),
      lsp_real_server_required_for_claim: Boolean(provider.lsp_real_server_required_for_claim),
      lsp_real_server_auto_discovery: Boolean(provider.lsp_real_server_auto_discovery),
      lsp_production_matrix_support: Boolean(provider.lsp_production_matrix_support),
      backend_modes: unique(provider.backend_modes || [provider.execution_mode].filter(Boolean)),
      lsp_available: typeof provider.isLspAvailable === 'function' ? provider.isLspAvailable() : false,
    };
  });
}

function buildSemanticRefactorSupport() {
  const providers = buildRefactorProviderProfiles();
  const astProviders = providers.filter((provider) => isSemanticAstProvider(provider) && provider.available && provider.support_tier === 'tier1');
  const indexedProviders = providers.filter((provider) => isIndexedSymbolProvider(provider) && provider.available && provider.support_tier === 'tier2');
  const acceptedLanguages = unique(astProviders.flatMap((provider) => provider.supported_languages));
  const indexedLanguages = unique(indexedProviders.flatMap((provider) => provider.supported_languages));
  const crossFileIndexedLanguages = unique(indexedProviders.filter((provider) => provider.cross_file_symbol_graph).flatMap((provider) => provider.supported_languages));
  const lspExperimentalLanguages = unique(providers.filter((provider) => provider.experimental_lsp_backend).flatMap((provider) => provider.supported_languages));
  const lspCapableProviderIds = providers.filter((provider) => provider.experimental_lsp_backend).map((provider) => provider.id);
  const productionHarnessLanguages = unique(providers.filter((provider) => provider.lsp_production_readiness_harness).flatMap((provider) => provider.supported_languages));
  const productionRealServerRequiredLanguages = unique(providers.filter((provider) => provider.lsp_real_server_required_for_claim).flatMap((provider) => provider.supported_languages));
  const productionMatrixLanguages = unique(providers.filter((provider) => provider.lsp_production_matrix_support).flatMap((provider) => provider.supported_languages));
  const realServerAutoDiscoveryLanguages = unique(providers.filter((provider) => provider.lsp_real_server_auto_discovery).flatMap((provider) => provider.supported_languages));
  const extendedLanguages = unique([...acceptedLanguages, ...indexedLanguages]);
  const missingTargetLanguages = TARGET_SEMANTIC_LANGUAGES.filter((language) => !extendedLanguages.includes(language));
  let supportTier = 'tier4';
  if (TARGET_SEMANTIC_LANGUAGES.every((language) => acceptedLanguages.includes(language))) supportTier = 'tier1';
  else if (missingTargetLanguages.length === 0) supportTier = 'tier2';
  else if (extendedLanguages.length > 0) supportTier = 'tier3';
  return {
    support_tier: supportTier,
    required_primitives: [...REQUIRED_SEMANTIC_PRIMITIVES],
    required_indexed_primitives: [...REQUIRED_INDEXED_PRIMITIVES],
    target_languages: [...TARGET_SEMANTIC_LANGUAGES],
    accepted_languages: acceptedLanguages,
    indexed_languages: indexedLanguages,
    cross_file_indexed_languages: crossFileIndexedLanguages,
    lsp_experimental_languages: lspExperimentalLanguages,
    lsp_capable_provider_ids: lspCapableProviderIds,
    production_harness_languages: productionHarnessLanguages,
    production_real_server_required_languages: productionRealServerRequiredLanguages,
    production_matrix_languages: productionMatrixLanguages,
    real_server_auto_discovery_languages: realServerAutoDiscoveryLanguages,
    extended_languages: extendedLanguages,
    missing_target_languages: missingTargetLanguages,
    providers,
    accepted_provider_ids: astProviders.map((provider) => provider.id),
    indexed_provider_ids: indexedProviders.map((provider) => provider.id),
    downgraded_provider_ids: providers.filter((provider) => provider.available && provider.support_tier === 'tier3').map((provider) => provider.id),
  };
}

function buildFeatureFlowSupport() {
  const providers = /** @type {FeatureProviderRecord[]} */ (listFeatureProviders());
  return {
    support_tier: 'tier1',
    provider_count: providers.length,
    providers: providers.map((provider) => ({
      id: provider.id,
      skill: provider.skill,
      runtime: provider.runtime,
      frameworks: [...(provider.frameworks || [])],
      support_tier: provider.support_tier,
      delivery: provider.delivery,
      coverage: { ...(provider.coverage || {}) },
    })),
    runtimes: unique(providers.map((provider) => provider.runtime)),
    frameworks: unique(providers.flatMap((provider) => provider.frameworks || [])),
  };
}

/** @param {string} root */
function buildFrameworkWiringSupport(root) {
  const skills = /** @type {SkillRecord[]} */ (readAllSkills(root)).filter((skill) => Boolean(skill) && FRAMEWORK_WIRING_SKILL_IDS.includes(String(skill.dir || '')));
  const acceptedSkills = skills.filter((skill) => Array.isArray(skill.actions) && skill.actions.some((action) => ['locator_template_bundle', 'structured_patch_bundle'].includes(String(action && action.type || '').trim())));
  const runtimes = unique(acceptedSkills.flatMap((skill) => skill.runtimes || []));
  const languages = unique(acceptedSkills.flatMap((skill) => skill.languages || []));
  const frameworks = unique(acceptedSkills.flatMap((skill) => skill.frameworks || []));
  let supportTier = 'tier4';
  if (acceptedSkills.length >= 4) supportTier = 'tier2';
  else if (acceptedSkills.length > 0) supportTier = 'tier3';
  return {
    support_tier: supportTier,
    skills: acceptedSkills.map((skill) => ({
      id: skill.dir,
      name: skill.name,
      support_tier: skill.support_tier,
      runtimes: [...(skill.runtimes || [])],
      languages: [...(skill.languages || [])],
      frameworks: [...(skill.frameworks || [])],
    })),
    runtimes,
    languages,
    frameworks,
  };
}

function buildEcosystemSupport() {
  const bundles = listBundles();
  const presets = listPresets();
  return {
    support_tier: bundles.length > 0 && presets.length > 0 ? 'tier1' : 'tier3',
    maturity: bundles.length > 0 && presets.length > 0 ? 'preset-backed' : 'bundle-only',
    automation_coverage: {
      bootstrap: 'public',
      ecosystem: 'managed',
    },
    public_surfaces: ['bootstrap', 'ecosystem'],
    bundles: bundles.map((bundle) => ({
      id: bundle.id,
      summary: bundle.summary,
    })),
    presets: presets.map((preset) => ({
      id: preset.id,
      mode: preset.mode,
      bundles: [...preset.bundles],
    })),
  };
}

/** @param {string} root */
function buildSupportTierReport(root) {
  const semanticRefactor = buildSemanticRefactorSupport();
  const featureGeneration = buildFeatureFlowSupport();
  const frameworkWiring = buildFrameworkWiringSupport(root);
  const ecosystem = buildEcosystemSupport();
  const ecosystemBundleIds = ecosystem.bundles.map((bundle) => bundle.id);
  return {
    generated_at: new Date().toISOString(),
    root_dir: root,
    domains: { feature_generation: featureGeneration, semantic_refactor: semanticRefactor, framework_wiring: frameworkWiring, ecosystem },
    scripts: {
      bootstrap: {
        support_tier: ecosystem.support_tier,
        support_scope: {
          bundles: ecosystemBundleIds,
          presets: ecosystem.presets.map((preset) => preset.id),
          public_surfaces: ecosystem.public_surfaces,
        },
        acceptance: {
          maturity: ecosystem.maturity,
          automation_coverage: ecosystem.automation_coverage,
        },
      },
      ecosystem: {
        support_tier: ecosystem.support_tier,
        support_scope: {
          bundles: ecosystemBundleIds,
          presets: ecosystem.presets.map((preset) => preset.id),
          public_surfaces: ecosystem.public_surfaces,
        },
        acceptance: {
          maturity: ecosystem.maturity,
          automation_coverage: ecosystem.automation_coverage,
        },
      },
      'generate-feature': {
        support_tier: featureGeneration.support_tier,
        support_scope: {
          runtimes: featureGeneration.runtimes,
          frameworks: featureGeneration.frameworks,
          provider_ids: featureGeneration.providers.map((provider) => provider.id),
        },
        acceptance: { provider_count: featureGeneration.provider_count, delivery: 'primary-feature-flow' },
      },
      'ast-rewrite': {
        support_tier: semanticRefactor.support_tier,
        support_scope: {
          languages: semanticRefactor.extended_languages,
          ast_languages: semanticRefactor.accepted_languages,
          indexed_languages: semanticRefactor.indexed_languages,
          lsp_experimental_languages: semanticRefactor.lsp_experimental_languages,
          provider_ids: [...semanticRefactor.accepted_provider_ids, ...semanticRefactor.indexed_provider_ids],
          required_primitives: semanticRefactor.required_primitives,
          required_indexed_primitives: semanticRefactor.required_indexed_primitives,
          target_languages: semanticRefactor.target_languages,
        },
        acceptance: {
          accepted_languages: semanticRefactor.accepted_languages,
          indexed_languages: semanticRefactor.indexed_languages,
          lsp_experimental_languages: semanticRefactor.lsp_experimental_languages,
          cross_file_indexed_languages: semanticRefactor.cross_file_indexed_languages,
          lsp_capable_provider_ids: semanticRefactor.lsp_capable_provider_ids,
          extended_languages: semanticRefactor.extended_languages,
          missing_languages: semanticRefactor.missing_target_languages,
          provider_profiles: semanticRefactor.providers.map((provider) => ({
            id: provider.id,
            execution_mode: provider.execution_mode,
            support_tier: provider.support_tier,
            supported_languages: provider.supported_languages,
            supported_primitives: provider.supported_primitives,
            missing_primitives: provider.missing_primitives,
            missing_indexed_primitives: provider.missing_indexed_primitives,
            cross_file_symbol_graph: provider.cross_file_symbol_graph,
            ambiguity_safe: provider.ambiguity_safe,
            conflict_safe_failures: provider.conflict_safe_failures,
            experimental_lsp_backend: provider.experimental_lsp_backend,
            lsp_server_command: provider.lsp_server_command,
            lsp_capability_negotiation: provider.lsp_capability_negotiation,
            lsp_prepare_rename_support: provider.lsp_prepare_rename_support,
            lsp_workspace_resource_ops_support: provider.lsp_workspace_resource_ops_support,
            lsp_server_requests_support: provider.lsp_server_requests_support,
            lsp_workspace_configuration_support: provider.lsp_workspace_configuration_support,
            lsp_project_root_detection: provider.lsp_project_root_detection,
            lsp_server_probe_support: provider.lsp_server_probe_support,
            lsp_failure_classification: provider.lsp_failure_classification,
            lsp_diagnostics_capture: provider.lsp_diagnostics_capture,
            lsp_edit_preview_support: provider.lsp_edit_preview_support,
            lsp_edit_budget_guards: provider.lsp_edit_budget_guards,
            lsp_workspace_scope_guards: provider.lsp_workspace_scope_guards,
            lsp_production_readiness_harness: provider.lsp_production_readiness_harness,
            lsp_real_server_required_for_claim: provider.lsp_real_server_required_for_claim,
            lsp_real_server_auto_discovery: provider.lsp_real_server_auto_discovery,
            lsp_production_matrix_support: provider.lsp_production_matrix_support,
            backend_modes: provider.backend_modes,
            lsp_available: provider.lsp_available,
          })),
        },
      },
      'skill-runner': {
        support_tier: frameworkWiring.support_tier === 'tier2' ? 'tier2' : 'tier3',
        support_scope: {
          runtimes: frameworkWiring.runtimes,
          languages: frameworkWiring.languages,
          frameworks: frameworkWiring.frameworks,
          skill_ids: frameworkWiring.skills.map((skill) => skill.id),
        },
        acceptance: { accepted_skill_count: frameworkWiring.skills.length },
      },
    },
  };
}

/** @param {string} root @param {string} scriptName @returns {ScriptSupportProfile} */
function getScriptSupportProfile(root, scriptName) {
  const normalized = String(scriptName || '').trim();
  const report = buildSupportTierReport(root);
  const scripts = /** @type {Record<string, ScriptSupportProfile>} */ (report.scripts);
  return scripts[normalized] || { support_tier: 'tier4', support_scope: { runtimes: [], frameworks: [], languages: [], provider_ids: [] }, acceptance: {} };
}

/** @param {string} providerId */
function getRefactorProviderSupportProfile(providerId) {
  const normalized = String(providerId || '').trim();
  const report = buildSemanticRefactorSupport();
  return report.providers.find((provider) => provider.id === normalized) || { id: normalized, label: normalized, execution_mode: '', support_tier: 'tier4', supported_languages: [], supported_primitives: [], missing_primitives: [...REQUIRED_SEMANTIC_PRIMITIVES], missing_indexed_primitives: [...REQUIRED_INDEXED_PRIMITIVES], available: false, cross_file_symbol_graph: false, ambiguity_safe: false, conflict_safe_failures: false, experimental_lsp_backend: false, lsp_server_command: null, lsp_capability_negotiation: false, lsp_prepare_rename_support: false, lsp_workspace_resource_ops_support: false, lsp_server_requests_support: false, lsp_workspace_configuration_support: false, lsp_project_root_detection: false, lsp_server_probe_support: false, lsp_failure_classification: false, lsp_diagnostics_capture: false, lsp_edit_preview_support: false, lsp_edit_budget_guards: false, lsp_workspace_scope_guards: false, lsp_production_readiness_harness: false, lsp_real_server_required_for_claim: false, lsp_real_server_auto_discovery: false, lsp_production_matrix_support: false, backend_modes: [], lsp_available: false };
}

module.exports = {
  REQUIRED_INDEXED_PRIMITIVES,
  REQUIRED_SEMANTIC_PRIMITIVES,
  TARGET_SEMANTIC_LANGUAGES,
  buildFeatureFlowSupport,
  buildFrameworkWiringSupport,
  buildRefactorProviderProfiles,
  buildSemanticRefactorSupport,
  buildSupportTierReport,
  getRefactorProviderSupportProfile,
  getScriptSupportProfile,
  isIndexedSymbolProvider,
  isSemanticAstProvider,
};
