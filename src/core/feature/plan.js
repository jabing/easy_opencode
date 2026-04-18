const { normalizeDependencyGraph, sortModulesByGraph } = require('../project/dependency-graph.js');
const { inferFeatureSemantics } = require('./intelligence.js');
const { buildDynamicUpdates, defaultGoPaths, defaultNodePaths, defaultPythonPaths, truthy } = require('./plan-shared.js');
const {
  applyGeneratedFilesSummary,
  buildTemplateVars,
  resolvePlanSettings,
  styleOrderedModules,
} = require('./plan-runtime.js');

/** @typedef {{ id?: string, condition?: string }} FeatureModule */
/** @typedef {{ dependency_graph?: Record<string, string[]> }} FeaturePlanShape */
/** @typedef {{ id?: string, modules?: FeatureModule[], verify?: string[], plan?: FeaturePlanShape }} FeatureAction */
/** @typedef {Record<string, any> & { kebab_name?: string, name?: string, feature_kind?: string, subject?: string, with_test?: unknown, paths?: Record<string, string>, ['project.test_template_style']?: string }} FeatureVars */
/** @typedef {{ preferred_feature_shape?: string[] }} FeatureMemory */
/** @typedef {{ preferred_feature_shape?: string[] }} PlanningHints */
/** @typedef {Record<string, string> & { route_index?: string }} FeaturePaths */

/**
 * @param {{ action: FeatureAction, vars?: FeatureVars, runtime?: string, structure?: any, memory?: FeatureMemory, planning?: PlanningHints }} options
 */
function buildFeaturePlan({ action, vars = {}, runtime = 'node', structure = null, memory = {}, planning = {} }) {
  /** @type {FeatureModule[]} */
  const modules = Array.isArray(action.modules) ? action.modules : [];
  if (modules.length === 0) {
    throw new Error(`feature_bundle action ${action.id || 'default'} is missing modules[]`);
  }

  const dependencyGraph = normalizeDependencyGraph((action.plan && action.plan.dependency_graph) || {});
  const semantic = inferFeatureSemantics({
    featureName: vars.kebab_name || vars.name || '',
    featureKind: vars.feature_kind || 'crud',
    subject: vars.subject || vars.name || '',
    memory,
  });

  /** @type {string[]} */
  const memoryShape = Array.isArray(memory.preferred_feature_shape) ? memory.preferred_feature_shape : [];
  /** @type {string[]} */
  const planningShape = Array.isArray(planning.preferred_feature_shape) ? planning.preferred_feature_shape : [];
  /** @type {string[]} */
  const preferredShape = planningShape.length > 0 ? planningShape : memoryShape;
  /** @type {FeaturePaths} */
  const paths = {
    ...(runtime === 'node' ? defaultNodePaths(vars, structure) : {}),
    ...(runtime === 'python' ? defaultPythonPaths(vars, structure) : {}),
    ...(runtime === 'go' ? defaultGoPaths(vars, structure) : {}),
    ...((vars && vars.paths) || {}),
  };

  const enabledModules = modules.filter((moduleDef) => {
    const id = String(moduleDef.id || '').trim();
    if (preferredShape.length > 0 && ['route', 'controller', 'service', 'repository', 'schema', 'test', 'docs'].includes(id)) {
      if (!preferredShape.includes(id) && id === 'test' && truthy(vars.with_test)) return false;
    }
    if (!moduleDef.condition) return true;
    return truthy(vars[moduleDef.condition]);
  });

  const enabledIds = new Set(enabledModules.map((moduleDef) => String(moduleDef.id || '').trim()).filter(Boolean));
  const filteredDependencyGraph = Object.keys(dependencyGraph).reduce((acc, key) => {
    if (!enabledIds.has(key)) return acc;
    acc[key] = (dependencyGraph[key] || []).filter((dep) => enabledIds.has(dep));
    return acc;
  }, /** @type {Record<string, string[]>} */ ({}));
  const orderedModules = sortModulesByGraph(enabledModules, filteredDependencyGraph);

  const settings = resolvePlanSettings({ vars, runtime, structure, memory, planning, semantic, paths });
  vars['project.test_template_style'] = settings.testTemplateStyle;

  const styledModules = styleOrderedModules(orderedModules, runtime, settings);
  let updates = buildDynamicUpdates({
    action,
    enabledModules,
    paths: { ...paths, feature_root: settings.featureRoot },
    structure,
    fileNames: settings.fileNames,
    vars,
    memory,
    appRouteImportPath: settings.imports.import_route_from_entrypoint,
  });

  if ((runtime === 'python' || runtime === 'go') && paths.route_index) {
    updates = updates.concat([{ type: 'register_route_in_entrypoint', file: paths.route_index, only_if_exists: true }]);
  }

  applyGeneratedFilesSummary({
    vars,
    orderedModules,
    enabledIds,
    paths,
    fileNames: settings.fileNames,
  });

  return {
    mode: 'feature_bundle',
    paths: { ...paths, feature_root: settings.featureRoot },
    modules: enabledModules,
    ordered_modules: styledModules,
    dependency_graph: filteredDependencyGraph,
    verify: Array.isArray(action.verify) ? action.verify : [],
    updates,
    feature_root: settings.featureRoot,
    route_export_target: settings.routeExportTarget,
    file_names: settings.fileNames,
    imports: settings.imports,
    template_vars: buildTemplateVars(vars, semantic),
  };
}

module.exports = {
  buildFeaturePlan,
  defaultNodePaths,
  defaultGoPaths,
};
