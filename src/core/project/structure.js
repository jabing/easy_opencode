const fs = require('fs');
const path = require('path');
const { analyzeProjectStructure } = require('./structure-analysis.js');

/**
 * @typedef {{ route_index?: string }} StructurePaths
 * @typedef {{ route?: string, service?: string, repository?: string, schema?: string, controller?: string }} ModuleRoots
 * @typedef {{ architecture_pattern?: string, module_roots?: ModuleRoots, docs_root?: string, test_root?: string, source_root?: string, paths?: StructurePaths }} ProjectStructure
 * @typedef {{ kebab_name?: string, name?: string }} FeaturePathVars
 */

/** @param {ProjectStructure} structure @param {FeaturePathVars} [vars] */
function buildFeaturePaths(structure, vars = {}) {
  const kebab = String(vars.kebab_name || vars.name || '').trim();
  if (!kebab) throw new Error('Feature name is required to build feature paths');
  const snake = kebab.replace(/-/g, '_');
  const pattern = String(structure.architecture_pattern || 'feature-based');
  const moduleRoots = structure.module_roots || {};
  const docsRoot = structure.docs_root || 'docs/api';
  const testRoot = structure.test_root || 'tests';
  const sourceRoot = structure.source_root || 'src';

  if (pattern === 'fastapi-app-router') {
    const routeRoot = moduleRoots.route || 'app/routers';
    const serviceRoot = moduleRoots.service || 'app/services';
    const repositoryRoot = moduleRoots.repository || 'app/repositories';
    const schemaRoot = moduleRoots.schema || 'app/schemas';
    return {
      controller: routeRoot,
      service: serviceRoot,
      repository: repositoryRoot,
      schema: schemaRoot,
      route: routeRoot,
      test: testRoot,
      docs: docsRoot,
      route_index: structure.paths && structure.paths.route_index ? structure.paths.route_index : `${sourceRoot === '.' ? '' : `${sourceRoot}/`}main.py`.replace(/^\//, ''),
      docs_index: `${docsRoot}/index.md`,
      feature_root: routeRoot,
      snake_name: snake,
    };
  }

  if (pattern === 'go-internal-packages') {
    const routeRoot = moduleRoots.route || 'internal/handlers';
    const serviceRoot = moduleRoots.service || 'internal/services';
    const repositoryRoot = moduleRoots.repository || 'internal/repositories';
    const schemaRoot = moduleRoots.schema || 'internal/models';
    return {
      controller: routeRoot,
      service: serviceRoot,
      repository: repositoryRoot,
      schema: schemaRoot,
      route: routeRoot,
      test: testRoot,
      docs: docsRoot,
      route_index: structure.paths && structure.paths.route_index ? structure.paths.route_index : `${routeRoot}/routes.go`,
      docs_index: `${docsRoot}/index.md`,
      feature_root: routeRoot,
      snake_name: snake,
    };
  }

  if (pattern === 'layered') {
    const layeredRouteRoot = moduleRoots.route || `${sourceRoot}/routes`;
    return {
      controller: moduleRoots.controller || `${sourceRoot}/controllers`,
      service: moduleRoots.service || `${sourceRoot}/services`,
      repository: moduleRoots.repository || `${sourceRoot}/repositories`,
      schema: moduleRoots.schema || `${sourceRoot}/schemas`,
      route: layeredRouteRoot,
      test: `${testRoot}/${kebab}`,
      docs: docsRoot,
      route_index: `${layeredRouteRoot}/index.ts`,
      docs_index: `${docsRoot}/index.md`,
      feature_root: `${sourceRoot}/${kebab}`,
    };
  }

  const featureRoot = moduleRoots.route || `${sourceRoot}/features`;
  const testContainer = path.basename(featureRoot);
  return {
    controller: `${moduleRoots.controller || `${sourceRoot}/features`}/${kebab}`,
    service: `${moduleRoots.service || `${sourceRoot}/features`}/${kebab}`,
    repository: `${moduleRoots.repository || `${sourceRoot}/features`}/${kebab}`,
    schema: `${moduleRoots.schema || `${sourceRoot}/features`}/${kebab}`,
    route: `${featureRoot}/${kebab}`,
    test: `${testRoot}/${testContainer}/${kebab}`,
    docs: docsRoot,
    route_index: structure.paths && structure.paths.route_index ? structure.paths.route_index : `${featureRoot}/index.ts`,
    docs_index: `${docsRoot}/index.md`,
    feature_root: `${featureRoot}/${kebab}`,
  };
}

/** @param {string} root */
function projectStructurePath(root) {
  return path.join(root, '.opencode', 'project-structure.json');
}

/** @param {string} root */
function readProjectStructure(root) {
  const filePath = projectStructurePath(root);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {string} root @param {ProjectStructure} structure */
function writeProjectStructure(root, structure) {
  const filePath = projectStructurePath(root);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(structure, null, 2)}\n`, 'utf8');
  return filePath;
}

/** @param {string} root @param {string} [runtime] @param {{ refresh?: boolean, persist?: boolean }} [opts] */
function readOrAnalyzeProjectStructure(root, runtime = 'node', opts = {}) {
  if (!opts.refresh) {
    const existing = readProjectStructure(root);
    if (existing) return existing;
  }
  const structure = analyzeProjectStructure(root, runtime);
  if (opts.persist !== false) writeProjectStructure(root, structure);
  return structure;
}

module.exports = {
  analyzeProjectStructure,
  buildFeaturePaths,
  readProjectStructure,
  readOrAnalyzeProjectStructure,
  writeProjectStructure,
};
