const fs = require('fs');
const path = require('path');

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs', '.py', '.go', '.java']);
const TEST_RE = /(?:^|\/)(?:tests?|__tests__)\/|(?:\.|_)(?:test|spec)\.[A-Za-z0-9]+$/;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', '.opencode', 'target', 'out']);

/** @typedef {{ name: string, kind: string }} SymbolInfo */
/** @typedef {{ path: string, ext: string, is_test: boolean, symbols: SymbolInfo[], exports: string[], dependencies: string[], local_dependencies: string[], line_count: number, text_sample: string, symbol_references?: Record<string, number>, callsites?: string[], reference_stats?: { total_reference_weight: number, inbound_reference_weight: number } }} FileInfo */
/** @typedef {{ symbol_refs: Record<string, number>, callsite_refs: Record<string, number>, total_reference_weight: number, inbound_reference_weight: number, incoming_symbol_refs?: Record<string, number> }} ReferenceGraphEntry */
/** @typedef {{ path: string, score: number, reasons: string[] }} CandidateEditFile */
/** @typedef {{ target: string, primary_symbols: string[], direct_neighbors: string[], test_neighbors: string[], high_risk_neighbors: string[], outbound_calls: string[], incoming_symbol_callers: { path: string, reference_count: number }[], candidate_edit_files: CandidateEditFile[], impact: { direct_dependents: string[], dependency_count: number, dependent_count: number, reference_count: number, inbound_reference_weight: number, risk_score: number } }} TargetNeighborhood */
/** @typedef {{ root_dir: string, files: Record<string, FileInfo>, reverse_dependencies: Record<string, string[]>, symbol_to_files: Record<string, string[]>, reference_graph: Record<string, ReferenceGraphEntry>, objective_tokens?: string[], inferred_targets?: string[] }} CodeIndex */

/** @param {string} root @param {string} [rel] @param {string[]} [out] @returns {string[]} */
function walk(root, rel = '', out = []) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return out;
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  for (const entry of entries) {
    const nextRel = rel ? path.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(root, nextRel, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (CODE_EXT.has(path.extname(entry.name).toLowerCase())) out.push(nextRel.replace(/\\/g, '/'));
  }
  return out;
}

/** @param {string} filePath @returns {string} */
function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/** @template T @param {T[] | null | undefined} [items] @returns {T[]} */
function unique(items = []) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

/** @param {unknown} value @returns {string} */
function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} text @param {string} ext @returns {{ symbols: SymbolInfo[], exports: string[] }} */
function collectSymbols(text, ext) {
  /** @type {SymbolInfo[]} */
  const symbols = [];
  /** @type {{ kind: string, re: RegExp }[]} */
  const patterns = [
    { kind: 'class', re: /\bclass\s+([A-Za-z_$][\w$]*)/g },
    { kind: 'function', re: /\bfunction\s+([A-Za-z_$][\w$]*)/g },
    { kind: 'function', re: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^\)]*\)\s*=>/g },
    { kind: 'interface', re: /\binterface\s+([A-Za-z_$][\w$]*)/g },
    { kind: 'type', re: /\btype\s+([A-Za-z_$][\w$]*)\s*=/g },
  ];
  if (ext === '.py') patterns.push({ kind: 'class', re: /^class\s+([A-Za-z_][\w]*)/gm }, { kind: 'function', re: /^def\s+([A-Za-z_][\w]*)/gm });
  if (ext === '.go') patterns.push({ kind: 'function', re: /^func\s+(?:\([^\)]*\)\s*)?([A-Za-z_][\w]*)/gm }, { kind: 'type', re: /^type\s+([A-Za-z_][\w]*)\s+/gm });
  if (ext === '.java') patterns.push({ kind: 'class', re: /\b(?:class|interface|enum)\s+([A-Za-z_][\w]*)/g });
  for (const { kind, re } of patterns) {
    /** @type {RegExpExecArray | null} */
    let match;
    while ((match = re.exec(text)) !== null) {
      const name = match[1];
      if (name) symbols.push({ name, kind });
    }
  }
  /** @type {string[]} */
  const exported = [];
  /** @type {RegExpExecArray | null} */
  let match;
  const exportRe = /\bexport\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)?\s*([A-Za-z_$][\w$]*)?/g;
  while ((match = exportRe.exec(text)) !== null) {
    if (match[1]) exported.push(match[1]);
  }
  return { symbols, exports: unique(exported) };
}

/** @param {string} text @param {string[]} [knownSymbols] @returns {Record<string, number>} */
function collectReferences(text, knownSymbols = []) {
  /** @type {Record<string, number>} */
  const refs = {};
  const candidates = unique(knownSymbols);
  for (const symbol of candidates) {
    const re = new RegExp(`\\b${escapeRegExp(symbol)}\\b`, 'g');
    let count = 0;
    while (re.exec(text)) count += 1;
    if (count > 0) refs[symbol] = count;
  }
  return refs;
}

/** @param {string} text @param {string[]} [symbols] @returns {string[]} */
function inferCallsites(text, symbols = []) {
  /** @type {string[]} */
  const hits = [];
  for (const symbol of unique(symbols)) {
    const re = new RegExp(`\\b${escapeRegExp(symbol)}\\s*\\(`, 'g');
    if (re.test(text)) hits.push(symbol);
  }
  return hits;
}

/** @param {string} text @returns {string[]} */
function collectDependencies(text) {
  const deps = new Set();
  const importRes = [
    /\bimport\s+(?:[^'"\n]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bfrom\s+['"]([^'"]+)['"]/g,
  ];
  for (const re of importRes) {
    /** @type {RegExpExecArray | null} */
    let match;
    while ((match = re.exec(text)) !== null) deps.add(match[1]);
  }
  return Array.from(deps);
}

/** @param {string} fromFile @param {string} specifier @returns {string[]} */
function resolveLocalDependencyCandidates(fromFile, specifier) {
  if (!specifier || !specifier.startsWith('.')) return [];
  const dir = path.dirname(fromFile);
  const raw = path.normalize(path.join(dir, specifier)).replace(/\\/g, '/');
  const candidates = [raw, `${raw}.ts`, `${raw}.tsx`, `${raw}.js`, `${raw}.jsx`, `${raw}.py`, `${raw}.go`, `${raw}.java`, `${raw}/index.ts`, `${raw}/index.js`];
  return candidates.filter((item) => !item.startsWith('../'));
}

/** @param {string} objective @returns {string[]} */
function tokenizeObjective(objective) {
  return String(objective || '').toLowerCase().split(/[^a-z0-9_]+/).filter((token) => token.length >= 3);
}

/** @param {string} file @param {string[]} objectiveTokens @param {CodeIndex} index @returns {number} */
function scoreTarget(file, objectiveTokens, index) {
  const basename = path.basename(file).toLowerCase();
  let score = TEST_RE.test(file) ? 1 : 2;
  for (const token of objectiveTokens) {
    if (basename.includes(token)) score += 6;
    if (file.toLowerCase().includes(token)) score += 3;
    if ((index.files[file]?.symbols || []).some((symbol) => symbol.name.toLowerCase().includes(token))) score += 4;
  }
  return score;
}

/** @param {CodeIndex} index @returns {Record<string, ReferenceGraphEntry>} */
function buildFileReferenceGraph(index) {
  /** @type {Record<string, ReferenceGraphEntry>} */
  const graph = {};
  /** @type {Record<string, Record<string, number>>} */
  const incoming = {};
  for (const file of Object.keys(index.files)) {
    graph[file] = { symbol_refs: {}, callsite_refs: {}, total_reference_weight: 0, inbound_reference_weight: 0 };
    incoming[file] = {};
  }
  for (const [file, info] of Object.entries(index.files)) {
    for (const [symbol, count] of Object.entries(info.symbol_references || {})) {
      const owners = (index.symbol_to_files[symbol] || []).filter((owner) => owner !== file);
      for (const owner of owners) {
        const graphEntry = graph[file] || (graph[file] = { symbol_refs: {}, callsite_refs: {}, total_reference_weight: 0, inbound_reference_weight: 0 });
        const incomingEntry = incoming[owner] || (incoming[owner] = {});
        graphEntry.symbol_refs[owner] = Number(graphEntry.symbol_refs[owner] || 0) + Number(count || 0);
        graphEntry.total_reference_weight += Number(count || 0);
        incomingEntry[file] = Number(incomingEntry[file] || 0) + Number(count || 0);
      }
    }
    for (const symbol of info.callsites || []) {
      const owners = (index.symbol_to_files[symbol] || []).filter((owner) => owner !== file);
      for (const owner of owners) {
        const graphEntry = graph[file] || (graph[file] = { symbol_refs: {}, callsite_refs: {}, total_reference_weight: 0, inbound_reference_weight: 0 });
        graphEntry.callsite_refs[owner] = Number(graphEntry.callsite_refs[owner] || 0) + 1;
      }
    }
  }
  for (const [file, refs] of Object.entries(incoming)) {
    const graphEntry = graph[file] || (graph[file] = { symbol_refs: {}, callsite_refs: {}, total_reference_weight: 0, inbound_reference_weight: 0 });
    graphEntry.incoming_symbol_refs = refs;
    graphEntry.inbound_reference_weight = Object.values(refs).reduce((sum, value) => sum + Number(value || 0), 0);
  }
  return graph;
}

/** @param {CodeIndex} index @param {string} targetPath @returns {CandidateEditFile[]} */
function rankCandidateEditFiles(index, targetPath) {
  const info = index.files[targetPath] || { local_dependencies: [], is_test: false };
  /** @type {Map<string, CandidateEditFile>} */
  const scores = new Map();
  /** @param {string | null | undefined} file @param {number} score @param {string} reason */
  const add = (file, score, reason) => {
    if (!file || file === targetPath) return;
    const current = scores.get(file) || { path: file, score: 0, reasons: [] };
    current.score += score;
    if (reason && !current.reasons.includes(reason)) current.reasons.push(reason);
    scores.set(file, current);
  };

  for (const file of info.local_dependencies || []) add(file, 3, 'dependency');
  for (const file of index.reverse_dependencies[targetPath] || []) add(file, 4, 'dependent');
  for (const [file, count] of Object.entries(index.reference_graph[targetPath]?.incoming_symbol_refs || {})) add(file, 2 + Math.min(4, Number(count || 0)), 'symbol_reference');
  for (const file of Object.keys(index.files)) {
    const fileInfo = index.files[file];
    if (fileInfo && fileInfo.is_test) {
      const base = path.basename(targetPath).replace(/\.[^.]+$/, '');
      if (file.includes(base)) add(file, 5, 'matching_test');
    }
  }
  return Array.from(scores.values()).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 12);
}

/** @param {string} rootDir @param {string} [objective] @param {string[]} [requestedTargets] @returns {CodeIndex & { objective_tokens: string[], inferred_targets: string[] }} */
function buildCodeIntelligence(rootDir, objective = '', requestedTargets = []) {
  const root = path.resolve(rootDir || process.cwd());
  const files = walk(root);
  const fileSet = new Set(files);
  /** @type {CodeIndex} */
  const index = { root_dir: root, files: {}, reverse_dependencies: {}, symbol_to_files: {}, reference_graph: {} };
  for (const rel of files) {
    const abs = path.join(root, rel);
    const text = readTextSafe(abs);
    const ext = path.extname(rel).toLowerCase();
    const { symbols, exports } = collectSymbols(text, ext);
    const dependencies = collectDependencies(text);
    const localDependencies = dependencies
      .map((dep) => resolveLocalDependencyCandidates(rel, dep).find((candidate) => fileSet.has(candidate)) || null)
      .filter((dep) => typeof dep === 'string');
    const isTest = TEST_RE.test(rel);
    index.files[rel] = {
      path: rel,
      ext,
      is_test: isTest,
      symbols,
      exports,
      dependencies,
      local_dependencies: localDependencies,
      line_count: text ? text.split(/\r?\n/).length : 0,
      text_sample: text.slice(0, 4000),
    };
    for (const symbol of symbols) {
      const bucket = index.symbol_to_files[symbol.name] || (index.symbol_to_files[symbol.name] = []);
      bucket.push(rel);
    }
  }
  for (const [file, info] of Object.entries(index.files)) {
    for (const dep of info.local_dependencies) {
      if (!index.reverse_dependencies[dep]) index.reverse_dependencies[dep] = [];
      index.reverse_dependencies[dep].push(file);
    }
  }
  const knownSymbols = Object.keys(index.symbol_to_files);
  for (const [file, info] of Object.entries(index.files)) {
    const refs = collectReferences(info.text_sample || '', knownSymbols);
    const callsites = inferCallsites(info.text_sample || '', Object.keys(refs));
    info.symbol_references = refs;
    info.callsites = callsites;
  }
  index.reference_graph = buildFileReferenceGraph(index);
  for (const [file, info] of Object.entries(index.files)) {
    info.reference_stats = index.reference_graph[file] || { total_reference_weight: 0, inbound_reference_weight: 0 };
  }
  const objectiveTokens = tokenizeObjective(objective);
  const inferredTargets = requestedTargets && requestedTargets.length
    ? requestedTargets
    : Object.keys(index.files)
      .sort((a, b) => scoreTarget(b, objectiveTokens, index) - scoreTarget(a, objectiveTokens, index))
      .slice(0, 4);
  return { ...index, objective_tokens: objectiveTokens, inferred_targets: inferredTargets };
}

/** @param {CodeIndex} index @param {string} targetPath @returns {TargetNeighborhood} */
function summarizeTargetNeighborhood(index, targetPath) {
  const info = index.files[targetPath] || { symbols: [], exports: [], local_dependencies: [], symbol_references: [] };
  const directNeighbors = unique([
    ...(info.local_dependencies || []),
    ...((index.reverse_dependencies[targetPath] || []).slice(0, 20)),
  ]).filter((item) => item !== targetPath);
  const targetSymbols = (info.symbols || []).map((item) => item.name);
  const testNeighbors = Object.keys(index.files)
    .filter((file) => Boolean(index.files[file] && index.files[file].is_test))
    .filter((file) => {
      const base = path.basename(targetPath).replace(/\.[^.]+$/, '');
      /** @type {{ symbol_references?: Record<string, number> }} */
      const fileInfo = index.files[file] || { symbol_references: {} };
      const referencesTargetSymbol = targetSymbols.some((symbol) => Number((fileInfo.symbol_references || {})[symbol] || 0) > 0);
      return file.includes(base) || (index.reverse_dependencies[targetPath] || []).includes(file) || referencesTargetSymbol;
    })
    .slice(0, 12);
  const highRisk = directNeighbors.filter((file) => {
    const lowered = file.toLowerCase();
    return /index\.|app\.|server\.|router|routes|config|main\./.test(lowered);
  }).slice(0, 8);
  const primarySymbols = (info.symbols || []).slice(0, 12).map((item) => item.name);
  const outboundCalls = directNeighbors.filter((file) => (index.files[file]?.callsites || []).some((symbol) => primarySymbols.includes(symbol))).slice(0, 12);
  const incomingSymbolCallers = Object.entries(index.reference_graph[targetPath]?.incoming_symbol_refs || {})
    .map(([file, count]) => ({ path: file, reference_count: Number(count || 0) }))
    .sort((a, b) => b.reference_count - a.reference_count || a.path.localeCompare(b.path))
    .slice(0, 12);
  const candidateEditFiles = rankCandidateEditFiles(index, targetPath);
  const referenceWeight = Number(index.reference_graph[targetPath]?.inbound_reference_weight || 0);
  const riskScore = Math.min(10, (index.reverse_dependencies[targetPath] || []).length + highRisk.length + (testNeighbors.length ? 1 : 0) + Math.min(3, referenceWeight > 0 ? Math.ceil(referenceWeight / 3) : 0));
  return {
    target: targetPath,
    primary_symbols: primarySymbols,
    direct_neighbors: directNeighbors,
    test_neighbors: testNeighbors,
    high_risk_neighbors: highRisk,
    outbound_calls: outboundCalls,
    incoming_symbol_callers: incomingSymbolCallers,
    candidate_edit_files: candidateEditFiles,
    impact: {
      direct_dependents: (index.reverse_dependencies[targetPath] || []).slice(0, 20),
      dependency_count: (info.local_dependencies || []).length,
      dependent_count: (index.reverse_dependencies[targetPath] || []).length,
      reference_count: Object.values(info.symbol_references || {}).reduce((a, b) => a + Number(b || 0), 0),
      inbound_reference_weight: referenceWeight,
      risk_score: riskScore,
    },
  };
}

/** @param {CodeIndex} index @param {string[]} [targets] */
function buildChangeSurface(index, targets = []) {
  const neighborhoods = targets.map((target) => summarizeTargetNeighborhood(index, target));
  const primary = unique(neighborhoods.flatMap((item) => item.primary_symbols)).slice(0, 30);
  const direct = unique(neighborhoods.flatMap((item) => item.direct_neighbors)).slice(0, 40);
  const tests = unique(neighborhoods.flatMap((item) => item.test_neighbors)).slice(0, 20);
  const highRisk = unique(neighborhoods.flatMap((item) => item.high_risk_neighbors)).slice(0, 20);
  const candidateEditFiles = neighborhoods.flatMap((item) => item.candidate_edit_files || []);
  const mergedCandidates = Array.from(candidateEditFiles.reduce((map, item) => {
    const existing = map.get(item.path) || { path: item.path, score: 0, reasons: [] };
    existing.score += Number(item.score || 0);
    existing.reasons = unique([...(existing.reasons || []), ...(item.reasons || [])]);
    map.set(item.path, existing);
    return map;
  }, new Map()).values()).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 20);
  const impactScore = neighborhoods.reduce((sum, item) => sum + Number(item.impact?.risk_score || 0), 0);
  const recommendedEditMode = highRisk.length > 0 || direct.length > 10 || impactScore >= 8 ? 'localized' : 'surgical';
  return {
    neighborhoods,
    primary_symbols: primary,
    direct_neighbors: direct,
    test_neighbors: tests,
    high_risk_neighbors: highRisk,
    candidate_edit_files: mergedCandidates,
    impact_score: impactScore,
    recommended_edit_mode: recommendedEditMode,
    recommended_target_budget: Math.min(Math.max(targets.length || 1, 1), 6),
  };
}

module.exports = {
  buildCodeIntelligence,
  buildChangeSurface,
  summarizeTargetNeighborhood,
  rankCandidateEditFiles,
};
