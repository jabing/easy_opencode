const fs = require('fs');
const path = require('path');
const { buildChangeSurface, buildCodeIntelligence, summarizeTargetNeighborhood } = require('../../implementation/code-intelligence.js');
const { detectProjectProfile, findRelatedTests, listCodeFiles, summarizeGenericFile, unique } = require('../../project-profile.js');

const GO_EXTENSION = '.go';

/** @param {string | null | undefined} target */
function isGoTarget(target) {
  return path.extname(String(target || '')).toLowerCase() === GO_EXTENSION;
}

/** @param {string} rootDir @param {string} relPath */
function fileExists(rootDir, relPath) {
  return fs.existsSync(path.join(rootDir, relPath));
}

/** @param {string} rootDir */
function readGoModulePath(rootDir) {
  if (!fileExists(rootDir, 'go.mod')) return null;
  const body = fs.readFileSync(path.join(rootDir, 'go.mod'), 'utf8');
  const match = body.match(/^module\s+(.+)$/m);
  return match ? String(match[1] || '').trim() : null;
}

/** @param {string | null | undefined} modulePath @param {string} packageDir */
function resolveGoImportPath(modulePath, packageDir) {
  const normalizedModulePath = String(modulePath || '').trim();
  if (!normalizedModulePath) return null;
  const normalizedPackageDir = String(packageDir || '').trim().replace(/\\/g, '/');
  if (!normalizedPackageDir || normalizedPackageDir === '.') return normalizedModulePath;
  return `${normalizedModulePath}/${normalizedPackageDir}`;
}

/** @param {string | null | undefined} target */
function resolveGoPackageDir(target) {
  const normalized = String(target || '').replace(/\\/g, '/');
  const parts = normalized.split('/');
  parts.pop();
  const dir = parts.join('/') || '.';
  return dir === '.' ? '.' : dir;
}

/** @param {string | null | undefined} target */
function resolveGoPackageName(target) {
  const normalized = String(target || '').replace(/\\/g, '/');
  const dir = resolveGoPackageDir(normalized);
  const baseDir = dir === '.' ? normalized.split('/').pop() : dir.split('/').pop();
  return String(baseDir || '').replace(/\.go$/i, '');
}

/** @param {string} text */
function parseGoPackage(text) {
  const match = String(text || '').match(/^package\s+([A-Za-z_][A-Za-z0-9_]*)/m);
  return match ? String(match[1] || '').trim() : '';
}

/** @param {string} text */
function parseGoImports(text) {
  /** @type {string[]} */
  const imports = [];
  /** @type {string[]} */
  const importHints = [];
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = String(lines[index] || '').trim();
    if (!line.startsWith('import ')) continue;
    if (line === 'import (' || line === 'import(') {
      for (let inner = index + 1; inner < lines.length; inner += 1) {
        const innerLine = String(lines[inner] || '').trim();
        if (!innerLine || innerLine.startsWith('//')) continue;
        if (innerLine === ')') {
          index = inner;
          break;
        }
        imports.push(innerLine);
        const pathMatch = innerLine.match(/"([^"]+)"/);
        const importPath = String(pathMatch && pathMatch[1] ? pathMatch[1] : '').trim();
        if (importPath) importHints.push(importPath);
      }
      continue;
    }
    const payload = line.replace(/^import\s+/, '').trim();
    if (!payload) continue;
    imports.push(payload);
    const pathMatch = payload.match(/"([^"]+)"/);
    const importPath = String(pathMatch && pathMatch[1] ? pathMatch[1] : '').trim();
    if (importPath) importHints.push(importPath);
  }
  return {
    imports: unique(imports.slice(0, 40)),
    import_hints: unique(importHints.slice(0, 40)),
  };
}

/** @param {string} text */
function parseGoSymbols(text) {
  /** @type {string[]} */
  const symbols = [];
  /** @type {string[]} */
  const exports = [];
  /** @type {RegExpExecArray | null} */
  let match;
  const patterns = [
    /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
    /^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+/gm,
    /^const\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm,
    /^var\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm,
  ];
  for (const pattern of patterns) {
    while ((match = pattern.exec(String(text || ''))) !== null) {
      if (!match[1]) continue;
      symbols.push(match[1]);
      if (/^[A-Z]/.test(match[1])) exports.push(match[1]);
    }
  }
  return {
    symbols: unique(symbols.slice(0, 40)),
    exports: unique(exports.slice(0, 40)),
  };
}

/** @param {string} rootDir @param {string} target */
function summarizeGoFile(rootDir, target) {
  const summary = summarizeGenericFile(rootDir, target);
  const abs = path.join(rootDir, target);
  const modulePath = readGoModulePath(rootDir);
  const packageDir = resolveGoPackageDir(target);
  const importPath = resolveGoImportPath(modulePath, packageDir);
  const packageName = resolveGoPackageName(target);

  if (!fs.existsSync(abs)) {
    return {
      ...summary,
      package_name: packageName,
      package_dir: packageDir,
      owning_package: packageDir,
      module_path: modulePath,
      module_name: modulePath,
      import_path: importPath,
      import_hints: [],
      package_hints: unique([packageName, packageDir, importPath, modulePath].filter(Boolean)),
    };
  }

  const text = fs.readFileSync(abs, 'utf8');
  const parsedImports = parseGoImports(text);
  const parsedSymbols = parseGoSymbols(text);
  const parsedPackage = parseGoPackage(text) || packageName;
  const imports = parsedImports.imports.length > 0 ? parsedImports.imports : summary.imports;
  const symbols = parsedSymbols.symbols.length > 0 ? parsedSymbols.symbols : summary.symbols;
  const exports = parsedSymbols.exports.length > 0 ? parsedSymbols.exports : summary.exports;

  return {
    ...summary,
    imports,
    exports,
    symbols,
    package_name: parsedPackage,
    package_dir: packageDir,
    owning_package: packageDir,
    module_path: modulePath,
    module_name: modulePath,
    import_path: importPath,
    import_hints: unique([...(parsedImports.import_hints || []), ...(importPath ? [importPath] : [])]),
    package_hints: unique([parsedPackage, packageDir, importPath, modulePath].filter(Boolean)),
  };
}

/** @param {string} rootDir */
function buildGoPackageIndex(rootDir) {
  /** @type {ReturnType<typeof summarizeGoFile>[]} */
  const packages = [];
  for (const file of listCodeFiles(rootDir)) {
    if (isGoTarget(file)) packages.push(summarizeGoFile(rootDir, file));
  }

  /** @type {Record<string, string[]>} */
  const byImportPath = {};
  /** @type {Record<string, string[]>} */
  const byPackageDir = {};
  /** @type {Record<string, string[]>} */
  const byPackageName = {};

  for (const item of packages) {
    if (item.import_path) {
      const bucket = byImportPath[item.import_path] || (byImportPath[item.import_path] = []);
      bucket.push(item.path);
    }
    if (item.package_dir) {
      const bucket = byPackageDir[item.package_dir] || (byPackageDir[item.package_dir] = []);
      bucket.push(item.path);
    }
    if (item.package_name) {
      const bucket = byPackageName[item.package_name] || (byPackageName[item.package_name] = []);
      bucket.push(item.path);
    }
  }

  return {
    packages,
    by_import_path: byImportPath,
    by_package_dir: byPackageDir,
    by_package_name: byPackageName,
  };
}

/** @param {{ rootDir?: string, objective?: string, targets?: string[] }} [options] */
function analyzeGoProject({ rootDir = process.cwd(), objective = '', targets = [] } = {}) {
  const intelligence = buildCodeIntelligence(rootDir, objective, targets);
  const profile = detectProjectProfile(rootDir);
  const goPackageIndex = buildGoPackageIndex(rootDir);
  const activeTargets = Array.isArray(targets) && targets.length > 0 ? targets : intelligence.inferred_targets || [];
  const importHints = new Set();
  const packageHints = new Set();
  /** @type {Record<string, ReturnType<typeof summarizeGoFile>>} */
  const targetSummaries = {};

  for (const target of activeTargets) {
    if (!isGoTarget(target)) continue;
    const summary = summarizeGoFile(rootDir, target);
    targetSummaries[target] = summary;
    for (const hint of summary.import_hints || []) importHints.add(hint);
    for (const hint of summary.package_hints || []) packageHints.add(hint);
  }

  for (const item of goPackageIndex.packages) {
    for (const hint of item.import_hints || []) importHints.add(hint);
    for (const hint of item.package_hints || []) packageHints.add(hint);
  }

  return {
    intelligence,
    profile,
    change_surface: buildChangeSurface(intelligence, targets),
    validation: Array.isArray(profile.validation) ? profile.validation : [],
    module_path: goPackageIndex.packages[0] ? goPackageIndex.packages[0].module_path : readGoModulePath(rootDir),
    module_name: goPackageIndex.packages[0] ? goPackageIndex.packages[0].module_name : readGoModulePath(rootDir),
    import_hints: Array.from(importHints),
    package_hints: Array.from(packageHints),
    go_packages: goPackageIndex.packages,
    go_package_index: goPackageIndex,
    target_summaries: targetSummaries,
  };
}

/** @param {{ rootDir: string, target: string, analysis?: ReturnType<typeof analyzeGoProject> | null, objective?: string, targets?: string[] }} options */
function summarizeGoTarget({ rootDir, target, analysis = null, objective = '', targets = [] }) {
  const resolvedAnalysis = analysis || analyzeGoProject({ rootDir, objective, targets: targets.length > 0 ? targets : [target] });
  const intelligence = resolvedAnalysis.intelligence || buildCodeIntelligence(rootDir, objective, [target]);
  const summary = summarizeGoFile(rootDir, target);
  const packageIndex = resolvedAnalysis.go_package_index || buildGoPackageIndex(rootDir);
  const importNeighbors = new Set();
  const packageNeighbors = new Set();

  for (const hint of summary.import_hints || []) {
    for (const file of packageIndex.by_import_path[hint] || []) {
      if (file !== target) importNeighbors.add(file);
    }
  }
  for (const file of packageIndex.by_package_dir[summary.package_dir] || []) {
    if (file !== target) packageNeighbors.add(file);
  }

  const targetNeighborhood = summarizeTargetNeighborhood(intelligence, target);
  const directNeighbors = unique([
    ...(targetNeighborhood.direct_neighbors || []),
    ...Array.from(packageNeighbors),
    ...Array.from(importNeighbors),
  ]).filter((item) => item !== target);

  return {
    provider_id: 'go',
    ...summary,
    related_tests: findRelatedTests(rootDir, [target]),
    intelligence: {
      ...targetNeighborhood,
      direct_neighbors: directNeighbors,
    },
    analysis_import_hints: Array.isArray(resolvedAnalysis.import_hints) ? resolvedAnalysis.import_hints : [],
    analysis_package_hints: Array.isArray(resolvedAnalysis.package_hints) ? resolvedAnalysis.package_hints : [],
  };
}

function createGoProvider() {
  return {
    id: 'go',
    /** @param {{ runtime?: string } | null | undefined} profile @param {string | null} target */
    supports(profile, target) {
      if (target == null) return String((profile && profile.runtime) || '').toLowerCase() === 'go';
      return isGoTarget(target);
    },
    analyzeProject: analyzeGoProject,
    summarizeTarget: summarizeGoTarget,
  };
}

module.exports = {
  analyzeGoProject,
  buildGoPackageIndex,
  createGoProvider,
  isGoTarget,
  parseGoImports,
  parseGoPackage,
  parseGoSymbols,
  readGoModulePath,
  resolveGoImportPath,
  resolveGoPackageDir,
  resolveGoPackageName,
  summarizeGoFile,
  summarizeGoTarget,
};
