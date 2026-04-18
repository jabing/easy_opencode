const fs = require('fs');
const path = require('path');

/** @typedef {import('../../../shared/domain.js').ProjectProfileResult} ProjectProfileResult */
/** @typedef {import('../../../shared/domain.js').ValidationCommand} ValidationCommand */
/** @typedef {Record<string, string | Record<string, string[]> | undefined> & { name?: string, packageManager?: string, main?: string, bin?: string | Record<string, string>, scripts?: Record<string, string>, dependencies?: Record<string, string>, devDependencies?: Record<string, string>, peerDependencies?: Record<string, string>, optionalDependencies?: Record<string, string>, workspaces?: string[] | { packages?: string[] } }} PackageJsonLike */

/** @param {string} root @param {string} rel */
function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

/** @param {string} filePath @returns {PackageJsonLike | null} */
function readJsonSafe(filePath) {
  try {
    return /** @type {PackageJsonLike} */ (JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

/** @param {string} filePath */
function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/** @param {PackageJsonLike} pkg */
function parsePackageManager(pkg) {
  const declared = String(pkg.packageManager || '').trim();
  if (!declared) return null;
  const match = declared.match(/^(pnpm|yarn|npm|bun)@/i);
  return match && typeof match[1] === 'string' ? match[1].toLowerCase() : null;
}

/** @param {string} root @param {PackageJsonLike} pkg */
function detectPackageManager(root, pkg) {
  return (
    parsePackageManager(pkg) ||
    (exists(root, 'pnpm-lock.yaml') ? 'pnpm' : null) ||
    (exists(root, 'yarn.lock') ? 'yarn' : null) ||
    (exists(root, 'bun.lockb') || exists(root, 'bun.lock') ? 'bun' : null) ||
    (exists(root, 'package-lock.json') ? 'npm' : null) ||
    'npm'
  );
}

/** @param {string} packageManager @param {string} scriptName */
function runScriptCommand(packageManager, scriptName) {
  if (packageManager === 'yarn') return `yarn ${scriptName}`;
  if (packageManager === 'bun') return `bun run ${scriptName}`;
  return `${packageManager} run ${scriptName}`;
}

/** @param {string} packageManager @param {string} toolName @param {string[]} [args] */
function execToolCommand(packageManager, toolName, args = []) {
  const suffix = [toolName, ...args].join(' ').trim();
  if (packageManager === 'pnpm') return `pnpm exec ${suffix}`;
  if (packageManager === 'yarn') return `yarn ${suffix}`;
  if (packageManager === 'bun') return `bunx ${suffix}`;
  return `npx ${suffix}`;
}

/** @param {unknown} raw */
function looksPlaceholderScript(raw) {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return true;
  return (
    text.includes('no test specified') ||
    text === 'exit 1' ||
    text === 'echo todo' ||
    text === 'echo "todo"'
  );
}

/** @param {PackageJsonLike} pkg @returns {Record<string, string>} */
function dependencyMap(pkg) {
  return {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };
}

/** @param {PackageJsonLike} pkg */
function detectFramework(pkg) {
  const deps = dependencyMap(pkg);
  if (deps.next) return 'next';
  if (deps.nuxt) return 'nuxt';
  if (deps.remix || deps['@remix-run/node']) return 'remix';
  if (deps['@nestjs/core']) return 'nestjs';
  if (deps.express) return 'express';
  if (deps.fastify) return 'fastify';
  if (deps.koa || deps['@koa/router']) return 'koa';
  if (deps.svelte || deps['@sveltejs/kit']) return 'sveltekit';
  if (deps.vue || deps['@vue/runtime-core']) return 'vue';
  if (deps.react || deps['react-dom']) return 'react';
  if (deps.vite) return 'vite';
  return 'node';
}

/** @param {PackageJsonLike} pkg @param {string} framework */
function detectAppType(pkg, framework) {
  if (pkg.bin) return 'cli';
  if (['next', 'nuxt', 'remix'].includes(framework)) return 'fullstack-web';
  if (['react', 'vue', 'vite', 'sveltekit'].includes(framework)) return 'frontend-app';
  if (['nestjs', 'express', 'fastify', 'koa'].includes(framework)) return 'backend-service';
  return 'library-or-service';
}

/** @param {string} root @param {PackageJsonLike} pkg */
function detectWorkspace(root, pkg) {
  if (Array.isArray(pkg.workspaces) || (pkg.workspaces && Array.isArray(pkg.workspaces.packages))) {
    return { is_workspace: true, tool: 'package.json-workspaces' };
  }
  if (exists(root, 'pnpm-workspace.yaml')) return { is_workspace: true, tool: 'pnpm-workspace' };
  if (exists(root, 'turbo.json')) return { is_workspace: true, tool: 'turbo' };
  return { is_workspace: false, tool: null };
}

/** @param {PackageJsonLike} pkg @param {Record<string, string>} scripts */
function detectTestRunner(pkg, scripts) {
  const deps = dependencyMap(pkg);
  const testScript = String(scripts.test || '').toLowerCase();
  if (deps.vitest || testScript.includes('vitest')) return 'vitest';
  if (deps.jest || deps['ts-jest'] || testScript.includes('jest')) return 'jest';
  if (deps.playwright || deps['@playwright/test'] || testScript.includes('playwright')) return 'playwright';
  if (deps.mocha || testScript.includes('mocha')) return 'mocha';
  if (deps.ava || testScript.includes('ava')) return 'ava';
  if (testScript.includes('node --test') || testScript.includes('node:test')) return 'node-test';
  return null;
}

/** @param {PackageJsonLike} pkg @param {Record<string, string>} scripts */
function detectLintTool(pkg, scripts) {
  const deps = dependencyMap(pkg);
  const lintScript = String(scripts.lint || '').toLowerCase();
  if (deps['@biomejs/biome'] || lintScript.includes('biome')) return 'biome';
  if (deps.eslint || deps['@eslint/js'] || lintScript.includes('eslint')) return 'eslint';
  if (deps.xo || lintScript.includes('xo')) return 'xo';
  return null;
}

/** @param {PackageJsonLike} pkg @param {Record<string, string>} scripts */
function detectFormatTool(pkg, scripts) {
  const deps = dependencyMap(pkg);
  const formatScript = String(scripts.format || '').toLowerCase();
  if (deps['@biomejs/biome'] || formatScript.includes('biome')) return 'biome';
  if (deps.prettier || formatScript.includes('prettier')) return 'prettier';
  return null;
}

/** @param {string} root */
function readTsconfigHint(root) {
  if (!exists(root, 'tsconfig.json')) return null;
  const config = readJsonSafe(path.join(root, 'tsconfig.json'));
  if (!config || typeof config !== 'object') return null;
  const compilerOptions = config.compilerOptions && typeof config.compilerOptions === 'object' ? /** @type {{ allowJs?: boolean }} */ (config.compilerOptions) : {};
  return {
    allowJs: compilerOptions.allowJs === true,
  };
}

/** @param {string} root */
function hasTypeScriptSource(root) {
  const candidates = ['src', 'app', 'pages', 'server.ts', 'index.ts', 'vite.config.ts'];
  for (const candidate of candidates) {
    const abs = path.join(root, candidate);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isFile() && /\.tsx?$/.test(candidate)) return true;
    if (!stat.isDirectory()) continue;
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /\.tsx?$/.test(entry.name)) return true;
    }
  }
  return false;
}

/** @param {string} root @param {PackageJsonLike} pkg @param {Record<string, string>} scripts */
function detectTypecheckTool(root, pkg, scripts) {
  const deps = dependencyMap(pkg);
  const typeScript = String(scripts.typecheck || '').toLowerCase();
  if (typeScript.includes('vue-tsc') || deps['vue-tsc']) return 'vue-tsc';
  if (typeScript.includes('tsc') || deps.typescript || exists(root, 'tsconfig.json')) return 'tsc';
  return null;
}

/** @param {string} root @param {string} framework @param {PackageJsonLike} pkg */
function listEntrypoints(root, framework, pkg) {
  /** @type {string[]} */
  const candidates = [];
  /** @param {string} rel */
  const pushIfExists = (rel) => {
    if (exists(root, rel)) candidates.push(rel);
  };
  if (framework === 'next') {
    pushIfExists('app/page.tsx');
    pushIfExists('pages/index.tsx');
    pushIfExists('next.config.js');
    pushIfExists('next.config.mjs');
  }
  if (['express', 'fastify', 'koa', 'nestjs'].includes(framework)) {
    pushIfExists('src/main.ts');
    pushIfExists('src/index.ts');
    pushIfExists('src/server.ts');
    pushIfExists('server.ts');
    pushIfExists('server.js');
    pushIfExists('index.js');
  }
  if (pkg.bin && typeof pkg.bin === 'object') {
    for (const rel of Object.values(pkg.bin)) pushIfExists(String(rel));
  }
  if (typeof pkg.bin === 'string') pushIfExists(pkg.bin);
  if (pkg.main) pushIfExists(String(pkg.main));
  return Array.from(new Set(candidates)).slice(0, 8);
}

/** @param {string} _root @param {PackageJsonLike} pkg @param {string} packageManager @param {string} framework @param {string | null} typecheckTool @param {string | null} lintTool @param {string | null} testRunner @returns {ValidationCommand[]} */
function buildValidationCommands(_root, pkg, packageManager, framework, typecheckTool, lintTool, testRunner) {
  const scripts = pkg.scripts || {};
  /** @type {ValidationCommand[]} */
  const commands = [];

  if (scripts.typecheck && !looksPlaceholderScript(scripts.typecheck)) {
    commands.push({ kind: 'typecheck', command: runScriptCommand(packageManager, 'typecheck'), source: 'package.json' });
  } else if (typecheckTool === 'vue-tsc') {
    commands.push({ kind: 'typecheck', command: execToolCommand(packageManager, 'vue-tsc', ['--noEmit']), source: 'fallback:vue-tsc' });
  } else if (typecheckTool === 'tsc') {
    commands.push({ kind: 'typecheck', command: execToolCommand(packageManager, 'tsc', ['--noEmit', '--pretty', 'false']), source: 'fallback:tsc' });
  }

  if (scripts.lint && !looksPlaceholderScript(scripts.lint)) {
    commands.push({ kind: 'lint', command: runScriptCommand(packageManager, 'lint'), source: 'package.json' });
  } else if (lintTool === 'biome') {
    commands.push({ kind: 'lint', command: execToolCommand(packageManager, 'biome', ['check', '.']), source: 'fallback:biome' });
  } else if (lintTool === 'eslint') {
    commands.push({ kind: 'lint', command: execToolCommand(packageManager, 'eslint', ['.', '--max-warnings', '0']), source: 'fallback:eslint' });
  }

  if (scripts.test && !looksPlaceholderScript(scripts.test)) {
    commands.push({ kind: 'test', command: runScriptCommand(packageManager, 'test'), source: 'package.json' });
  } else if (testRunner === 'vitest') {
    commands.push({ kind: 'test', command: execToolCommand(packageManager, 'vitest', ['run']), source: 'fallback:vitest' });
  } else if (testRunner === 'jest') {
    commands.push({ kind: 'test', command: execToolCommand(packageManager, 'jest', ['--runInBand']), source: 'fallback:jest' });
  }

  if (scripts.build && !looksPlaceholderScript(scripts.build)) {
    commands.push({ kind: 'build', command: runScriptCommand(packageManager, 'build'), source: 'package.json' });
  } else if (framework === 'next') {
    commands.push({ kind: 'build', command: execToolCommand(packageManager, 'next', ['build']), source: 'fallback:next' });
  } else if (framework === 'nuxt') {
    commands.push({ kind: 'build', command: execToolCommand(packageManager, 'nuxi', ['build']), source: 'fallback:nuxt' });
  }

  return commands;
}

/** @param {string} root @returns {ProjectProfileResult | null} */
function detect(root) {
  if (!exists(root, 'package.json')) return null;
  const pkg = readJsonSafe(path.join(root, 'package.json')) || {};
  const scripts = pkg.scripts || {};
  const framework = detectFramework(pkg);
  const packageManager = detectPackageManager(root, pkg);
  const typecheckTool = detectTypecheckTool(root, pkg, scripts);
  const lintTool = detectLintTool(pkg, scripts);
  const testRunner = detectTestRunner(pkg, scripts);
  const formatTool = detectFormatTool(pkg, scripts);
  const workspace = detectWorkspace(root, pkg);
  const tsconfigHint = readTsconfigHint(root);
  const usesTypeScriptSource = hasTypeScriptSource(root);
  const entrypoints = listEntrypoints(root, framework, pkg);
  const validation = buildValidationCommands(root, pkg, packageManager, framework, typecheckTool, lintTool, testRunner);
  const repoShape = workspace.is_workspace ? 'workspace' : 'single-package';
  const configFiles = [
    'package.json',
    'tsconfig.json',
    'next.config.js',
    'next.config.mjs',
    'vite.config.ts',
    'vite.config.js',
    'pnpm-workspace.yaml',
    'turbo.json',
  ].filter((rel) => exists(root, rel));

  return {
    runtime: 'node',
    language: exists(root, 'tsconfig.json') && (!tsconfigHint || !tsconfigHint.allowJs || usesTypeScriptSource) ? 'typescript' : 'javascript',
    framework,
    package_manager: packageManager,
    package_name: pkg.name || path.basename(root),
    validation,
    detected_by: 'package.json',
    build_tool: scripts.build ? 'package-script' : (framework === 'next' ? 'next-build' : (framework === 'nuxt' ? 'nuxi-build' : null)),
    test_runner: testRunner,
    lint_tool: lintTool,
    typecheck_tool: typecheckTool,
    format_tool: formatTool,
    app_type: detectAppType(pkg, framework),
    repo_shape: repoShape,
    workspace,
    entrypoints,
    config_files: configFiles,
    signals: {
      workspaces: workspace.is_workspace,
      has_tsconfig: exists(root, 'tsconfig.json'),
      has_bin: Boolean(pkg.bin),
      script_count: Object.keys(scripts).length,
    },
    confidence: validation.length >= 2 ? 0.9 : 0.75,
  };
}

module.exports = {
  id: 'node',
  detect,
  runScriptCommand,
  detectPackageManager,
  readJsonSafe,
  execToolCommand,
};
