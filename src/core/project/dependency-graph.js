/** @typedef {Record<string, string[]>} DependencyGraph */
/** @typedef {{ id?: string, [key: string]: unknown }} GraphModule */

/** @param {Record<string, unknown>} [graph] @returns {DependencyGraph} */
function normalizeDependencyGraph(graph = {}) {
  /** @type {DependencyGraph} */
  const normalized = {};
  for (const [node, deps] of Object.entries(graph || {})) {
    const key = String(node || '').trim();
    if (!key) continue;
    normalized[key] = Array.from(new Set((Array.isArray(deps) ? deps : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)));
  }
  return normalized;
}

/** @param {Record<string, unknown>} [graph] @returns {string[]} */
function topoSort(graph = {}) {
  const normalized = normalizeDependencyGraph(graph);
  const visiting = new Set();
  const visited = new Set();
  /** @type {string[]} */
  const ordered = [];

  /** @param {string} node */
  function visit(node) {
    if (visited.has(node)) return;
    if (visiting.has(node)) throw new Error(`Dependency cycle detected at ${node}`);
    visiting.add(node);
    for (const dep of normalized[node] || []) {
      if (!Object.prototype.hasOwnProperty.call(normalized, dep)) normalized[dep] = [];
      visit(dep);
    }
    visiting.delete(node);
    visited.add(node);
    ordered.push(node);
  }

  for (const node of Object.keys(normalized)) visit(node);
  return ordered;
}

/** @param {GraphModule[]} [modules] @param {Record<string, unknown>} [graph] @returns {GraphModule[]} */
function sortModulesByGraph(modules = [], graph = {}) {
  const moduleList = Array.isArray(modules) ? modules : [];
  const moduleMap = new Map(moduleList.map((item) => [String(item.id || '').trim(), item]));
  const orderedIds = topoSort(graph).filter((id) => moduleMap.has(id));
  const seen = new Set(orderedIds);
  for (const moduleDef of moduleList) {
    const id = String(moduleDef.id || '').trim();
    if (id && !seen.has(id)) orderedIds.push(id);
  }
  /** @type {GraphModule[]} */
  const orderedModules = [];
  for (const id of orderedIds) {
    const moduleDef = moduleMap.get(id);
    if (moduleDef) orderedModules.push(moduleDef);
  }
  return orderedModules;
}

module.exports = {
  normalizeDependencyGraph,
  topoSort,
  sortModulesByGraph,
};
