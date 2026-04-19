const fs = require('fs');
const path = require('path');
const { buildChangeSurface, buildCodeIntelligence, summarizeTargetNeighborhood } = require('../../implementation/code-intelligence.js');
const { detectProjectProfile, findRelatedTests, listCodeFiles, summarizeGenericFile, unique } = require('../../project-profile.js');

const JAVA_EXTENSION = '.java';

/** @param {string | null | undefined} target */
function isJavaTarget(target) {
  return path.extname(String(target || '')).toLowerCase() === JAVA_EXTENSION;
}

/** @param {string} text */
function parseJavaSource(text) {
  const source = String(text || '');
  const packageMatch = source.match(/^\s*package\s+([A-Za-z0-9_.]+)\s*;/m);
  const package_name = packageMatch && packageMatch[1] ? packageMatch[1] : '';
  /** @type {string[]} */
  const imports = [];
  /** @type {string[]} */
  const import_paths = [];
  /** @type {string[]} */
  const symbols = [];
  /** @type {string[]} */
  const exports = [];
  /** @type {RegExpExecArray | null} */
  let match;

  const importRe = /^\s*import\s+([A-Za-z0-9_.]+)\s*;/gm;
  while ((match = importRe.exec(source)) !== null) {
    const importPath = String(match[1] || '').trim();
    if (!importPath) continue;
    imports.push(`import ${importPath};`);
    import_paths.push(importPath);
  }

  const classRe = /\b(public\s+)?(?:class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  while ((match = classRe.exec(source)) !== null) {
    const name = match[2];
    if (!name) continue;
    symbols.push(name);
    if (match[1]) exports.push(name);
  }

  return {
    package_name,
    imports: unique(imports),
    import_paths: unique(import_paths),
    symbols: unique(symbols),
    exports: unique(exports),
  };
}

/** @param {string} rootDir @param {string} fqcn */
function resolveJavaImportFile(rootDir, fqcn) {
  const normalized = String(fqcn || '').trim().replace(/\./g, '/');
  if (!normalized) return null;
  const candidates = [
    `src/main/java/${normalized}.java`,
    `src/test/java/${normalized}.java`,
    `${normalized}.java`,
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(rootDir, candidate))) return candidate.replace(/\\/g, '/');
  }
  return null;
}

/** @param {string} rootDir @param {string} target */
function summarizeJavaFile(rootDir, target) {
  const summary = summarizeGenericFile(rootDir, target);
  const abs = path.join(rootDir, target);
  if (!fs.existsSync(abs)) {
    return {
      ...summary,
      package_name: '',
      owning_package: path.dirname(target).replace(/\\/g, '/'),
      import_paths: [],
    };
  }
  const parsed = parseJavaSource(fs.readFileSync(abs, 'utf8'));
  return {
    ...summary,
    imports: parsed.imports.length > 0 ? parsed.imports : summary.imports,
    exports: parsed.exports.length > 0 ? parsed.exports : summary.exports,
    symbols: parsed.symbols.length > 0 ? parsed.symbols : summary.symbols,
    package_name: parsed.package_name,
    owning_package: path.dirname(target).replace(/\\/g, '/'),
    import_paths: parsed.import_paths,
  };
}

/** @param {string} rootDir */
function buildJavaIndex(rootDir) {
  /** @type {Record<string, string[]>} */
  const byImportPath = {};
  for (const file of listCodeFiles(rootDir)) {
    if (!isJavaTarget(file)) continue;
    const summary = summarizeJavaFile(rootDir, file);
    const packagePrefix = summary.package_name ? `${summary.package_name}.` : '';
    for (const symbol of summary.symbols || []) {
      const fqcn = `${packagePrefix}${symbol}`;
      const bucket = byImportPath[fqcn] || (byImportPath[fqcn] = []);
      bucket.push(file);
    }
  }
  return { by_import_path: byImportPath };
}

/** @param {{ rootDir?: string, objective?: string, targets?: string[] }} [options] */
function analyzeJavaProject({ rootDir = process.cwd(), objective = '', targets = [] } = {}) {
  const intelligence = buildCodeIntelligence(rootDir, objective, targets);
  const profile = detectProjectProfile(rootDir);
  return {
    intelligence,
    profile,
    java_index: buildJavaIndex(rootDir),
    change_surface: buildChangeSurface(intelligence, targets),
    validation: Array.isArray(profile.validation) ? profile.validation : [],
  };
}

/** @param {{ rootDir?: string, target: string, analysis?: ReturnType<typeof analyzeJavaProject> | null, objective?: string, targets?: string[] }} options */
function summarizeJavaTarget({ rootDir = process.cwd(), target, analysis = null, objective = '', targets = [] }) {
  const resolvedAnalysis = analysis || analyzeJavaProject({ rootDir, objective, targets: targets.length > 0 ? targets : [target] });
  const intelligence = resolvedAnalysis.intelligence || resolvedAnalysis;
  const summary = summarizeJavaFile(rootDir, target);
  const targetNeighborhood = summarizeTargetNeighborhood(intelligence, target);
  const importNeighbors = unique((summary.import_paths || []).flatMap((importPath) => {
    const indexed = resolvedAnalysis.java_index && resolvedAnalysis.java_index.by_import_path
      ? resolvedAnalysis.java_index.by_import_path[importPath] || []
      : [];
    const direct = resolveJavaImportFile(rootDir, importPath);
    return [...indexed, ...(direct ? [direct] : [])];
  })).filter((item) => item !== target);
  return {
    provider_id: 'java',
    ...summary,
    related_tests: findRelatedTests(rootDir, [target]),
    intelligence: {
      ...targetNeighborhood,
      direct_neighbors: unique([...(targetNeighborhood.direct_neighbors || []), ...importNeighbors]),
    },
    validation: Array.isArray(resolvedAnalysis.validation) ? resolvedAnalysis.validation : [],
  };
}

function createJavaProvider() {
  return {
    id: 'java',
    /** @param {{ runtime?: string } | null | undefined} profile @param {string | null} target */
    supports(profile, target) {
      if (target == null) return String((profile && profile.runtime) || '').toLowerCase() === 'java';
      return isJavaTarget(target);
    },
    analyzeProject: analyzeJavaProject,
    summarizeTarget: summarizeJavaTarget,
  };
}

module.exports = {
  analyzeJavaProject,
  createJavaProvider,
  isJavaTarget,
  parseJavaSource,
  resolveJavaImportFile,
  summarizeJavaTarget,
};
