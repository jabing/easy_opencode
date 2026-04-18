const fs = require('fs');
const path = require('path');
const { buildCodeIntelligence } = require('../implementation/code-intelligence.js');
const {
  listFiles,
  readJsonSafe,
  readTextSafe,
  pickBest,
  detectFileCase,
  detectCodingStyle,
  detectValidationLib,
  detectOrm,
  detectTestFramework,
  detectApiStyle,
  detectAuthStrategy,
  detectErrorPattern,
  detectSharedErrorModule,
  detectGlobalErrorMiddleware,
  detectPreferredTestCommands,
  detectPreferredTestRunnerProfile,
  detectAppEntrypoint,
  detectPreferredFeatureShape,
} = require('./memory-detect.js');
const {
  normalizeFeatureShape,
  deriveAdaptiveFeatureShape,
  updateMemoryFromFeatureResult,
} = require('./memory-history.js');

/** @typedef {Record<string, any>} AnyRecord */
/** @typedef {{ module_path: string, class_name?: string | undefined }} SharedErrorModuleRef */
/** @typedef {{ module_path: string, symbol_name?: string | undefined }} ErrorMiddlewareRef */
/** @typedef {{ module_path: string, registers_global_error_handler: boolean } | null} AppEntrypointRef */
/** @typedef {{ feature_name?: string | null, status?: string | null, enabled_modules?: string[], implementation_style?: string | null, coding_style?: string | null, shape_strategy?: string | null, plan_path?: string | null, integration_note_path?: string | null, integration_json_path?: string | null, preferred_test_command?: string | null, preferred_test_commands?: AnyRecord | string[] | null, preferred_test_runner_profile?: AnyRecord | string | null, failure_patterns?: AnyRecord[] | AnyRecord | null, semantic?: AnyRecord }} FeatureResultDetails */
/** @typedef {{ schema_version?: string, coding_style?: string | null, api_style?: string | null, test_framework?: string | null, validation_lib?: string | null, orm?: string | null, auth_strategy?: string | null, error_pattern?: string | null, naming?: AnyRecord, preferred_feature_shape?: string[], module_preference_stats?: Record<string, AnyRecord>, generation_history?: AnyRecord[], semantic_feature_history?: AnyRecord[], feature_relations?: Record<string, AnyRecord>, shared_error_module?: SharedErrorModuleRef | null, global_error_middleware?: ErrorMiddlewareRef | null, app_entrypoint?: AppEntrypointRef, preferred_test_command?: string | null, preferred_test_commands?: AnyRecord | string[] | null, preferred_test_runner_profile?: AnyRecord | string | null, style_profile?: AnyRecord, failure_patterns?: AnyRecord[] | AnyRecord | null, last_feature_generation?: AnyRecord }} ProjectMemory */
/** @typedef {{ refresh?: boolean, persist?: boolean }} ReadMemoryOptions */

/** @param {string} root @param {AnyRecord} [profile] @param {AnyRecord | null} [structure] @returns {ProjectMemory} */
function analyzeProjectMemory(root, profile = {}, structure = null) {
  const pkg = /** @type {AnyRecord} */ (readJsonSafe(path.join(root, 'package.json')) || {});
  const files = listFiles(root);
  const sampleFiles = files
    .filter((file) => /\.(ts|js|tsx|jsx)$/.test(file))
    .slice(0, 40)
    .map((file) => readTextSafe(path.join(root, file)))
    .join('\n\n');
  const testFramework = detectTestFramework(pkg, profile, files, sampleFiles);
  const validationLib = detectValidationLib(pkg, sampleFiles);
  const orm = detectOrm(pkg, sampleFiles);
  const apiStyle = detectApiStyle(pkg, sampleFiles);
  const authStrategy = detectAuthStrategy(pkg, sampleFiles);
  const codingStyle = detectCodingStyle(files, sampleFiles);
  const errorPattern = detectErrorPattern(sampleFiles);
  const fileCase = detectFileCase(files);
  const moduleRootVotes = {
    feature: files.filter((file) => /\/features\//.test(file)).length,
    module: files.filter((file) => /\/modules\//.test(file)).length,
  };
  const featureContainer = pickBest(moduleRootVotes, 'feature') === 'module' ? 'modules' : 'features';
  const sharedErrorModule = /** @type {SharedErrorModuleRef | null} */ (detectSharedErrorModule(files, root));
  const globalErrorMiddleware = /** @type {ErrorMiddlewareRef | null} */ (detectGlobalErrorMiddleware(files, root));
  const appEntrypoint = /** @type {AppEntrypointRef} */ (detectAppEntrypoint(files, root, /** @type {any} */ (globalErrorMiddleware)));
  const preferredTestCommands = detectPreferredTestCommands(pkg, profile, testFramework);
  const preferredTestRunnerProfile = detectPreferredTestRunnerProfile(preferredTestCommands, pkg, testFramework);
  const intelligence = /** @type {AnyRecord} */ (buildCodeIntelligence(root, '', []));
  const styleProfile = {
    controller_pattern: files.some((file) => /controller/i.test(file)) ? 'controller-service' : 'flat-handlers',
    async_style: /async\s+function|await\s+/.test(sampleFiles) ? 'async-await' : 'sync-or-callback',
    test_style: /describe\(|test\(|it\(/.test(sampleFiles) ? 'bdd' : 'xunit',
    validation_style: validationLib !== 'unknown' ? 'library-driven' : 'inline-guards',
    symbol_density: Object.keys(intelligence.symbol_to_files || {}).length,
  };

  return {
    schema_version: '1.0',
    coding_style: codingStyle,
    api_style: apiStyle,
    test_framework: testFramework,
    validation_lib: validationLib,
    orm,
    auth_strategy: authStrategy,
    error_pattern: errorPattern,
    naming: {
      file_case: fileCase,
      symbol_case: 'pascal-camel',
      feature_container: featureContainer,
    },
    preferred_feature_shape: detectPreferredFeatureShape(structure, files),
    shared_error_module: sharedErrorModule,
    global_error_middleware: globalErrorMiddleware,
    app_entrypoint: appEntrypoint,
    preferred_test_command: preferredTestCommands.default,
    preferred_test_commands: preferredTestCommands,
    preferred_test_runner_profile: preferredTestRunnerProfile,
    style_profile: styleProfile,
  };
}

/** @param {ProjectMemory} [memory] */
function deriveStyleContract(memory = {}) {
  const style = /** @type {AnyRecord} */ (memory.style_profile || {});
  return {
    controller_pattern: style.controller_pattern || null,
    async_style: style.async_style || null,
    test_style: style.test_style || null,
    validation_style: style.validation_style || null,
    preferred_test_runner_profile: memory.preferred_test_runner_profile || null,
    naming: memory.naming || {},
  };
}

/** @param {ProjectMemory} [base] @param {ProjectMemory} [patch] @returns {ProjectMemory} */
function mergeProjectMemory(base = {}, patch = {}) {
  return {
    ...base,
    ...patch,
    naming: {
      ...(base.naming || {}),
      ...(patch.naming || {}),
    },
    preferred_feature_shape: Array.isArray(patch.preferred_feature_shape)
      ? patch.preferred_feature_shape.slice()
      : (Array.isArray(base.preferred_feature_shape) ? base.preferred_feature_shape.slice() : []),
    module_preference_stats: patch.module_preference_stats || base.module_preference_stats || {},
    generation_history: Array.isArray(patch.generation_history)
      ? patch.generation_history.slice()
      : (Array.isArray(base.generation_history) ? base.generation_history.slice() : []),
    semantic_feature_history: Array.isArray(patch.semantic_feature_history)
      ? patch.semantic_feature_history.slice()
      : (Array.isArray(base.semantic_feature_history) ? base.semantic_feature_history.slice() : []),
    feature_relations: patch.feature_relations || base.feature_relations || {},
    shared_error_module: patch.shared_error_module || base.shared_error_module || null,
    global_error_middleware: patch.global_error_middleware || base.global_error_middleware || null,
    app_entrypoint: patch.app_entrypoint || base.app_entrypoint || null,
    preferred_test_command: patch.preferred_test_command || base.preferred_test_command || null,
    preferred_test_commands: patch.preferred_test_commands || base.preferred_test_commands || null,
    preferred_test_runner_profile: patch.preferred_test_runner_profile || base.preferred_test_runner_profile || null,
    style_profile: {
      ...(base.style_profile || {}),
      ...(patch.style_profile || {}),
    },
  };
}

/** @param {string} root @param {ProjectMemory} [memory] @param {FeatureResultDetails} [details] @returns {ProjectMemory} */
function persistFeatureMemoryUpdate(root, memory = {}, details = {}) {
  const next = /** @type {ProjectMemory} */ (updateMemoryFromFeatureResult(/** @type {any} */ (memory), /** @type {any} */ (details)));
  writeProjectMemory(root, next);
  return next;
}

/** @param {string} root */
function projectMemoryPath(root) {
  return path.join(root, '.opencode', 'project-memory.json');
}

/** @param {string} root @returns {ProjectMemory | null} */
function readProjectMemory(root) {
  const filePath = projectMemoryPath(root);
  if (!fs.existsSync(filePath)) return null;
  try {
    return /** @type {ProjectMemory} */ (JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

/** @param {string} root @param {ProjectMemory} memory */
function writeProjectMemory(root, memory) {
  const filePath = projectMemoryPath(root);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(memory, null, 2)}\n`, 'utf8');
  return filePath;
}

/** @param {string} root @param {AnyRecord} [profile] @param {AnyRecord | null} [structure] @param {ReadMemoryOptions} [opts] @returns {ProjectMemory} */
function readOrInferProjectMemory(root, profile = {}, structure = null, opts = {}) {
  const inferred = analyzeProjectMemory(root, profile, structure);
  if (!opts.refresh) {
    const existing = readProjectMemory(root);
    if (existing) {
      const merged = mergeProjectMemory(inferred, existing);
      if (opts.persist !== false) writeProjectMemory(root, merged);
      return merged;
    }
  }
  if (opts.persist !== false) writeProjectMemory(root, inferred);
  return inferred;
}

module.exports = {
  analyzeProjectMemory,
  mergeProjectMemory,
  detectPreferredTestRunnerProfile,
  deriveStyleContract,
  normalizeFeatureShape,
  deriveAdaptiveFeatureShape,
  projectMemoryPath,
  readOrInferProjectMemory,
  readProjectMemory,
  updateMemoryFromFeatureResult,
  persistFeatureMemoryUpdate,
  writeProjectMemory,
};
