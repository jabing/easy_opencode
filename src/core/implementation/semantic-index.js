const path = require('path');
const { buildCodeIntelligence, summarizeTargetNeighborhood } = require('./code-intelligence.js');

/** @typedef {{ path: string, count: number }} ReferencedByEntry */
/** @typedef {{ symbols?: Array<string | { name?: string | null }>, symbol_references?: Record<string, number>, callsites?: string[], is_test?: boolean }} IntelligenceFile */
/** @typedef {{ files?: Record<string, IntelligenceFile>, reverse_dependencies?: Record<string, string[]>, symbol_to_files?: Record<string, string[]> }} CodeIntelligenceLike */
/** @typedef {{ schema_version?: string, generated_at?: string, root_dir?: string, files_indexed?: number, entrypoints?: string[], symbol_graph?: Record<string, SymbolGraphEntry>, intelligence?: CodeIntelligenceLike }} SemanticIndexDocument */
/** @typedef {{ symbol: string, owners: string[], referenced_by: ReferencedByEntry[], called_by: string[] }} SymbolGraphEntry */
/** @typedef {{ direct_neighbors?: string[], high_risk_neighbors?: string[], test_neighbors?: string[] }} Neighborhood */

/** @param {Array<string | null | undefined>} [items] @returns {string[]} */
function unique(items = []) {
  return Array.from(new Set((items || []).filter((item) => Boolean(item)))).map((item) => String(item));
}

/** @param {string | { name?: string | null } | null | undefined} symbol */
function normalizeSymbol(symbol) {
  if (!symbol) return null;
  if (typeof symbol === 'string') return symbol;
  return symbol.name || null;
}

/** @param {CodeIntelligenceLike} index */
function inferEntrypoints(index) {
  const files = Object.keys(index.files || {});
  return files
    .filter((file) => {
      const lowered = file.toLowerCase();
      if (/(?:^|\/)(?:index|main|app|server|cli|router|routes)\./.test(lowered)) return true;
      const fileInfo = (index.files || {})[file] || {};
      return (((index.reverse_dependencies || {})[file] || []).length === 0) && !fileInfo.is_test;
    })
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 20);
}

/** @param {CodeIntelligenceLike} index */
function buildSemanticSymbolGraph(index) {
  /** @type {Record<string, SymbolGraphEntry>} */
  const graph = {};
  for (const [symbol, owners] of Object.entries(index.symbol_to_files || {})) {
    const normalizedOwners = unique(owners);
    /** @type {ReferencedByEntry[]} */
    const referencedBy = [];
    /** @type {string[]} */
    const calledBy = [];
    for (const [file, info] of Object.entries(index.files || {})) {
      const typedInfo = info || {};
      const refCount = Number((typedInfo.symbol_references || {})[symbol] || 0);
      if (refCount > 0 && !normalizedOwners.includes(file)) {
        referencedBy.push({ path: file, count: refCount });
      }
      if ((typedInfo.callsites || []).includes(symbol) && !normalizedOwners.includes(file)) {
        calledBy.push(file);
      }
    }
    graph[symbol] = {
      symbol,
      owners: normalizedOwners,
      referenced_by: referencedBy.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)).slice(0, 20),
      called_by: unique(calledBy).slice(0, 20),
    };
  }
  return graph;
}

/** @param {string} rootDir @param {string[]} [targets] */
function buildSemanticIndex(rootDir, targets = []) {
  const intelligence = /** @type {CodeIntelligenceLike} */ (buildCodeIntelligence(rootDir, '', targets));
  const symbolGraph = buildSemanticSymbolGraph(intelligence);
  const entrypoints = inferEntrypoints(intelligence);
  return {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    root_dir: path.resolve(rootDir || process.cwd()),
    files_indexed: Object.keys(intelligence.files || {}).length,
    entrypoints,
    symbol_graph: symbolGraph,
    intelligence,
  };
}

/** @param {SemanticIndexDocument | CodeIntelligenceLike | null | undefined} semanticIndex @param {Neighborhood | null | undefined} neighborhood @param {string[]} [callers] @param {string[]} [downstreamRefs] */
function scoreEntrypointPaths(semanticIndex, neighborhood, callers = [], downstreamRefs = []) {
  const typedSemanticIndex = /** @type {SemanticIndexDocument | null | undefined} */ (semanticIndex);
  const index = /** @type {CodeIntelligenceLike} */ ((typedSemanticIndex && typedSemanticIndex.intelligence) ? typedSemanticIndex.intelligence : semanticIndex || {});
  /** @type {string[]} */
  const entrypoints = Array.isArray(typedSemanticIndex?.entrypoints) ? typedSemanticIndex.entrypoints.slice() : [];
  const direct = new Set((neighborhood && neighborhood.direct_neighbors) || []);
  const highRisk = new Set((neighborhood && neighborhood.high_risk_neighbors) || []);
  const testNeighbors = new Set((neighborhood && neighborhood.test_neighbors) || []);
  const callerSet = new Set(callers || []);
  const dependentSet = new Set(downstreamRefs || []);
  return entrypoints.map((/** @type {string} */ file) => {
    let score = 1;
    /** @type {string[]} */
    const reasons = [];
    if (callerSet.has(file)) { score += 4; reasons.push('semantic_caller'); }
    if (dependentSet.has(file)) { score += 3; reasons.push('semantic_dependent'); }
    if (direct.has(file)) { score += 2; reasons.push('direct_neighbor'); }
    if (highRisk.has(file)) { score += 2; reasons.push('high_risk_neighbor'); }
    if (testNeighbors.has(file)) { score += 1; reasons.push('test_neighbor'); }
    const reverseDeps = Array.isArray((index.reverse_dependencies || {})[file]) ? ((index.reverse_dependencies || {})[file] || []).length : 0;
    if (reverseDeps === 0) { score += 1; reasons.push('root_entrypoint'); }
    return { path: file, score, reasons };
  }).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 8);
}

/** @param {SemanticIndexDocument | CodeIntelligenceLike | null | undefined} semanticIndex @param {string} targetPath */
function summarizeSemanticNeighborhood(semanticIndex, targetPath) {
  const typedSemanticIndex = /** @type {SemanticIndexDocument | null | undefined} */ (semanticIndex);
  const index = /** @type {CodeIntelligenceLike} */ ((typedSemanticIndex && typedSemanticIndex.intelligence) ? typedSemanticIndex.intelligence : semanticIndex || {});
  if (!index || !index.files || !index.files[targetPath]) return null;
  const neighborhood = /** @type {Neighborhood} */ (summarizeTargetNeighborhood(/** @type {any} */ (index), targetPath));
  const fileInfo = index.files[targetPath] || {};
  const symbols = unique((fileInfo.symbols || []).map(normalizeSymbol));
  /** @type {Record<string, SymbolGraphEntry>} */
  const symbolGraph = (typedSemanticIndex && typedSemanticIndex.symbol_graph) || {};
  const symbolChains = symbols.map((symbol) => {
    const graph = symbol ? (symbolGraph[symbol] || { owners: [], referenced_by: [], called_by: [] }) : { owners: [], referenced_by: [], called_by: [] };
    return {
      symbol,
      owners: graph.owners || [],
      referenced_by: (graph.referenced_by || []).slice(0, 8),
      called_by: (graph.called_by || []).slice(0, 8),
    };
  });
  const callers = unique(symbolChains.flatMap((item) => item.called_by || [])).slice(0, 12);
  const downstreamRefs = unique(symbolChains.flatMap((item) => (item.referenced_by || []).map((ref) => ref.path))).slice(0, 12);
  const rankedEntrypointPaths = scoreEntrypointPaths(semanticIndex, neighborhood, callers, downstreamRefs);
  return {
    target: targetPath,
    probable_entrypoints: rankedEntrypointPaths.map((item) => item.path),
    ranked_entrypoint_paths: rankedEntrypointPaths,
    symbol_chains: symbolChains,
    semantic_callers: callers,
    semantic_dependents: downstreamRefs,
  };
}

module.exports = {
  buildSemanticIndex,
  summarizeSemanticNeighborhood,
  scoreEntrypointPaths,
};
