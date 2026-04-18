const path = require('path');
const { buildFeaturePaths } = require('../project/structure.js');

/** @typedef {Record<string, any> & { kebab_name?: string, name?: string, pascal_name?: string, runtime?: string, ['project.plan_mode']?: string }} FeatureVars */
/** @typedef {Record<string, string> & { route_index?: string, feature_root?: string, route?: string, service?: string, repository?: string, schema?: string, controller?: string }} FeaturePaths */
/** @typedef {{ type?: string, file?: string, content?: string, create_if_missing?: unknown, only_if_exists?: unknown, import_path?: string, register_name?: string }} UpdateDef */
/** @typedef {{ dependency_graph?: Record<string, string[]> }} FeaturePlanShape */
/** @typedef {{ updates?: UpdateDef[], plan?: FeaturePlanShape }} FeatureAction */
/** @typedef {{ id?: string }} FeatureModule */
/** @typedef {{ controller_filename?: string, service_filename?: string, repository_filename?: string, schema_filename?: string, route_filename?: string }} FeatureFileNames */
/** @typedef {{ module_path?: string, class_name?: string }} SharedErrorModule */
/** @typedef {Record<string, any> & { app_entrypoint?: { module_path?: string }, shared_error_module?: SharedErrorModule | null }} FeatureMemory */
/** @typedef {{ architecture_pattern?: string, conventions?: { index_files?: unknown } }} StructureShape */
/** @typedef {{ serviceImport: string, serviceBaseClass: string, routeImport: string, routeGuardType: string, routeSharedGuardLine: string, integrationNote: string }} SharedErrorArtifacts */
/** @typedef {{ declarations: string, guard: string }} ServiceErrorArtifacts */
/** @typedef {{ imports: string, body: string }} RepositoryPersistenceArtifacts */
const posixPath = /** @type {{ relative(from: string, to: string): string, dirname(value: string): string, basename(value: string): string }} */ ((/** @type {any} */ (require('path')).posix || path));

/** @param {unknown} value */
function truthy(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return !['false', '0', 'no', 'off', 'null', 'undefined'].includes(normalized);
}

/** @param {FeatureVars} [vars] @param {unknown} [structure] @returns {FeaturePaths} */
function defaultNodePaths(vars = {}, structure = null) {
  if (structure) return buildFeaturePaths(/** @type {any} */ (structure), vars);
  const featureDir = `src/features/${vars.kebab_name || ''}`;
  return {
    feature_root: featureDir,
    controller: featureDir,
    service: featureDir,
    repository: featureDir,
    schema: featureDir,
    route: featureDir,
    test: `tests/features/${vars.kebab_name || ''}`,
    docs: 'docs/api',
    route_index: 'src/features/index.ts',
    docs_index: 'docs/api/index.md',
  };
}

/** @param {FeatureVars} [vars] @param {unknown} [structure] @returns {FeaturePaths} */
function defaultGoPaths(vars = {}, structure = null) {
  if (structure) return buildFeaturePaths(/** @type {any} */ (structure), vars);
  const base = 'internal';
  return {
    feature_root: `${base}/handlers`,
    controller: `${base}/handlers`,
    service: `${base}/services`,
    repository: `${base}/repositories`,
    schema: `${base}/models`,
    route: `${base}/handlers`,
    test: `${base}/handlers`,
    docs: 'docs/api',
    route_index: `${base}/handlers/routes.go`,
    docs_index: 'docs/api/index.md',
  };
}

/** @param {FeatureVars} [vars] @param {unknown} [structure] @returns {FeaturePaths} */
function defaultPythonPaths(vars = {}, structure = null) {
  if (structure) return buildFeaturePaths(/** @type {any} */ (structure), vars);
  const base = 'app';
  return {
    feature_root: `${base}/routers`,
    controller: `${base}/routers`,
    service: `${base}/services`,
    repository: `${base}/repositories`,
    schema: `${base}/schemas`,
    route: `${base}/routers`,
    test: 'tests',
    docs: 'docs/api',
    route_index: `${base}/main.py`,
    docs_index: 'docs/api/index.md',
  };
}

/** @param {unknown} fromDir @param {unknown} toFile @param {string} [sourceRoot] */
function relativePythonImport(fromDir, toFile, sourceRoot = '.') {
  void fromDir;
  void sourceRoot;
  /** @param {unknown} value */
  const normalize = (value) => String(value || '').replace(/\\/g, '/').replace(/\.py$/, '').replace(/^\.?\//, '');
  return normalize(toFile).split('/').filter(Boolean).join('.');
}

/** @param {unknown} value */
function withDotPrefix(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  if (!normalized) return './';
  if (normalized.startsWith('.')) return normalized;
  return `./${normalized}`;
}

/** @param {unknown} value */
function stripExtension(value) {
  return String(value || '').replace(/\.[^.\/]+$/, '');
}

/** @param {unknown} fromDir @param {unknown} toFile */
function relativeImport(fromDir, toFile) {
  return withDotPrefix(stripExtension(posixPath.relative(
    String(fromDir || '').replace(/\\/g, '/'),
    String(toFile || '').replace(/\\/g, '/'),
  )));
}

/** @param {unknown} entrypointFile @param {unknown} routeFile */
function entrypointImportPath(entrypointFile, routeFile) {
  const entryDir = posixPath.dirname(String(entrypointFile || '').replace(/\\/g, '/'));
  return relativeImport(entryDir, routeFile);
}

/** @param {unknown} modulePath @param {unknown} relDir */
function goImportPath(modulePath, relDir) {
  const normalizedModule = String(modulePath || '').trim().replace(/\\/g, '/').replace(/\/+$/g, '');
  const normalizedRel = String(relDir || '').trim().replace(/\\/g, '/').replace(/^\.?\//, '').replace(/^\/+|\/+$/g, '');
  if (!normalizedModule) return posixPath.basename(normalizedRel || '.') || '.';
  if (!normalizedRel || normalizedRel === '.') return normalizedModule;
  return `${normalizedModule}/${normalizedRel}`;
}

/** @param {unknown} kebabName @param {unknown} suffix @param {string} fallback */
function featureFileName(kebabName, suffix, fallback) {
  const normalizedSuffix = String(suffix || fallback || '').trim() || fallback;
  return `${String(kebabName || '')}${normalizedSuffix}`;
}

/** @param {unknown} authMode @param {string} [indentation] */
function authGuardSnippet(authMode, indentation = '    ') {
  if (authMode === 'bearer-guard') {
    return [
      `${indentation}const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';`,
      `${indentation}if (!authHeader.startsWith('Bearer ')) {`,
      `${indentation}  res.status(401).json({ ok: false, error: 'Missing bearer token' });`,
      `${indentation}  return;`,
      `${indentation}}`,
      `${indentation}const accessToken = authHeader.slice('Bearer '.length).trim();`,
      `${indentation}if (!accessToken) {`,
      `${indentation}  res.status(401).json({ ok: false, error: 'Empty bearer token' });`,
      `${indentation}  return;`,
      `${indentation}}`,
    ].join('\n');
  }
  if (authMode === 'session-guard') {
    return [
      `${indentation}const requestWithSession = req as typeof req & { session?: unknown };`,
      `${indentation}const session = requestWithSession.session || null;`,
      `${indentation}if (!session) {`,
      `${indentation}  res.status(401).json({ ok: false, error: 'Missing session context' });`,
      `${indentation}  return;`,
      `${indentation}}`,
    ].join('\n');
  }
  if (authMode === 'passport-adapter') {
    return [
      `${indentation}const requestWithPassport = req as typeof req & { isAuthenticated?: () => boolean; user?: unknown };`,
      `${indentation}const actor = typeof requestWithPassport.isAuthenticated === 'function' && requestWithPassport.isAuthenticated() ? requestWithPassport.user : null;`,
      `${indentation}if (!actor) {`,
      `${indentation}  res.status(401).json({ ok: false, error: 'Authentication required' });`,
      `${indentation}  return;`,
      `${indentation}}`,
    ].join('\n');
  }
  return `${indentation}// No auth guard inferred for this project.`;
}

/** @param {unknown} routeStyle */
function requestInputExpression(routeStyle) {
  if (routeStyle === 'graphql-endpoint') return 'req.body?.variables?.input ?? {}';
  if (routeStyle === 'rpc-endpoint') return 'req.body?.params ?? req.body ?? {}';
  return 'req.body ?? {}';
}

/** @param {unknown} routeStyle @param {unknown} kebabName */
function routePathForStyle(routeStyle, kebabName) {
  if (routeStyle === 'graphql-endpoint') return '/graphql';
  if (routeStyle === 'rpc-endpoint') return `/rpc/${String(kebabName || '')}`;
  return `/${String(kebabName || '')}`;
}

/** @param {unknown} routeStyle */
function routeResponseEnvelope(routeStyle) {
  if (routeStyle === 'graphql-endpoint') return "      res.status(200).json({ data: { result } });";
  if (routeStyle === 'rpc-endpoint') return "      res.status(200).json({ ok: true, result });";
  return "      res.status(200).json(result);";
}

/** @param {unknown} repositoryStyle @param {unknown} pascalName @returns {RepositoryPersistenceArtifacts} */
function repositoryPersistenceStatements(repositoryStyle, pascalName) {
  const name = String(pascalName || 'Feature');
  if (repositoryStyle === 'prisma-repository') {
    return {
      imports: "import type { PrismaClient } from '@prisma/client';",
      body: [
        'const prisma = null as PrismaClient | null;',
        'void prisma;',
        `// Next: inject PrismaClient and persist ${name} records here.`,
      ].join('\n      '),
    };
  }
  if (repositoryStyle === 'mongoose-repository') {
    return {
      imports: "import type { Model } from 'mongoose';",
      body: [
        `const model = null as Model<${name}Payload> | null;`,
        'void model;',
        `// Next: inject a Mongoose model and persist ${name} documents here.`,
      ].join('\n      '),
    };
  }
  return {
    imports: '',
    body: '// Replace with project-specific persistence integration.',
  };
}

/** @param {unknown} value */
function toConstantCase(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

/** @param {unknown} errorStyle @param {FeatureMemory} memory @param {FeaturePaths} paths @param {FeatureFileNames} fileNames @param {FeatureVars} vars @returns {SharedErrorArtifacts} */
function sharedErrorArtifacts(errorStyle, memory, paths, fileNames, vars) {
  void fileNames;
  const shared = memory?.shared_error_module || null;
  if (errorStyle !== 'typed-errors' || !shared || !shared.module_path || !shared.class_name) {
    return {
      serviceImport: '',
      serviceBaseClass: 'Error',
      routeImport: '',
      routeGuardType: `${String(vars.pascal_name || 'Feature')}ServiceError`,
      routeSharedGuardLine: '',
      integrationNote: 'feature-local',
    };
  }
  const modulePath = String(shared.module_path).replace(/\\/g, '/');
  return {
    serviceImport: `import { ${shared.class_name} } from '${relativeImport(paths.service, modulePath)}';`,
    serviceBaseClass: shared.class_name,
    routeImport: `import { ${shared.class_name} } from '${relativeImport(paths.route, modulePath)}';`,
    routeGuardType: `${String(vars.pascal_name || 'Feature')}ServiceError | ${shared.class_name}`,
    routeSharedGuardLine: `      if (error instanceof ${shared.class_name}) {\n        res.status(400).json({ ok: false, code: 'APP_ERROR', error: error.message });\n        return;\n      }`,
    integrationNote: `${shared.class_name}@${modulePath}`,
  };
}

/** @param {unknown} errorStyle @param {unknown} pascalName @param {string} [baseClass] @returns {ServiceErrorArtifacts} */
function serviceErrorArtifacts(errorStyle, pascalName, baseClass = 'Error') {
  const name = String(pascalName || 'Feature');
  if (errorStyle === 'typed-errors') {
    return {
      declarations: [
        `export class ${name}ServiceError extends ${baseClass} {`,
        `  readonly code = '${toConstantCase(name)}_SERVICE_ERROR';`,
        '',
        '  constructor(message: string) {',
        '    super(message);',
        `    this.name = '${name}ServiceError';`,
        '  }',
        '}',
        '',
      ].join('\n'),
      guard: `if (!input || typeof input !== 'object') {\n        throw new ${name}ServiceError('Expected an object payload for ${name}.');\n      }`,
    };
  }
  return {
    declarations: '',
    guard: `if (!input || typeof input !== 'object') {\n        throw new Error('Expected an object payload for ${name}.');\n      }`,
  };
}

/** @param {unknown} errorStyle @param {unknown} pascalName @param {SharedErrorArtifacts | null} [shared] @param {{ module_path?: string } | null} [globalErrorMiddleware] */
function routeErrorHandling(errorStyle, pascalName, shared = null, globalErrorMiddleware = null) {
  const name = String(pascalName || 'Feature');
  if (errorStyle === 'typed-errors') {
    const sharedGuard = shared && shared.routeSharedGuardLine ? [shared.routeSharedGuardLine] : [];
    return [
      `      if (error instanceof ${name}ServiceError) {`,
      '        res.status(400).json({ ok: false, code: error.code, error: error.message });',
      '        return;',
      '      }',
      ...sharedGuard,
      '      next(error);',
    ].join('\n');
  }
  if (globalErrorMiddleware && globalErrorMiddleware.module_path) {
    return ['      next(error);'].join('\n');
  }
  return [
    "      const message = error instanceof Error ? error.message : 'Unexpected error';",
    '      res.status(500).json({ ok: false, error: message });',
    '      return;',
  ].join('\n');
}

/**
 * @param {{ action: FeatureAction, enabledModules: FeatureModule[], paths: FeaturePaths, structure?: StructureShape | null, fileNames: FeatureFileNames, vars: FeatureVars, memory: FeatureMemory, appRouteImportPath?: string }} input
 * @returns {UpdateDef[]}
 */
function buildDynamicUpdates({ action, enabledModules, paths, structure, fileNames, vars, memory, appRouteImportPath }) {
  const existing = Array.isArray(action.updates) ? action.updates.slice() : [];
  const enabledIds = new Set(enabledModules.map((moduleDef) => String(moduleDef.id || '').trim()).filter(Boolean));
  const indexFiles = Boolean(structure?.conventions?.index_files);

  if (indexFiles && enabledIds.size > 0) {
    if (String(structure?.architecture_pattern || 'feature-based') === 'feature-based') {
      /** @type {string[]} */
      const featureIndexExports = [];
      if (enabledIds.has('controller')) featureIndexExports.push(`export * from './${stripExtension(fileNames.controller_filename)}';`);
      if (enabledIds.has('service')) featureIndexExports.push(`export * from './${stripExtension(fileNames.service_filename)}';`);
      if (enabledIds.has('repository')) featureIndexExports.push(`export * from './${stripExtension(fileNames.repository_filename)}';`);
      if (enabledIds.has('schema')) featureIndexExports.push(`export * from './${stripExtension(fileNames.schema_filename)}';`);
      if (enabledIds.has('route')) featureIndexExports.push(`export * from './${stripExtension(fileNames.route_filename)}';`);
      if (featureIndexExports.length) {
        existing.push({
          type: 'ensure_block',
          file: `${paths.feature_root || ''}/index.ts`,
          content: featureIndexExports.join('\n'),
          create_if_missing: true,
        });
      }
    } else {
      /** @type {[string, string | undefined, string | undefined][]} */
      const layeredMap = [
        ['controller', paths.controller, fileNames.controller_filename],
        ['service', paths.service, fileNames.service_filename],
        ['repository', paths.repository, fileNames.repository_filename],
        ['schema', paths.schema, fileNames.schema_filename],
      ];
      for (const [moduleId, dirPath, fileName] of layeredMap) {
        if (!enabledIds.has(moduleId) || !dirPath || !fileName) continue;
        existing.push({
          type: 'ensure_line',
          file: `${dirPath}/index.ts`,
          content: `export * from './${stripExtension(fileName)}';`,
          only_if_exists: true,
        });
      }
    }
  }

  if (enabledIds.has('integration')) {
    const deps = (action.plan && action.plan.dependency_graph) || {};
    const orderedDependencyLines = enabledModules.map((moduleDef) => {
      const id = String(moduleDef.id || '').trim();
      const upstream = (Array.isArray(deps[id]) ? deps[id] : []).filter((dep) => enabledIds.has(dep));
      return upstream.length ? `- ${id}: depends on ${upstream.join(', ')}` : `- ${id}: root module`;
    });
    vars.integration_dependencies = orderedDependencyLines.join('\n');
  }

  if (enabledIds.has('route') && vars['project.plan_mode'] !== 'plan' && memory?.app_entrypoint?.module_path) {
    existing.push({
      type: 'register_route_in_entrypoint',
      file: memory.app_entrypoint.module_path,
      only_if_exists: true,
      import_path: appRouteImportPath || '',
      register_name: 'register{{pascal_name}}Routes',
    });
  }

  return existing;
}

module.exports = {
  authGuardSnippet,
  buildDynamicUpdates,
  defaultGoPaths,
  defaultNodePaths,
  defaultPythonPaths,
  entrypointImportPath,
  featureFileName,
  goImportPath,
  relativeImport,
  relativePythonImport,
  repositoryPersistenceStatements,
  requestInputExpression,
  routeErrorHandling,
  routePathForStyle,
  routeResponseEnvelope,
  serviceErrorArtifacts,
  sharedErrorArtifacts,
  stripExtension,
  toConstantCase,
  truthy,
  withDotPrefix,
};
