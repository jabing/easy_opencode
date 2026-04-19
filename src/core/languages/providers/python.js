const fs = require('fs');
const path = require('path');
const { buildChangeSurface, buildCodeIntelligence, summarizeTargetNeighborhood } = require('../../implementation/code-intelligence.js');
const { detectProjectProfile, findRelatedTests, summarizeGenericFile } = require('../../project-profile.js');

const PYTHON_EXTENSION = '.py';

/** @param {string | null | undefined} target */
function isPythonTarget(target) {
  return path.extname(String(target || '')).toLowerCase() === PYTHON_EXTENSION;
}

/** @param {string} rootDir @param {string} relPath */
function fileExists(rootDir, relPath) {
  return fs.existsSync(path.join(rootDir, relPath));
}

/** @param {string} target */
function toModuleName(target) {
  const normalized = String(target || '').replace(/\\/g, '/');
  const withoutExt = normalized.replace(/\.py$/i, '');
  if (withoutExt.endsWith('/__init__')) return withoutExt.slice(0, -'/__init__'.length).replace(/\//g, '.');
  return withoutExt.replace(/\//g, '.');
}

/** @param {string} rootDir @param {string} target */
function inferPackageRoots(rootDir, target) {
  const normalized = String(target || '').replace(/\\/g, '/');
  const segments = normalized.split('/').slice(0, -1);
  /** @type {string[]} */
  const roots = [];
  for (let index = segments.length; index >= 1; index -= 1) {
    const candidate = segments.slice(0, index).join('/');
    if (fileExists(rootDir, `${candidate}/__init__.py`)) roots.push(candidate);
  }
  return roots;
}

/** @param {string} rootDir @param {string} target */
function inferOwningPackage(rootDir, target) {
  const packageRoots = inferPackageRoots(rootDir, target);
  return packageRoots.length > 0 ? packageRoots[0] : path.dirname(target).replace(/\\/g, '/');
}

/** @param {string} rootDir @param {string} moduleName */
function resolvePythonModuleFile(rootDir, moduleName) {
  const normalized = String(moduleName || '').trim().replace(/\./g, '/');
  if (!normalized) return null;
  const candidates = [
    `${normalized}.py`,
    `${normalized}/__init__.py`,
    path.join('src', `${normalized}.py`).replace(/\\/g, '/'),
    path.join('src', normalized, '__init__.py').replace(/\\/g, '/'),
  ];
  for (const candidate of candidates) {
    if (fileExists(rootDir, candidate)) return candidate.replace(/\\/g, '/');
  }
  return null;
}

/** @param {string | null | undefined} value */
function splitImportItems(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** @param {string} moduleName @param {string} specifier */
function resolveRelativeModule(moduleName, specifier) {
  const normalizedSpecifier = String(specifier || '').trim();
  if (!normalizedSpecifier.startsWith('.')) return normalizedSpecifier;
  const currentParts = String(moduleName || '').split('.').filter(Boolean);
  const packageParts = currentParts.length > 0 ? currentParts.slice(0, -1) : [];
  const match = normalizedSpecifier.match(/^(\.+)(.*)$/);
  if (!match) return normalizedSpecifier;
  const dots = String(match[1] || '');
  const depth = Math.max(0, dots.length - 1);
  const remainder = String(match[2] || '').replace(/^\./, '');
  const baseParts = packageParts.slice(0, Math.max(0, packageParts.length - depth));
  return [...baseParts, remainder].filter(Boolean).join('.');
}

/** @param {string} text @param {string} moduleName */
function parsePythonSource(text, moduleName) {
  /** @type {string[]} */
  const imports = [];
  /** @type {string[]} */
  const exports = [];
  /** @type {string[]} */
  const symbols = [];
  /** @type {string[]} */
  const moduleHints = [];
  /** @type {string[]} */
  const packageHints = [];
  const source = String(text || '');

  const topLevelSymbolRe = /^(?:async\s+def|def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  /** @type {RegExpExecArray | null} */
  let match;
  while ((match = topLevelSymbolRe.exec(source)) !== null) {
    if (match[1]) symbols.push(match[1]);
  }

  const exportRe = /^__all__\s*=\s*(?:\[((?:.|\r?\n)*?)\]|\(((?:.|\r?\n)*?)\))\s*$/gm;
  while ((match = exportRe.exec(source)) !== null) {
    const body = String(match[1] || match[2] || '');
    const nameRe = /['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g;
    let nameMatch;
    while ((nameMatch = nameRe.exec(body)) !== null) {
      if (nameMatch[1]) exports.push(nameMatch[1]);
    }
  }

  for (const rawLine of source.split(/\r?\n/)) {
    const line = String(rawLine || '').trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('import ')) {
      imports.push(line);
      const payload = line.replace(/^import\s+/, '');
      for (const item of splitImportItems(payload)) {
        const name = String(item.split(/\s+as\s+/i)[0] || '').trim();
        if (name) moduleHints.push(name);
      }
      continue;
    }
    const fromMatch = line.match(/^from\s+([^\s]+)\s+import\s+(.+)$/);
    if (!fromMatch) continue;
    imports.push(line);
    const fromModule = resolveRelativeModule(moduleName, fromMatch[1] || '');
    if (fromModule) moduleHints.push(fromModule);
    const imported = splitImportItems(fromMatch[2] || '').map((item) => String(item.split(/\s+as\s+/i)[0] || '').trim()).filter(Boolean);
    for (const name of imported) {
      const qualified = fromModule ? `${fromModule}.${name}` : name;
      if (qualified) moduleHints.push(qualified);
    }
  }

  const packageRootName = String(inferOwningPackage('.', moduleName.replace(/\./g, '/')) || '');
  packageHints.push(packageRootName);

  return {
    imports,
    exports,
    symbols,
    module_hints: moduleHints,
    package_hints: packageHints,
  };
}

/** @param {string} rootDir @param {string} target */
function summarizePythonFile(rootDir, target) {
  const abs = path.join(rootDir, target);
  const module_name = toModuleName(target);
  const package_roots = inferPackageRoots(rootDir, target);
  const owning_package = inferOwningPackage(rootDir, target);
  if (!fs.existsSync(abs)) {
    return {
      path: target,
      exists: false,
      imports: [],
      exports: [],
      symbols: [],
      line_count: 0,
      module_name,
      package_roots,
      owning_package,
      module_hints: [],
      package_hints: package_roots.slice(),
    };
  }

  const text = fs.readFileSync(abs, 'utf8');
  const parsed = parsePythonSource(text, module_name);
  const summary = summarizeGenericFile(rootDir, target);
  return {
    ...summary,
    imports: parsed.imports.length > 0 ? parsed.imports : summary.imports,
    exports: parsed.exports.length > 0 ? parsed.exports : summary.exports,
    symbols: parsed.symbols.length > 0 ? parsed.symbols : summary.symbols,
    module_name,
    package_roots,
    owning_package,
    module_hints: Array.from(new Set([module_name, ...parsed.module_hints].filter(Boolean))),
    package_hints: Array.from(new Set([owning_package, ...package_roots, ...parsed.package_hints].filter(Boolean))),
  };
}

/** @param {{ rootDir?: string, objective?: string, targets?: string[] }} [options] */
function analyzePythonProject({ rootDir = process.cwd(), objective = '', targets = [] } = {}) {
  const intelligence = buildCodeIntelligence(rootDir, objective, targets);
  const profile = detectProjectProfile(rootDir);
  const activeTargets = (Array.isArray(targets) && targets.length > 0 ? targets : intelligence.inferred_targets || []).map((target) => String(target || ''));
  const moduleHints = new Set();
  const packageHints = new Set();
  /** @type {Record<string, ReturnType<typeof summarizePythonFile>>} */
  const targetSummaries = {};
  for (const target of activeTargets) {
    if (!target || !isPythonTarget(target)) continue;
    const summary = summarizePythonFile(rootDir, target);
    targetSummaries[target] = summary;
    for (const hint of summary.module_hints || []) moduleHints.add(hint);
    for (const hint of summary.package_hints || []) packageHints.add(hint);
  }
  return {
    intelligence,
    profile,
    change_surface: buildChangeSurface(intelligence, targets),
    validation: Array.isArray(profile.validation) ? profile.validation : [],
    module_hints: Array.from(moduleHints),
    package_hints: Array.from(packageHints),
    target_summaries: targetSummaries,
  };
}

/** @param {{ rootDir?: string, target: string, analysis?: ReturnType<typeof analyzePythonProject> | null, objective?: string, targets?: string[] }} options */
function summarizePythonTarget({ rootDir = process.cwd(), target, analysis = null, objective = '', targets = [] }) {
  const resolvedAnalysis = analysis || analyzePythonProject({ rootDir, objective, targets: targets.length > 0 ? targets : [target] });
  const intelligence = resolvedAnalysis.intelligence || resolvedAnalysis;
  const summary = summarizePythonFile(rootDir, target);
  const moduleNeighbors = (summary.module_hints || [])
    .map((moduleName) => resolvePythonModuleFile(rootDir, moduleName))
    .filter((value) => value && value !== target);
  const targetIntelligence = summarizeTargetNeighborhood(intelligence, target);
  return {
    provider_id: 'python',
    ...summary,
    related_tests: findRelatedTests(rootDir, [target]),
    intelligence: {
      ...targetIntelligence,
      direct_neighbors: Array.from(new Set([...(targetIntelligence.direct_neighbors || []), ...moduleNeighbors])),
    },
    validation: Array.isArray(resolvedAnalysis.validation) ? resolvedAnalysis.validation : [],
    analysis_module_hints: Array.isArray(resolvedAnalysis.module_hints) ? resolvedAnalysis.module_hints : [],
    analysis_package_hints: Array.isArray(resolvedAnalysis.package_hints) ? resolvedAnalysis.package_hints : [],
  };
}

function createPythonProvider() {
  return {
    id: 'python',
    /** @param {{ runtime?: string } | null | undefined} profile @param {string | null} target */
    supports(profile, target) {
      if (target == null) return String((profile && profile.runtime) || '').toLowerCase() === 'python';
      return isPythonTarget(target);
    },
    analyzeProject: analyzePythonProject,
    summarizeTarget: summarizePythonTarget,
  };
}

module.exports = {
  analyzePythonProject,
  createPythonProvider,
  inferOwningPackage,
  inferPackageRoots,
  isPythonTarget,
  resolvePythonModuleFile,
  resolveRelativeModule,
  summarizePythonFile,
  summarizePythonTarget,
  toModuleName,
};
