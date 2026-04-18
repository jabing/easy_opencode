const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', '.venv', 'venv', 'target', 'bin', 'out']);

/** @typedef {Record<string, any>} LooseRecord */
/** @typedef {{ module_path: string, class_name: string }} SharedErrorModule */
/** @typedef {{ module_path: string, symbol_name: string }} GlobalErrorMiddleware */
/** @typedef {{ default: string | null, ci: string | null, watch: string | null, coverage: string | null }} PreferredTestCommands */
/** @typedef {{ runner: string, mode: string, ci_safe: boolean, watch: boolean, coverage: boolean, run_in_band: boolean, command: string } | null} RunnerProfile */

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
  const files = [];
  walk(root, (rel) => files.push(rel));
  return files.sort((a, b) => a.localeCompare(b));
}

/** @param {string} filePath @returns {any} */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {string} filePath @returns {string} */
function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/** @param {string} text @param {RegExp[]} patterns @returns {number} */
function countMatches(text, patterns) {
  let score = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    score += matches ? matches.length : 0;
  }
  return score;
}

/** @param {Record<string, number> | null | undefined} map @param {string} fallback @returns {string} */
function pickBest(map, fallback) {
  const entries = Object.entries(map || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const first = entries[0];
  if (!first || first[1] <= 0) return fallback;
  return first[0];
}

/** @param {string[]} files @returns {string} */
function detectFileCase(files) {
  const kebab = files.filter((file) => /[a-z0-9]+-[a-z0-9-]+\.(?:ts|js|md)$/.test(path.basename(file))).length;
  const snake = files.filter((file) => /[a-z0-9]+_[a-z0-9_]+\.(?:ts|js|md)$/.test(path.basename(file))).length;
  if (snake > kebab) return 'snake';
  return 'kebab';
}

/** @param {string[]} files @param {string} textSample @returns {string} */
function detectCodingStyle(files, textSample) {
  const classCount = countMatches(textSample, [/\bclass\s+[A-Z]/g]);
  const functionCount = countMatches(textSample, [/\bexport\s+function\b/g, /\bfunction\s+[a-zA-Z_]/g, /=>\s*\{/g]);
  return classCount > functionCount ? 'class-based' : 'functional';
}

/** @param {LooseRecord} pkg @param {string} textSample @returns {string} */
function detectValidationLib(pkg, textSample) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps.zod || /from ['"]zod['"]/.test(textSample)) return 'zod';
  if (deps.yup || /from ['"]yup['"]/.test(textSample)) return 'yup';
  if (deps.joi || /from ['"]joi['"]/.test(textSample)) return 'joi';
  if (deps['class-validator'] || /from ['"]class-validator['"]/.test(textSample)) return 'class-validator';
  return 'unknown';
}

/** @param {LooseRecord} pkg @param {string} textSample @returns {string} */
function detectOrm(pkg, textSample) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps.prisma || deps['@prisma/client'] || /@prisma\/client/.test(textSample)) return 'prisma';
  if (deps.drizzle || deps['drizzle-orm'] || /drizzle-orm/.test(textSample)) return 'drizzle';
  if (deps.typeorm || /from ['"]typeorm['"]/.test(textSample)) return 'typeorm';
  if (deps.mongoose || /from ['"]mongoose['"]/.test(textSample)) return 'mongoose';
  if (deps.sequelize || /from ['"]sequelize['"]/.test(textSample)) return 'sequelize';
  if (deps.knex || /from ['"]knex['"]/.test(textSample)) return 'knex';
  return 'unknown';
}

/** @param {LooseRecord} pkg @param {LooseRecord} profile @param {string[]} files @param {string} textSample @returns {string} */
function detectTestFramework(pkg, profile, files, textSample) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const scripts = /** @type {LooseRecord} */ (pkg.scripts || {});
  const haystack = `${String(scripts.test || '')}\n${textSample}`;
  if (deps.vitest || /\bvitest\b/.test(haystack) || files.some((file) => file.includes('vitest'))) return 'vitest';
  if (deps.jest || /\bjest\b/.test(haystack)) return 'jest';
  if (deps.mocha || /\bmocha\b/.test(haystack)) return 'mocha';
  if (/node\s+--test/.test(haystack)) return 'node:test';
  return String(profile.test_runner || 'unknown');
}

/** @param {LooseRecord} pkg @param {string} textSample @returns {string} */
function detectApiStyle(pkg, textSample) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps.graphql || deps.apollo || /graphql/.test(textSample)) return 'graphql';
  if (deps.trpc || /trpc/.test(textSample)) return 'rpc';
  return 'rest';
}

/** @param {LooseRecord} pkg @param {string} textSample @returns {string} */
function detectAuthStrategy(pkg, textSample) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps.jsonwebtoken || /jsonwebtoken|jwt/i.test(textSample)) return 'jwt';
  if (deps['express-session'] || /express-session/.test(textSample)) return 'session';
  if (/passport/.test(textSample)) return 'passport';
  return 'unknown';
}

/** @param {string} textSample @returns {string} */
function detectErrorPattern(textSample) {
  if (/AppError|DomainError|TypedError|extends\s+Error/.test(textSample)) return 'typed-errors';
  return 'standard-errors';
}

/** @param {string[]} files @param {string} root @returns {SharedErrorModule | null} */
function detectSharedErrorModule(files, root) {
  const candidates = [
    'src/lib/errors.ts',
    'src/errors.ts',
    'src/shared/errors.ts',
    'src/common/errors.ts',
    'src/lib/app-error.ts',
    'src/errors/index.ts',
  ];
  const ordered = candidates.concat(files.filter((file) => /error/i.test(file) && /\.(ts|js)$/.test(file) && !candidates.includes(file)));
  for (const rel of ordered) {
    if (!files.includes(rel)) continue;
    const body = readTextSafe(path.join(root, rel));
    const match = body.match(/export\s+class\s+(AppError|DomainError|TypedError)/);
    if (match) {
      return {
        module_path: rel,
        class_name: String(match[1] || ''),
      };
    }
  }
  return null;
}

/** @param {string[]} files @param {string} root @returns {GlobalErrorMiddleware | null} */
function detectGlobalErrorMiddleware(files, root) {
  const candidates = [
    'src/middleware/error-handler.ts',
    'src/middleware/error-handler.js',
    'src/middleware/errors.ts',
    'src/lib/error-handler.ts',
    'src/lib/error-handler.js',
    'src/errors/middleware.ts',
    'src/errors/handler.ts',
    'src/app-error-handler.ts',
  ];
  const ordered = candidates.concat(files.filter((file) => /error|middleware/i.test(file) && /\.(ts|js)$/.test(file) && !candidates.includes(file)));
  for (const rel of ordered) {
    if (!files.includes(rel)) continue;
    const body = readTextSafe(path.join(root, rel));
    const match = body.match(/export\s+(?:const|function)\s+([A-Za-z0-9_]+ErrorHandler|errorHandler|handleError|appErrorHandler)/)
      || body.match(/module\.exports\s*=\s*([A-Za-z0-9_]+ErrorHandler|errorHandler|handleError|appErrorHandler)/)
      || body.match(/export\s+default\s+function\s+([A-Za-z0-9_]+ErrorHandler|errorHandler|handleError|appErrorHandler)/);
    const signature = /(err|error)\s*,\s*req\s*,\s*res\s*,\s*next/.test(body) || /app\.use\([^\n]+errorHandler/.test(body);
    if (match || signature) {
      return {
        module_path: rel,
        symbol_name: match ? String(match[1] || 'errorHandler') : 'errorHandler',
      };
    }
  }
  return null;
}

/** @param {LooseRecord} pkg @param {LooseRecord} profile @param {string} testFramework @returns {PreferredTestCommands} */
function detectPreferredTestCommands(pkg, profile, testFramework) {
  const scripts = /** @type {LooseRecord} */ (pkg.scripts || {});
  const packageManager = String(profile.package_manager || 'npm').trim() || 'npm';

  /** @param {string} name @returns {string | null} */
  function scriptCommand(name) {
    return scripts[name] ? `${packageManager} run ${name}` : null;
  }

  /** @param {string} [mode] @returns {string | null} */
  function frameworkFallback(mode = 'default') {
    if (testFramework === 'vitest') {
      if (mode === 'watch') return 'npx vitest --watch';
      if (mode === 'coverage') return 'npx vitest run --coverage';
      return 'npx vitest run';
    }
    if (testFramework === 'jest') {
      if (mode === 'watch') return 'npx jest --watch';
      if (mode === 'coverage') return 'npx jest --coverage --runInBand';
      return 'npx jest --runInBand';
    }
    if (testFramework === 'mocha') {
      if (mode === 'watch') return 'npx mocha --watch';
      if (mode === 'coverage') return 'npx mocha';
      return 'npx mocha';
    }
    if (testFramework === 'node:test') return 'node --test';
    return null;
  }

  const default_cmd = scriptCommand('test:unit') || scriptCommand('test') || frameworkFallback('default');
  const ci_cmd = scriptCommand('test:ci') || scriptCommand('ci:test') || scriptCommand('test:unit') || default_cmd || frameworkFallback('default');
  const watch_cmd = scriptCommand('test:watch') || scriptCommand('watch:test') || scriptCommand('test:dev') || frameworkFallback('watch');
  const coverage_cmd = scriptCommand('test:coverage') || scriptCommand('coverage') || scriptCommand('coverage:test') || frameworkFallback('coverage');

  return {
    default: default_cmd || null,
    ci: ci_cmd || default_cmd || null,
    watch: watch_cmd || null,
    coverage: coverage_cmd || null,
  };
}

/** @param {string | null | undefined} command @param {string} [mode] @returns {RunnerProfile} */
function inferRunnerProfileFromCommand(command, mode = 'default') {
  const value = String(command || '').trim();
  if (!value) return null;
  return {
    runner: /vitest/.test(value) ? 'vitest' : (/jest/.test(value) ? 'jest' : (/mocha/.test(value) ? 'mocha' : (/node\s+--test/.test(value) ? 'node:test' : 'script'))),
    mode,
    ci_safe: mode === 'ci' || !/watch/.test(value),
    watch: /watch/.test(value),
    coverage: /coverage/.test(value),
    run_in_band: /runInBand/.test(value),
    command: value,
  };
}

/** @param {PreferredTestCommands} [preferredTestCommands] @param {LooseRecord} [pkg] @param {string} [testFramework] */
function detectPreferredTestRunnerProfile(preferredTestCommands = { default: null, ci: null, watch: null, coverage: null }, pkg = {}, testFramework = '') {
  const scripts = /** @type {LooseRecord} */ (pkg.scripts || {});
  /** @param {string | null | undefined} command @param {string} mode @returns {RunnerProfile} */
  function profile(command, mode) {
    const value = String(command || '').trim();
    if (!value) return null;
    const match = value.match(/^npm\s+run\s+([^\s]+)$/);
    const scriptName = match ? String(match[1] || '') : '';
    const resolved = scriptName && scripts[scriptName] ? `${value} => ${String(scripts[scriptName]).trim()}` : value;
    const base = inferRunnerProfileFromCommand(resolved, mode) || inferRunnerProfileFromCommand(value, mode);
    if (!base) return null;
    if (base.runner === 'script' && testFramework) base.runner = testFramework;
    base.command = value;
    return base;
  }
  return {
    default: profile(preferredTestCommands.default, 'default'),
    ci: profile(preferredTestCommands.ci, 'ci'),
    watch: profile(preferredTestCommands.watch, 'watch'),
    coverage: profile(preferredTestCommands.coverage, 'coverage'),
  };
}

/** @param {string[]} files @param {string} root @param {GlobalErrorMiddleware | null} [globalErrorMiddleware] */
function detectAppEntrypoint(files, root, globalErrorMiddleware = null) {
  const candidates = [
    'src/app.ts',
    'src/app.js',
    'src/server.ts',
    'src/server.js',
    'src/main.ts',
    'src/main.js',
    'src/index.ts',
    'src/index.js',
    'app.ts',
    'server.ts',
    'main.ts',
    'index.ts',
  ];
  const ordered = candidates.concat(files.filter((file) => /(app|server|main|index)\.(ts|js)$/.test(file) && !candidates.includes(file)));
  for (const rel of ordered) {
    if (!files.includes(rel)) continue;
    const body = readTextSafe(path.join(root, rel));
    const looksLikeEntry = /express\(|fastify\(|createServer\(|app\.listen\(|server\.listen\(|bootstrap\(/.test(body);
    const registered = globalErrorMiddleware && globalErrorMiddleware.symbol_name
      ? new RegExp(`(?:app|server|router)\\.use\\([^\\n;]*${globalErrorMiddleware.symbol_name}`).test(body)
      : /(?:app|server|router)\.use\([^\n;]*(?:errorHandler|appErrorHandler|handleError)/.test(body);
    if (looksLikeEntry || registered) {
      return {
        module_path: rel,
        registers_global_error_handler: registered,
      };
    }
  }
  return null;
}

/** @param {LooseRecord | null} structure @param {string[]} files @returns {string[]} */
function detectPreferredFeatureShape(structure, files) {
  const pattern = String((structure || {}).architecture_pattern || 'feature-based');
  const present = new Set();
  for (const file of files) {
    if (/\.route(s)?\.(ts|js)$/.test(file)) present.add('route');
    if (/\.controller\.(ts|js)$/.test(file)) present.add('controller');
    if (/\.service\.(ts|js)$/.test(file)) present.add('service');
    if (/\.repository\.(ts|js)$/.test(file)) present.add('repository');
    if (/\.schema\.(ts|js)$/.test(file)) present.add('schema');
    if (/\.(spec|test)\.(ts|js)$/.test(file)) present.add('test');
  }
  const ordered = pattern === 'layered'
    ? ['controller', 'service', 'repository', 'schema', 'route', 'test']
    : ['route', 'controller', 'service', 'repository', 'schema', 'test'];
  return ordered.filter((item) => present.has(item)).concat(ordered.filter((item) => !present.has(item)));
}

module.exports = {
  walk,
  listFiles,
  readJsonSafe,
  readTextSafe,
  countMatches,
  pickBest,
  detectFileCase,
  detectCodingStyle,
  detectValidationLib,
  detectOrm,
  detectTestFramework,
  detectApiStyle,
  detectAuthStrategy,
  detectErrorPattern,
  detectSharedErrorModule,
  detectGlobalErrorMiddleware,
  detectPreferredTestCommands,
  inferRunnerProfileFromCommand,
  detectPreferredTestRunnerProfile,
  detectAppEntrypoint,
  detectPreferredFeatureShape,
};
