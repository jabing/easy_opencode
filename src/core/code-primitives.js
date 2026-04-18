/** @typedef {{ aliases: string[], refactor_operation?: string, scaffold_type?: string, family: string }} PrimitiveDefinition */
/** @typedef {Record<string, PrimitiveDefinition>} PrimitiveDefinitionMap */

/** @type {PrimitiveDefinitionMap} */
const PRIMITIVE_DEFINITIONS = {
  rename_at: {
    aliases: ['rename_at', 'rename-at'],
    refactor_operation: 'rename-at',
    family: 'semantic_edit',
  },
  rename_symbol: {
    aliases: ['rename_symbol', 'rename-symbol'],
    refactor_operation: 'rename-symbol',
    family: 'semantic_edit',
  },
  add_import: {
    aliases: ['add_import', 'add-import', 'insert_import', 'insert-import'],
    refactor_operation: 'add-import',
    scaffold_type: 'insert_import',
    family: 'module_boundary',
  },
  remove_import: {
    aliases: ['remove_import', 'remove-import'],
    refactor_operation: 'remove-import',
    family: 'module_boundary',
  },
  ensure_export: {
    aliases: ['ensure_export', 'ensure-export'],
    refactor_operation: 'ensure-export',
    family: 'module_boundary',
  },
  insert_registration: {
    aliases: ['insert_registration', 'insert-registration'],
    family: 'integration_patch',
  },
  ensure_module_export: {
    aliases: ['ensure_module_export', 'ensure-module-export'],
    family: 'integration_patch',
  },
  register_route: {
    aliases: ['register_route', 'register-route'],
    family: 'framework_wiring',
  },
  register_provider: {
    aliases: ['register_provider', 'register-provider'],
    family: 'framework_wiring',
  },
  patch_framework_entry: {
    aliases: ['patch_framework_entry', 'patch-framework-entry', 'patch_entrypoint'],
    family: 'framework_wiring',
  },
  ensure_line: {
    aliases: ['ensure_line', 'ensure-line'],
    scaffold_type: 'ensure_line',
    family: 'text_patch',
  },
  ensure_block: {
    aliases: ['ensure_block', 'ensure-block'],
    scaffold_type: 'ensure_block',
    family: 'text_patch',
  },
};

/** @type {Map<string, string>} */
const ALIAS_TO_PRIMITIVE = new Map();
for (const [primitive, definition] of Object.entries(PRIMITIVE_DEFINITIONS)) {
  for (const alias of definition.aliases) {
    ALIAS_TO_PRIMITIVE.set(alias, primitive);
  }
}

/** @param {unknown} value @param {string} [fallback] */
function normalizePrimitiveName(value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (!normalized) return fallback || '';
  return ALIAS_TO_PRIMITIVE.get(normalized) || fallback || normalized;
}

/** @param {unknown} value @returns {{ id: string } & PrimitiveDefinition | null} */
function getPrimitiveDefinition(value) {
  const primitive = normalizePrimitiveName(value);
  const definition = primitive ? PRIMITIVE_DEFINITIONS[primitive] : null;
  return primitive && definition ? { id: primitive, ...definition } : null;
}

/** @returns {string[]} */
function listKnownPrimitives() {
  return Object.keys(PRIMITIVE_DEFINITIONS);
}

/** @param {unknown} operation @returns {string} */
function resolveRefactorPrimitive(operation) {
  const primitive = normalizePrimitiveName(operation);
  const definition = primitive ? PRIMITIVE_DEFINITIONS[primitive] : null;
  if (!definition || !definition.refactor_operation) {
    throw new Error(`Unsupported refactor primitive: ${operation}`);
  }
  return primitive;
}

/** @param {unknown} primitive @returns {string} */
function primitiveToRefactorOperation(primitive) {
  const normalized = normalizePrimitiveName(primitive);
  const definition = normalized ? PRIMITIVE_DEFINITIONS[normalized] : null;
  if (!definition || !definition.refactor_operation) {
    throw new Error(`Primitive does not map to a refactor operation: ${primitive}`);
  }
  return definition.refactor_operation;
}

/** @param {{ primitive?: unknown, operation?: unknown, type?: unknown }} [update] @returns {string} */
function resolveScaffoldPrimitive(update = {}) {
  const candidates = [update.primitive, update.operation, update.type];
  for (const candidate of candidates) {
    const primitive = normalizePrimitiveName(candidate);
    if (primitive && PRIMITIVE_DEFINITIONS[primitive]) return primitive;
  }
  return 'ensure_block';
}

module.exports = {
  getPrimitiveDefinition,
  listKnownPrimitives,
  normalizePrimitiveName,
  primitiveToRefactorOperation,
  resolveRefactorPrimitive,
  resolveScaffoldPrimitive,
};
