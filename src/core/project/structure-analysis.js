const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', '.venv', 'venv', 'target', 'bin', 'out']);
const SOURCE_ROOT_NAMES = ['src', 'app', 'lib', 'server'];
const TEST_ROOT_NAMES = ['tests', 'test', '__tests__'];
const DOCS_ROOT_NAMES = ['docs/api', 'docs'];
const FEATURE_ROOT_CANDIDATES = ['features', 'modules', 'routers', 'handlers'];
const ARCH_LAYER_KEYS = ['controllers', 'services', 'repositories', 'schemas', 'routes', 'routers', 'handlers'];

/** @typedef {Record<string, any>} LooseRecord */
/** @typedef {{ controller: string, service: string, repository: string, schema: string, route: string }} ModuleRoots */
/** @typedef {{ controller: string, service: string, repository: string, schema: string, route: string, test: string, docs: string, route_index: string, docs_index: string }} StructurePaths */
/** @typedef {{ architecture_pattern: string, source_root: string, test_root: string, docs_root: string, module_roots: ModuleRoots, paths: StructurePaths, decision_mode?: string, decision_reasons?: string[] }} StructureShape */
/** @typedef {{ featureExamples: string[], layeredExamples: string[], hasFeatureContainer: boolean, layerHits: string[] }} SourceRootScore */
/** @typedef {{ score: number, label: string, reasons: string[] }} StructureConfidence */

/** @param {string} root @param {string} rel @returns {boolean} */
function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

/** @param {string} root @param {(rel: string) => void} visitor @param {string} [rel] */
function walk(root, visitor, rel = '') {
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const nextRel = rel ? path.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(root, visitor, nextRel);
      continue;
    }
    if (entry.isFile()) visitor(nextRel.replace(/\\/g, '/'));
  }
}

/** @param {string} root @returns {string[]} */
function listFiles(root) {
  /** @type {string[]} */
  const out = [];
  walk(root, (rel) => out.push(rel));
  return out;
}

/** @param {string[]} files @param {RegExp} pattern @returns {string[]} */
function collectMatches(files, pattern) {
  return files.filter((file) => pattern.test(file));
}

/** @param {string} prefix @returns {string} */
function normalizePrefix(prefix) {
  const cleaned = String(prefix || '').replace(/^\/+|\/+$/g, '');
  return cleaned;
}

/** @param {...string} parts @returns {string} */
function joinRel(...parts) {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}

/** @param {string} sourceRoot @returns {string} */
function prefixForSourceRoot(sourceRoot) {
  const parts = String(sourceRoot || '').split('/').filter(Boolean);
  if (!parts.length) return '';
  const markerIndex = parts.findIndex((part) => SOURCE_ROOT_NAMES.includes(part));
  if (markerIndex <= 0) return '';
  return parts.slice(0, markerIndex).join('/');
}

/** @param {string} sourceRoot @param {string} testRoot @param {string} docsRoot @param {string} featureContainer @returns {StructureShape} */
function buildFeatureBasedStructure(sourceRoot, testRoot, docsRoot, featureContainer) {
  const featureBase = `${sourceRoot}/${featureContainer}`;
  return {
    architecture_pattern: 'feature-based',
    source_root: sourceRoot,
    test_root: testRoot,
    docs_root: docsRoot,
    module_roots: {
      controller: featureBase,
      service: featureBase,
      repository: featureBase,
      schema: featureBase,
      route: featureBase,
    },
    paths: {
      controller: featureBase,
      service: featureBase,
      repository: featureBase,
      schema: featureBase,
      route: featureBase,
      test: `${testRoot}/${featureContainer}`,
      docs: docsRoot,
      route_index: `${featureBase}/index.ts`,
      docs_index: `${docsRoot}/index.md`,
    },
  };
}

/** @param {string} sourceRoot @param {string} testRoot @param {string} docsRoot @returns {StructureShape} */
function buildLayeredStructure(sourceRoot, testRoot, docsRoot) {
  return {
    architecture_pattern: 'layered',
    source_root: sourceRoot,
    test_root: testRoot,
    docs_root: docsRoot,
    module_roots: {
      controller: `${sourceRoot}/controllers`,
      service: `${sourceRoot}/services`,
      repository: `${sourceRoot}/repositories`,
      schema: `${sourceRoot}/schemas`,
      route: `${sourceRoot}/routes`,
    },
    paths: {
      controller: `${sourceRoot}/controllers`,
      service: `${sourceRoot}/services`,
      repository: `${sourceRoot}/repositories`,
      schema: `${sourceRoot}/schemas`,
      route: `${sourceRoot}/routes`,
      test: testRoot,
      docs: docsRoot,
      route_index: `${sourceRoot}/routes/index.ts`,
      docs_index: `${docsRoot}/index.md`,
    },
  };
}

/** @param {string[]} files @returns {string} */
function detectRouteSuffix(files) {
  const routeExamples = files.filter((file) => /\.(route|routes)\.(ts|js)$/.test(file));
  if (routeExamples.some((file) => file.endsWith('.routes.ts') || file.endsWith('.routes.js'))) return '.routes.ts';
  return '.route.ts';
}

/** @param {string[]} files @returns {string} */
function detectTestSuffix(files) {
  const specCount = files.filter((file) => file.endsWith('.spec.ts') || file.endsWith('.spec.js')).length;
  const testCount = files.filter((file) => file.endsWith('.test.ts') || file.endsWith('.test.js')).length;
  return testCount > specCount ? '.test.ts' : '.spec.ts';
}

/** @param {string} root @param {string[]} files @param {string} sourceRoot @returns {SourceRootScore} */
function scoreSourceRoot(root, files, sourceRoot) {
  const featurePattern = new RegExp(`^${sourceRoot}/(?:features|modules)/[^/]+/[^/]+\\.(?:controller|service|repository|schema|route|routes)\\.(?:ts|js)$`);
  const layeredPattern = new RegExp(`^${sourceRoot}/(?:controllers|services|repositories|schemas|routes)/[^/]+\\.(?:controller|service|repository|schema|route|routes)\\.(?:ts|js)$`);
  return {
    featureExamples: collectMatches(files, featurePattern),
    layeredExamples: collectMatches(files, layeredPattern),
    hasFeatureContainer: FEATURE_ROOT_CANDIDATES.some((name) => exists(root, `${sourceRoot}/${name}`)),
    layerHits: ARCH_LAYER_KEYS.filter((key) => exists(root, `${sourceRoot}/${key}`)),
  };
}

/** @param {string} root @param {string[]} files @param {string} sourceRoot @returns {boolean} */
function detectMixedArchitecture(root, files, sourceRoot) {
  const scored = scoreSourceRoot(root, files, sourceRoot);
  return scored.featureExamples.length > 0 && (scored.layeredExamples.length > 0 || scored.layerHits.length >= 2);
}

/** @param {StructureShape} shape @param {StructureConfidence} confidence @param {LooseRecord} [options] @returns {StructureShape} */
function applyStructureDecision(shape, confidence, options = {}) {
  const mixedArchitecture = Boolean(options.mixedArchitecture);
  const detectedExamples = Array.isArray(options.detectedExamples) ? /** @type {string[]} */ (options.detectedExamples) : [];
  const sourceRoot = String(options.sourceRoot || shape.source_root || 'src');
  const docsRoot = String(shape.docs_root || 'docs/api');
  const testRoot = String(shape.test_root || 'tests');
  /** @type {StructureShape} */
  const out = { ...shape };
  /** @type {string[]} */
  const reasons = [];
  let decisionMode = 'standard';

  if (mixedArchitecture) {
    decisionMode = 'conservative';
    reasons.push('mixed feature-based and layered signals were detected; using conservative feature-scoped output paths');
    const routeRoot = String(shape.module_roots?.route || `${sourceRoot}/features`).replace(/\\/g, '/');
    const featureContainer = path.basename(routeRoot).replace(/\\/g, '/') || 'features';
    Object.assign(out, buildFeatureBasedStructure(sourceRoot, testRoot, docsRoot, featureContainer));
  } else if (Number(confidence.score || 0) < 0.5 && String(shape.architecture_pattern || '') === 'layered') {
    decisionMode = 'conservative';
    reasons.push('low structure confidence detected; falling back to conservative feature-scoped output paths');
    Object.assign(out, buildFeatureBasedStructure(sourceRoot, testRoot, docsRoot, 'features'));
  } else if (detectedExamples.length > 0) {
    decisionMode = 'example-driven';
    reasons.push('using repository examples to drive path selection');
  }

  out.decision_mode = decisionMode;
  out.decision_reasons = reasons;
  return out;
}

/** @param {string} root @param {string[]} files @returns {string[]} */
function discoverSourceRoots(root, files) {
  const discovered = new Set();
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (part && SOURCE_ROOT_NAMES.includes(part)) {
        discovered.add(parts.slice(0, i + 1).join('/'));
      }
    }
  }
  if (!discovered.size) discovered.add('src');
  const candidates = Array.from(discovered);
  candidates.sort((a, b) => {
    const aScore = scoreSourceRoot(root, files, a);
    const bScore = scoreSourceRoot(root, files, b);
    const aValue = aScore.featureExamples.length * 3 + aScore.layeredExamples.length * 3 + aScore.layerHits.length + (aScore.hasFeatureContainer ? 2 : 0);
    const bValue = bScore.featureExamples.length * 3 + bScore.layeredExamples.length * 3 + bScore.layerHits.length + (bScore.hasFeatureContainer ? 2 : 0);
    return bValue - aValue || a.localeCompare(b);
  });
  return candidates;
}

/** @param {string} root @param {string} sourceRoot @returns {string} */
function pickTestRoot(root, sourceRoot) {
  const prefix = prefixForSourceRoot(sourceRoot);
  /** @type {string[]} */
  const scoped = [];
  for (const name of TEST_ROOT_NAMES) scoped.push(joinRel(prefix, name));
  scoped.push(joinRel(sourceRoot, '__tests__'));
  for (const candidate of scoped) if (candidate && exists(root, candidate)) return candidate;
  for (const name of TEST_ROOT_NAMES) if (exists(root, name)) return name;
  return joinRel(prefix, 'tests') || 'tests';
}

/** @param {string} root @param {string} sourceRoot @returns {string} */
function pickDocsRoot(root, sourceRoot) {
  const prefix = prefixForSourceRoot(sourceRoot);
  for (const candidate of DOCS_ROOT_NAMES.map((name) => joinRel(prefix, name))) {
    if (candidate && exists(root, candidate)) return candidate;
  }
  for (const candidate of DOCS_ROOT_NAMES) if (exists(root, candidate)) return candidate;
  return joinRel(prefix, 'docs/api') || 'docs/api';
}

/** @param {string[]} featureExamples @param {string} sourceRoot @returns {string} */
function inferFeatureContainer(featureExamples, sourceRoot) {
  if (!featureExamples.length) return 'features';
  /** @type {Map<string, number>} */
  const buckets = new Map();
  for (const file of featureExamples) {
    const match = file.match(new RegExp(`^${sourceRoot}/([^/]+)/`));
    if (!match) continue;
    const key = String(match[1] || '');
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const ranked = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0] ? ranked[0][0] : 'features';
}

/** @param {string} root @param {string[]} files @param {string} sourceRoot @param {string} testRoot @param {string} docsRoot @returns {StructureShape} */
function detectArchitecture(root, files, sourceRoot, testRoot, docsRoot) {
  const scored = scoreSourceRoot(root, files, sourceRoot);
  if (scored.featureExamples.length > 0 || scored.hasFeatureContainer) {
    return buildFeatureBasedStructure(sourceRoot, testRoot, docsRoot, inferFeatureContainer(scored.featureExamples, sourceRoot));
  }
  if (scored.layeredExamples.length > 0 || scored.layerHits.length >= 2) {
    return buildLayeredStructure(sourceRoot, testRoot, docsRoot);
  }
  return buildFeatureBasedStructure(sourceRoot, testRoot, docsRoot, 'features');
}

/** @param {StructureShape} shape @param {string[]} detectedExamples @param {string} sourceRoot @param {string[]} files @returns {StructureConfidence} */
function buildStructureConfidence(shape, detectedExamples, sourceRoot, files) {
  let score = 0.35;
  /** @type {string[]} */
  const reasons = [];
  if (detectedExamples.length >= 2) {
    score += 0.3;
    reasons.push('multiple repository examples matched the detected architecture');
  } else if (detectedExamples.length === 1) {
    score += 0.18;
    reasons.push('one repository example matched the detected architecture');
  } else {
    reasons.push('no repository examples matched; using conservative fallback defaults');
  }
  if (String(shape.architecture_pattern) === 'layered') {
    const layerHits = ARCH_LAYER_KEYS.filter((key) => files.some((file) => file.startsWith(`${sourceRoot}/${key}/`)));
    if (layerHits.length >= 3) {
      score += 0.18;
      reasons.push('layered directories were detected across multiple layers');
    }
  }
  if (String(shape.architecture_pattern) === 'feature-based') {
    const featureRoot = String(shape.module_roots?.route || '');
    if (featureRoot && files.some((file) => file.startsWith(`${featureRoot}/`))) {
      score += 0.12;
      reasons.push('feature container exists with matching files');
    }
  }
  if (prefixForSourceRoot(sourceRoot)) {
    score += 0.1;
    reasons.push('workspace-local source root was inferred from repository layout');
  }
  score = Math.max(0.2, Math.min(0.98, Number(score.toFixed(2))));
  return {
    score,
    label: score >= 0.8 ? 'high' : (score >= 0.35 ? 'medium' : 'low'),
    reasons,
  };
}

/** @param {string} root @returns {string} */
function detectGoFramework(root) {
  const goModPath = path.join(root, 'go.mod');
  if (!fs.existsSync(goModPath)) return 'go';
  const text = String(fs.readFileSync(goModPath, 'utf8') || '').toLowerCase();
  if (text.includes('github.com/gin-gonic/gin')) return 'gin';
  if (text.includes('github.com/go-chi/chi')) return 'chi';
  if (text.includes('github.com/gofiber/fiber')) return 'fiber';
  if (text.includes('github.com/labstack/echo')) return 'echo';
  return 'go';
}

/** @param {string} root @param {string[]} files @returns {LooseRecord} */
function detectGoStructure(root, files) {
  const handlerFiles = files.filter((file) => /(?:^|\/)(?:internal\/)?(?:handlers|http|transport\/http)\/[^/]+\.go$/.test(file));
  const internalRoot = exists(root, 'internal') ? 'internal' : (exists(root, 'pkg') ? 'pkg' : '.');
  const normalizedRoot = internalRoot === '.' ? '' : internalRoot;
  const routeRoot = [joinRel(normalizedRoot, 'handlers'), joinRel(normalizedRoot, 'http'), joinRel(normalizedRoot, 'transport/http')]
    .find((candidate) => candidate && exists(root, candidate)) || joinRel(normalizedRoot, 'handlers') || 'handlers';
  const serviceRoot = [joinRel(normalizedRoot, 'services'), joinRel(normalizedRoot, 'service')]
    .find((candidate) => candidate && exists(root, candidate)) || joinRel(normalizedRoot, 'services') || 'services';
  const repositoryRoot = [joinRel(normalizedRoot, 'repositories'), joinRel(normalizedRoot, 'repo')]
    .find((candidate) => candidate && exists(root, candidate)) || joinRel(normalizedRoot, 'repositories') || 'repositories';
  const schemaRoot = [joinRel(normalizedRoot, 'models'), joinRel(normalizedRoot, 'schemas')]
    .find((candidate) => candidate && exists(root, candidate)) || joinRel(normalizedRoot, 'models') || 'models';
  const testRoot = routeRoot;
  const docsRoot = pickDocsRoot(root, normalizedRoot || 'internal');
  const routeIndex = [joinRel(routeRoot, 'routes.go'), joinRel(routeRoot, 'router.go'), joinRel(routeRoot, 'register.go')]
    .find((candidate) => candidate && exists(root, candidate)) || joinRel(routeRoot, 'routes.go') || 'handlers/routes.go';
  const examples = files.filter((file) => file.endsWith('.go') && (file.startsWith(`${routeRoot}/`) || file.startsWith(`${serviceRoot}/`) || file.startsWith(`${schemaRoot}/`) || file.startsWith(`${repositoryRoot}/`))).slice(0, 12);
  return {
    schema_version: '1.2',
    runtime: 'go',
    language: 'go',
    framework: detectGoFramework(root),
    repo_shape: exists(root, 'go.work') ? 'workspace' : 'single-module',
    workspace_root: exists(root, 'go.work') ? '.' : null,
    source_root_candidates: normalizedRoot ? [normalizedRoot] : ['.'],
    architecture_pattern: 'go-internal-packages',
    source_root: normalizedRoot || '.',
    test_root: testRoot,
    docs_root: docsRoot,
    module_roots: {
      controller: routeRoot,
      service: serviceRoot,
      repository: repositoryRoot,
      schema: schemaRoot,
      route: routeRoot,
    },
    paths: {
      controller: routeRoot,
      service: serviceRoot,
      repository: repositoryRoot,
      schema: schemaRoot,
      route: routeRoot,
      test: testRoot,
      docs: docsRoot,
      route_index: routeIndex,
      docs_index: `${docsRoot}/index.md`,
    },
    conventions: {
      route_suffix: '_routes.go',
      service_suffix: '_service.go',
      repository_suffix: '_repository.go',
      test_suffix: '_test.go',
      index_files: false,
    },
    detected_examples: examples,
    confidence: examples.length >= 2 ? 'high' : 'medium',
    confidence_score: examples.length >= 2 ? 0.84 : 0.5,
    confidence_reasons: examples.length >= 2 ? ['Go internal package layout was detected with handler, service, and model files'] : ['Detected Go module layout; using internal package defaults'],
    decision_mode: examples.length >= 2 ? 'framework-aware' : 'conservative',
    decision_reasons: examples.length >= 2 ? ['using detected Go internal packages as the source of truth'] : ['using conservative Go internal package defaults because only partial layout was detected'],
  };
}

/** @param {string} root @param {string[]} files @returns {LooseRecord} */
function detectPythonStructure(root, files) {
  const routerFiles = files.filter((file) => /(?:^|\/)(?:routers|routes)\/[^/]+\.py$/.test(file));
  const appRoots = ['app', 'src', '.'].filter((candidate, index, list) => list.indexOf(candidate) === index && (candidate === '.' || exists(root, candidate)));
  const selectedAppRoot = appRoots.find((candidate) => {
    const prefix = candidate === '.' ? '' : `${candidate}/`;
    return routerFiles.some((file) => file.startsWith(`${prefix}routers/`) || file.startsWith(`${prefix}routes/`));
  }) || (exists(root, 'app') ? 'app' : (exists(root, 'src') ? 'src' : '.'));
  const normalizedAppRoot = selectedAppRoot === '.' ? '' : selectedAppRoot;
  const routeRoot = [joinRel(normalizedAppRoot, 'routers'), joinRel(normalizedAppRoot, 'routes')].find((candidate) => candidate && exists(root, candidate)) || joinRel(normalizedAppRoot, 'routers') || 'routers';
  const serviceRoot = [joinRel(normalizedAppRoot, 'services'), joinRel(normalizedAppRoot, 'service')].find((candidate) => candidate && exists(root, candidate)) || joinRel(normalizedAppRoot, 'services') || 'services';
  const repositoryRoot = [joinRel(normalizedAppRoot, 'repositories'), joinRel(normalizedAppRoot, 'repos')].find((candidate) => candidate && exists(root, candidate)) || joinRel(normalizedAppRoot, 'repositories') || 'repositories';
  const schemaRoot = [joinRel(normalizedAppRoot, 'schemas'), joinRel(normalizedAppRoot, 'models')].find((candidate) => candidate && exists(root, candidate)) || joinRel(normalizedAppRoot, 'schemas') || 'schemas';
  const testRoot = exists(root, 'tests') ? 'tests' : (joinRel(normalizedAppRoot, 'tests') || 'tests');
  const docsRoot = pickDocsRoot(root, normalizedAppRoot || 'app');
  const mainFile = [joinRel(normalizedAppRoot, 'main.py'), joinRel(normalizedAppRoot, 'app.py')].find((candidate) => candidate && exists(root, candidate)) || joinRel(normalizedAppRoot, 'main.py') || 'main.py';
  const examples = files.filter((file) => file.endsWith('.py') && (file.startsWith(`${routeRoot}/`) || file.startsWith(`${serviceRoot}/`) || file.startsWith(`${schemaRoot}/`))).slice(0, 12);
  return {
    schema_version: '1.1',
    runtime: 'python',
    language: 'python',
    framework: 'fastapi',
    repo_shape: 'single-package',
    workspace_root: null,
    source_root_candidates: normalizedAppRoot ? [normalizedAppRoot] : ['.'],
    architecture_pattern: 'fastapi-app-router',
    source_root: normalizedAppRoot || '.',
    test_root: testRoot,
    docs_root: docsRoot,
    module_roots: {
      controller: routeRoot,
      service: serviceRoot,
      repository: repositoryRoot,
      schema: schemaRoot,
      route: routeRoot,
    },
    paths: {
      controller: routeRoot,
      service: serviceRoot,
      repository: repositoryRoot,
      schema: schemaRoot,
      route: routeRoot,
      test: testRoot,
      docs: docsRoot,
      route_index: mainFile,
      docs_index: `${docsRoot}/index.md`,
    },
    conventions: {
      route_suffix: '_router.py',
      service_suffix: '_service.py',
      repository_suffix: '_repository.py',
      test_suffix: '_test.py',
      index_files: false,
    },
    detected_examples: examples,
    confidence: examples.length >= 2 ? 'high' : 'medium',
    confidence_score: examples.length >= 2 ? 0.86 : 0.52,
    confidence_reasons: examples.length >= 2 ? ['FastAPI-style router and service files were detected under the application package'] : ['Detected Python application layout; using FastAPI router defaults'],
    decision_mode: examples.length >= 2 ? 'framework-aware' : 'conservative',
    decision_reasons: examples.length >= 2 ? ['using detected FastAPI application package as the source of truth'] : ['using conservative FastAPI defaults because only partial application structure was detected'],
  };
}

/** @param {string} root @param {string} [runtime] */
function analyzeProjectStructure(root, runtime = 'node') {
  const files = listFiles(root);
  if (String(runtime) === 'python') return detectPythonStructure(root, files);
  if (String(runtime) === 'go') return detectGoStructure(root, files);
  const sourceRootCandidates = discoverSourceRoots(root, files);
  const sourceRoot = sourceRootCandidates[0] || 'src';
  const testRoot = pickTestRoot(root, sourceRoot);
  const docsRoot = pickDocsRoot(root, sourceRoot);
  const detectedExamples = files
    .filter((file) => file.startsWith(`${sourceRoot}/`))
    .filter((file) => /\.(controller|service|repository|schema|route|routes)\.(ts|js)$/.test(file))
    .slice(0, 12);
  const initialShape = detectArchitecture(root, files, sourceRoot, testRoot, docsRoot);
  const mixedArchitecture = detectMixedArchitecture(root, files, sourceRoot);
  const confidence = buildStructureConfidence(initialShape, detectedExamples, sourceRoot, files);
  const shape = applyStructureDecision(initialShape, confidence, { mixedArchitecture, detectedExamples, sourceRoot });
  const repoShape = exists(root, 'packages') || exists(root, 'apps')
    ? (prefixForSourceRoot(sourceRoot) ? 'workspace-package-local' : 'workspace')
    : 'single-package';

  return {
    schema_version: '1.1',
    runtime,
    language: files.some((file) => file.endsWith('.ts') || file.endsWith('.tsx')) ? 'typescript' : 'javascript',
    framework: exists(root, 'package.json') ? 'node' : runtime,
    repo_shape: repoShape,
    workspace_root: repoShape.startsWith('workspace') ? (prefixForSourceRoot(sourceRoot) || '.') : null,
    source_root_candidates: sourceRootCandidates,
    architecture_pattern: shape.architecture_pattern,
    source_root: shape.source_root,
    test_root: shape.test_root,
    docs_root: shape.docs_root,
    module_roots: shape.module_roots,
    paths: shape.paths,
    conventions: {
      route_suffix: detectRouteSuffix(files),
      service_suffix: '.service.ts',
      repository_suffix: '.repository.ts',
      test_suffix: detectTestSuffix(files),
      index_files: true,
    },
    detected_examples: detectedExamples,
    confidence: confidence.label,
    confidence_score: confidence.score,
    confidence_reasons: confidence.reasons,
    decision_mode: shape.decision_mode || 'standard',
    decision_reasons: shape.decision_reasons || [],
    mixed_architecture: mixedArchitecture,
  };
}

module.exports = {
  analyzeProjectStructure,
};
