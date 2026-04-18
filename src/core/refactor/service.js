// @ts-nocheck
const path = require('path');
const { collectFiles } = require('./file-scan.js');
const { TYPESCRIPT_FAMILY_EXTENSIONS, PYTHON_EXTENSIONS, GO_EXTENSIONS, JAVA_EXTENSIONS, detectLanguageFromFile } = require('./languages.js');
const { listRegisteredRefactorProviders } = require('./providers/index.js');
const { getRefactorProviderSupportProfile } = require('../support-tiers/report.js');
const { primitiveToRefactorOperation, resolveRefactorPrimitive } = require('../code-primitives.js');

const REGISTERED_PROVIDERS = listRegisteredRefactorProviders();
const typescriptProvider = REGISTERED_PROVIDERS.find((provider) => provider.id === 'typescript-semantic');
const pythonProvider = REGISTERED_PROVIDERS.find((provider) => provider.id === 'python-semantic');
const goProvider = REGISTERED_PROVIDERS.find((provider) => provider.id === 'go-semantic');
const javaProvider = REGISTERED_PROVIDERS.find((provider) => provider.id === 'java-semantic');
const textFallbackProvider = REGISTERED_PROVIDERS.find((provider) => provider.id === 'text-fallback');

function describeProviders() {
  return REGISTERED_PROVIDERS.map((provider) => {
    const support = getRefactorProviderSupportProfile(provider.id);
    return {
      id: provider.id,
      label: provider.label,
      execution_mode: provider.execution_mode,
      support_tier: support.support_tier,
      supported_operations: [...(provider.supported_operations || [])],
      supported_primitives: [...(provider.supported_primitives || [])],
      supported_languages: [...(provider.supported_languages || [])],
      missing_primitives: [...(support.missing_primitives || [])],
      cross_file_symbol_graph: Boolean(provider.cross_file_symbol_graph),
      ambiguity_safe: Boolean(provider.ambiguity_safe),
      conflict_safe_failures: Boolean(provider.conflict_safe_failures),
      experimental_lsp_backend: Boolean(provider.experimental_lsp_backend),
      lsp_server_command: provider.lsp_server_command || null,
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
      backend_modes: [...(provider.backend_modes || [provider.execution_mode])],
      lsp_available: provider.isLspAvailable ? provider.isLspAvailable() : false,
      available: provider.isAvailable ? provider.isAvailable() : true,
    };
  });
}

function hasFiles(baseDir, extensions) {
  try {
    return collectFiles(baseDir, extensions).length > 0;
  } catch {
    return false;
  }
}

function normalizeRequestedProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'auto') return '';
  return normalized;
}

function getOperationMethod(operation) {
  const methods = {
    'rename-at': 'renameAt',
    'rename-symbol': 'renameSymbol',
    'add-import': 'addImport',
    'remove-import': 'removeImport',
    'ensure-export': 'ensureExport',
  };
  const method = methods[operation];
  if (!method) throw new Error(`Unsupported refactor operation: ${operation}`);
  return method;
}

function buildResolutionContext(operationOrPrimitive, context = {}) {
  const primitive = resolveRefactorPrimitive(operationOrPrimitive);
  const operation = primitiveToRefactorOperation(primitive);
  const file = context.file ? path.resolve(context.file) : '';
  const language = file ? detectLanguageFromFile(file) : (context.language || 'unknown');
  return {
    ...context,
    primitive,
    operation,
    file,
    language,
    requestedProvider: normalizeRequestedProvider(context.provider || context.providerId),
    baseDir: path.resolve(context.baseDir || context.path || process.cwd()),
    backendPreference: String(context.backendPreference || context.backend || context.refactorBackend || '').trim(),
  };
}

function providerSupports(provider, operation, primitive, context) {
  if (typeof provider.supportsPrimitive === 'function') return provider.supportsPrimitive(primitive, context);
  if (typeof provider.supportsOperation === 'function') return provider.supportsOperation(operation, context);
  return false;
}

function resolveSemanticProviderForRename(context) {
  if ((context.language === 'typescript' || context.language === 'javascript') && typescriptProvider.isAvailable && typescriptProvider.isAvailable()) return typescriptProvider;
  if (context.language === 'python' && pythonProvider.isAvailable && pythonProvider.isAvailable()) return pythonProvider;
  if (context.language === 'go' && goProvider.isAvailable && goProvider.isAvailable()) return goProvider;
  if (context.language === 'java' && javaProvider.isAvailable && javaProvider.isAvailable()) return javaProvider;
  const hasTs = hasFiles(context.baseDir, TYPESCRIPT_FAMILY_EXTENSIONS);
  const hasPy = hasFiles(context.baseDir, PYTHON_EXTENSIONS);
  const hasGo = hasFiles(context.baseDir, GO_EXTENSIONS);
  const hasJava = hasFiles(context.baseDir, JAVA_EXTENSIONS);
  if (hasTs && !hasPy && !hasGo && !hasJava && typescriptProvider.isAvailable && typescriptProvider.isAvailable()) return typescriptProvider;
  if (hasPy && !hasTs && !hasGo && !hasJava && pythonProvider.isAvailable && pythonProvider.isAvailable()) return pythonProvider;
  if (hasGo && !hasTs && !hasPy && !hasJava && goProvider.isAvailable && goProvider.isAvailable()) return goProvider;
  if (hasJava && !hasTs && !hasPy && !hasGo && javaProvider.isAvailable && javaProvider.isAvailable()) return javaProvider;
  if (hasTs && typescriptProvider.isAvailable && typescriptProvider.isAvailable()) return typescriptProvider;
  if (hasPy && pythonProvider.isAvailable && pythonProvider.isAvailable()) return pythonProvider;
  if (hasGo && goProvider.isAvailable && goProvider.isAvailable()) return goProvider;
  if (hasJava && javaProvider.isAvailable && javaProvider.isAvailable()) return javaProvider;
  return textFallbackProvider;
}

function resolveProvider(operationOrPrimitive, rawContext = {}) {
  const context = buildResolutionContext(operationOrPrimitive, rawContext);
  if (context.requestedProvider) {
    const direct = REGISTERED_PROVIDERS.find((provider) => provider.id === context.requestedProvider);
    if (!direct) throw new Error(`Unknown refactor provider: ${context.requestedProvider}`);
    if (direct.isAvailable && !direct.isAvailable()) throw new Error(`Refactor provider ${direct.id} is not available in this environment`);
    if (!providerSupports(direct, context.operation, context.primitive, context)) {
      throw new Error(`Refactor provider ${direct.id} does not support primitive ${context.primitive} for ${context.language}`);
    }
    return direct;
  }

  if (context.primitive === 'rename_symbol') return resolveSemanticProviderForRename(context);

  const semanticMatch = REGISTERED_PROVIDERS.find((provider) => {
    if (provider.isAvailable && !provider.isAvailable()) return false;
    return ['semantic_ast', 'indexed_symbol'].includes(provider.execution_mode) && providerSupports(provider, context.operation, context.primitive, context);
  });
  if (semanticMatch) return semanticMatch;

  const fallbackMatch = REGISTERED_PROVIDERS.find((provider) => {
    if (provider.isAvailable && !provider.isAvailable()) return false;
    return providerSupports(provider, context.operation, context.primitive, context);
  });
  if (fallbackMatch) return fallbackMatch;

  throw new Error(`No refactor provider available for ${context.primitive} (${context.language})`);
}

function runRefactorOperation(operationOrPrimitive, rawContext = {}) {
  const context = buildResolutionContext(operationOrPrimitive, rawContext);
  const provider = resolveProvider(context.primitive, context);
  const methodName = getOperationMethod(context.operation);
  if (typeof provider[methodName] !== 'function') throw new Error(`Refactor provider ${provider.id} does not implement ${methodName}`);
  const result = provider[methodName](context);
  return {
    ...result,
    primitive_id: context.primitive,
    operation_id: context.operation,
    provider_id: provider.id,
    provider_label: provider.label,
    execution_mode: result.execution_mode || provider.execution_mode,
  };
}

module.exports = {
  describeProviders,
  resolveProvider,
  runRefactorOperation,
};
