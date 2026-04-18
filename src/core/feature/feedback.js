const { deriveAdaptiveFeatureShape } = require('../project/memory.js');
const { deriveSemanticDecisionPolicy } = require('./intelligence.js');
const {
  collectFailureCounts,
  hasRecentPattern,
  inferNodeTestFallback,
  inferVerifyCommands,
  normalizeBooleanLike,
  readProjectPackage,
} = require('./feedback-commands.js');

/** @param {any} [memory] */
function deriveGenerationHints(memory = {}) {
  const failures = collectFailureCounts(memory);
  const importFailures = (failures.get('cannot-find-module') || 0) + (failures.get('broken_local_imports') || 0);
  const scriptFailures = (failures.get('missing-build-script') || 0) + (failures.get('missing-test-script') || 0);
  const codingStyle = String(memory.coding_style || '').trim();
  const validationLib = String(memory.validation_lib || '').trim();
  const apiStyle = String(memory.api_style || '').trim();
  const authStrategy = String(memory.auth_strategy || '').trim();
  const orm = String(memory.orm || '').trim();
  const errorPattern = String(memory.error_pattern || '').trim();
  const testFramework = String(memory.test_framework || '').trim();
  const adaptiveShape = deriveAdaptiveFeatureShape(memory);
  const stats = memory.module_preference_stats || {};
  const testStats = stats.test || {};
  const testSuppressed = Number(testStats.failure || 0) >= 2 && Number(testStats.success || 0) === 0 && Number(testStats.disabled || 0) > 0;
  const docsPreferred = adaptiveShape.indexOf('docs') <= adaptiveShape.indexOf('test');
  return {
    safe_mode: importFailures > 0 || scriptFailures > 0,
    import_repair_bias: importFailures > 0 ? 'high' : 'normal',
    verify_bias: scriptFailures > 0 ? 'script-aware' : 'standard',
    implementation_style: codingStyle === 'class-based' ? 'class-based' : 'functional',
    schema_style: validationLib === 'zod' ? 'zod-first' : 'typed-interface',
    route_style: apiStyle === 'graphql' ? 'graphql-endpoint' : (apiStyle === 'rpc' ? 'rpc-endpoint' : 'rest-endpoint'),
    auth_mode: authStrategy === 'jwt' ? 'bearer-guard' : (authStrategy === 'session' ? 'session-guard' : (authStrategy === 'passport' ? 'passport-adapter' : 'open')),
    repository_style: orm === 'prisma' ? 'prisma-repository' : (orm === 'mongoose' ? 'mongoose-repository' : 'generic-repository'),
    error_style: errorPattern === 'typed-errors' ? 'typed-errors' : 'standard-errors',
    test_template_style: testFramework === 'vitest' ? 'vitest' : (testFramework === 'jest' ? 'jest' : 'node-test'),
    adaptive_shape: adaptiveShape,
    feature_history_count: Array.isArray(memory.generation_history) ? memory.generation_history.length : 0,
    test_module_bias: testSuppressed ? 'suppress-by-history' : 'prefer-by-history',
    docs_module_bias: docsPreferred ? 'prefer-by-history' : 'neutral',
  };
}

/** @param {string} root @param {any} [profile] @param {any} [memory] @param {any} [requested] @param {any | null} [semantic] */
function derivePlanningHints(root, profile = {}, memory = {}, requested = {}, semantic = null) {
  const pkg = readProjectPackage(root);
  const scripts = pkg.scripts || {};
  const failures = collectFailureCounts(memory);
  const generation = deriveGenerationHints(memory);
  /** @type {Record<string, any>} */
  const requestedFlags = {};
  if (Object.prototype.hasOwnProperty.call(requested, 'with_test')) requestedFlags.with_test = normalizeBooleanLike(requested.with_test);
  if (Object.prototype.hasOwnProperty.call(requested, 'with_docs')) requestedFlags.with_docs = normalizeBooleanLike(requested.with_docs);
  if (Object.prototype.hasOwnProperty.call(requested, 'with_repository')) requestedFlags.with_repository = normalizeBooleanLike(requested.with_repository);
  if (Object.prototype.hasOwnProperty.call(requested, 'integration_mode')) requestedFlags.integration_mode = requested.integration_mode;
  const semanticPolicy = deriveSemanticDecisionPolicy({ semantic: semantic || {}, memory, requested: requestedFlags });

  const pythonValidation = Array.isArray(profile.validation) ? profile.validation : [];
  const canRunTests = String(profile.runtime || '').trim() === 'python'
    ? Boolean(profile.test_runner || pythonValidation.some((/** @type {any} */ item) => item && /pytest|unittest/.test(String(item.command || ''))))
    : Boolean(scripts.test || scripts['test:unit'] || inferNodeTestFallback(root, memory));
  const testFailures = (failures.get('missing-test-script') || 0) + (failures.get('verify-failed') || 0);
  const importFailures = (failures.get('cannot-find-module') || 0) + (failures.get('broken_local_imports') || 0);
  const repeatedImportFailures = importFailures >= 2;
  const adaptiveShape = Array.isArray(generation.adaptive_shape) ? generation.adaptive_shape : deriveAdaptiveFeatureShape(memory);
  const prefersRepository = adaptiveShape.indexOf('repository') <= adaptiveShape.indexOf('docs');
  const suppressTestsByHistory = generation.test_module_bias === 'suppress-by-history';
  /** @type {string[]} */
  const reasons = [];

  let includeTestModule = requestedFlags.with_test;
  if (includeTestModule === undefined) {
    if (!canRunTests) {
      includeTestModule = false;
      reasons.push('disabled test module by default because the project has no runnable test script');
    } else if (suppressTestsByHistory) {
      includeTestModule = false;
      reasons.push('disabled test module by default because previous generated test modules repeatedly failed verification');
    } else if (testFailures >= 2 && generation.safe_mode) {
      includeTestModule = false;
      reasons.push('disabled test module by default because repeated verify failures suggest conservative generation');
    } else {
      includeTestModule = semanticPolicy.with_test !== null ? semanticPolicy.with_test : true;
    }
  } else {
    reasons.push('kept explicit with_test setting from user input');
  }

  let includeDocsModule = requestedFlags.with_docs;
  if (includeDocsModule === undefined) {
    includeDocsModule = semanticPolicy.with_docs !== null ? semanticPolicy.with_docs : true;
    if (generation.safe_mode) reasons.push('kept docs enabled in safe mode to preserve integration guidance');
  } else {
    reasons.push('kept explicit with_docs setting from user input');
  }

  let includeRepositoryModule = requestedFlags.with_repository;
  const runtime = String(profile.runtime || '').trim();
  if (includeRepositoryModule === undefined) {
    includeRepositoryModule = semanticPolicy.with_repository !== null ? semanticPolicy.with_repository : (runtime === 'python' || runtime === 'go' ? true : prefersRepository);
    if ((runtime === 'python' || runtime === 'go') && includeRepositoryModule) reasons.push('kept repository module enabled by default for framework-aware service injection templates');
    if (includeRepositoryModule && repeatedImportFailures) reasons.push('kept repository module enabled after repeated import failures to preserve stable layering');
    if (!includeRepositoryModule) reasons.push('disabled repository module by default because recent successful generations did not rely on repository files');
  } else {
    reasons.push('kept explicit with_repository setting from user input');
  }

  let integrationMode = requestedFlags.integration_mode;
  if (integrationMode === undefined) {
    integrationMode = generation.safe_mode ? 'plan' : 'apply';
    if (generation.safe_mode) reasons.push('switched integration mode to plan because safe mode is active');
  }

  const planMode = generation.safe_mode ? 'conservative' : 'standard';
  const verifyPreference = canRunTests ? `${generation.test_template_style}-preferred` : 'build-only';
  const preferredCommands = memory.preferred_test_commands || {};
  const verifyRunnerMode = String(preferredCommands.ci || '').trim() || String(preferredCommands.coverage || '').trim() || String(preferredCommands.watch || '').trim() ? 'multi-mode' : 'single-mode';
  const implementationStyle = generation.implementation_style;
  const shapeStrategy = generation.feature_history_count > 0 || generation.safe_mode ? 'memory-guided' : 'project-guided';
  const routeStyle = semanticPolicy.route_style || generation.route_style;
  const authMode = semanticPolicy.auth_mode || generation.auth_mode;
  const repositoryStyle = generation.repository_style;
  const errorStyle = generation.error_style;
  const testTemplateStyle = generation.test_template_style;

  if (implementationStyle === 'class-based') reasons.push('selected class-based implementation templates from project memory');
  if (routeStyle !== 'rest-endpoint') reasons.push(`selected ${routeStyle} route template from project memory`);
  if (authMode !== 'open') reasons.push(`enabled ${authMode} auth guard defaults from project memory`);
  if (repositoryStyle !== 'generic-repository') reasons.push(`selected ${repositoryStyle} repository template from project memory`);
  if (errorStyle === 'typed-errors') reasons.push('enabled typed error handling defaults from project memory');
  if (testTemplateStyle !== 'node-test') reasons.push(`selected ${testTemplateStyle} test template from project memory`);
  for (const reason of semanticPolicy.reasons || []) reasons.push(reason);

  return {
    with_test: includeTestModule,
    with_docs: includeDocsModule,
    with_repository: includeRepositoryModule,
    integration_mode: integrationMode,
    plan_mode: planMode,
    verify_preference: verifyPreference,
    verify_runner_mode: verifyRunnerMode,
    implementation_style: implementationStyle,
    shape_strategy: shapeStrategy,
    schema_style: generation.schema_style,
    route_style: routeStyle,
    auth_mode: authMode,
    repository_style: repositoryStyle,
    error_style: errorStyle,
    test_template_style: testTemplateStyle,
    preferred_feature_shape: semanticPolicy.feature_shape || adaptiveShape,
    semantic_policy: semanticPolicy,
    semantic: semantic || null,
    reasons,
    available_scripts: Object.keys(scripts).sort((a, b) => a.localeCompare(b)),
  };
}

module.exports = {
  inferVerifyCommands,
  deriveGenerationHints,
  derivePlanningHints,
};
