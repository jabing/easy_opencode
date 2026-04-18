const fs = require('fs');
const path = require('path');

/** @typedef {Record<string, any>} LooseRecord */
/** @typedef {{ default: string | null, ci: string | null, watch: string | null, coverage: string | null }} PreferredTestCommands */

/** @param {string} filePath @returns {LooseRecord | null} */
function readJsonSafe(filePath) {
  try {
    return /** @type {LooseRecord} */ (JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

/** @param {unknown} value @returns {string[]} */
function normalizeCommands(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return [String(value).trim()].filter(Boolean);
}

/** @param {LooseRecord} [memory] */
function collectFailureCounts(memory = {}) {
  const counts = new Map();
  for (const item of Array.isArray(memory.failure_patterns) ? memory.failure_patterns : []) {
    const key = String(item.pattern || item.root_cause || '').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/** @param {LooseRecord} memory @param {string} key */
function hasRecentPattern(memory, key) {
  return collectFailureCounts(memory).has(key);
}

/** @param {string} root @param {LooseRecord} [memory] */
function inferNodeTestFallback(root, memory = {}) {
  const testFramework = String(memory.test_framework || '').trim();
  const candidateDirs = ['tests', 'test', '__tests__'];
  const hasTestsDir = candidateDirs.some((rel) => fs.existsSync(path.join(root, rel)));
  if (testFramework === 'node:test' && hasTestsDir) return 'node --test';
  return null;
}

/** @param {unknown} value */
function normalizeBooleanLike(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return undefined;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return Boolean(value);
}

/** @param {string} root @returns {LooseRecord} */
function readProjectPackage(root) {
  return readJsonSafe(path.join(root, 'package.json')) || {};
}

/** @param {string | null | undefined} preferred @param {LooseRecord} scripts @param {LooseRecord} deps @param {string} packageManager */
function resolveNamedCommand(preferred, scripts, deps, packageManager) {
  const command = String(preferred || '').trim();
  if (!command) return null;
  if (/^npm\s+run\s+test:unit$/.test(command) && scripts['test:unit']) return `${packageManager} run test:unit`;
  if (/^npm\s+run\s+test:ci$/.test(command) && scripts['test:ci']) return `${packageManager} run test:ci`;
  if (/^npm\s+run\s+test:watch$/.test(command) && scripts['test:watch']) return `${packageManager} run test:watch`;
  if (/^npm\s+run\s+test:coverage$/.test(command) && scripts['test:coverage']) return `${packageManager} run test:coverage`;
  if (/^npm\s+run\s+coverage$/.test(command) && scripts.coverage) return `${packageManager} run coverage`;
  if ((/^npm\s+run\s+test$/.test(command) || /^npm\s+test$/.test(command)) && scripts.test) return `${packageManager} run test`;
  if (/^node\s+--test$/.test(command)) return command;
  if (/vitest/.test(command) && deps.vitest) return /watch/.test(command) ? 'npx vitest --watch' : (/coverage/.test(command) ? 'npx vitest run --coverage' : 'npx vitest run');
  if (/jest/.test(command) && deps.jest) return /watch/.test(command) ? 'npx jest --watch' : (/coverage/.test(command) ? 'npx jest --coverage --runInBand' : 'npx jest --runInBand');
  if (/mocha/.test(command) && deps.mocha) return /watch/.test(command) ? 'npx mocha --watch' : 'npx mocha';
  return null;
}

/** @param {LooseRecord} memory @param {LooseRecord} scripts @param {LooseRecord} deps @param {string} packageManager @param {string} [mode] */
function preferredMemoryTestCommand(memory, scripts, deps, packageManager, mode = 'default') {
  const matrix = /** @type {PreferredTestCommands & LooseRecord} */ (memory.preferred_test_commands || {});
  const preferred = mode === 'default'
    ? (matrix.default || memory.preferred_test_command || '')
    : (matrix[mode] || '');
  return resolveNamedCommand(preferred, scripts, deps, packageManager);
}

/** @param {PreferredTestCommands | LooseRecord} [commands] @param {LooseRecord} [memory] @param {LooseRecord} [scripts] */
function buildRunnerProfile(commands = {}, memory = {}, scripts = {}) {
  const preferred = /** @type {PreferredTestCommands & LooseRecord} */ (commands || {});
  /** @param {string | null | undefined} command */
  function resolvedText(command) {
    const value = String(command || '').trim();
    const match = value.match(/^npm\s+run\s+([^\s]+)$/);
    const scriptName = match ? String(match[1] || '') : '';
    if (scriptName && scripts[scriptName]) return `${value} => ${String(scripts[scriptName]).trim()}`;
    return value;
  }
  /** @param {string} text */
  function inferRunner(text) {
    if (/vitest/.test(text)) return 'vitest';
    if (/jest/.test(text)) return 'jest';
    if (/mocha/.test(text)) return 'mocha';
    if (/node\s+--test/.test(text)) return 'node:test';
    return String(memory.test_framework || '').trim() || 'script';
  }
  /** @param {string | null | undefined} command @param {string} mode */
  function profileFor(command, mode) {
    const value = String(command || '').trim();
    if (!value) return null;
    const text = resolvedText(value);
    return {
      runner: inferRunner(text),
      mode,
      ci_safe: mode === 'ci' || !/watch/.test(text),
      watch: /watch/.test(text),
      coverage: /coverage/.test(text),
      run_in_band: /runInBand/.test(text),
      command: value,
    };
  }
  return {
    default: profileFor(preferred.default, 'default'),
    ci: profileFor(preferred.ci, 'ci'),
    watch: profileFor(preferred.watch, 'watch'),
    coverage: profileFor(preferred.coverage, 'coverage'),
  };
}

/** @param {LooseRecord} memory @param {LooseRecord} scripts @param {LooseRecord} deps @param {string} packageManager @param {string} [mode] */
function preferredFrameworkTestCommand(memory, scripts, deps, packageManager, mode = 'default') {
  const framework = String(memory.test_framework || '').trim();
  const unitScript = String(scripts['test:unit'] || '').trim();
  const ciScript = String(scripts['test:ci'] || scripts['ci:test'] || '').trim();
  const watchScript = String(scripts['test:watch'] || scripts['watch:test'] || scripts['test:dev'] || '').trim();
  const coverageScript = String(scripts['test:coverage'] || scripts.coverage || scripts['coverage:test'] || '').trim();
  const mainTestScript = String(scripts.test || '').trim();
  const modeScript = mode === 'ci' ? ciScript : (mode === 'watch' ? watchScript : (mode === 'coverage' ? coverageScript : unitScript));
  /** @returns {string | null} */
  function frameworkFallback() {
    if (framework === 'vitest') {
      if (mode === 'watch') return 'npx vitest --watch';
      if (mode === 'coverage') return 'npx vitest run --coverage';
      return 'npx vitest run';
    }
    if (framework === 'jest') {
      if (mode === 'watch') return 'npx jest --watch';
      if (mode === 'coverage') return 'npx jest --coverage --runInBand';
      return 'npx jest --runInBand';
    }
    if (framework === 'mocha') {
      if (mode === 'watch') return 'npx mocha --watch';
      return 'npx mocha';
    }
    return null;
  }
  const modeScriptName = mode === 'ci' && scripts['test:ci'] ? 'test:ci'
    : (mode === 'watch' && (scripts['test:watch'] || scripts['watch:test'] || scripts['test:dev'])
      ? (scripts['test:watch'] ? 'test:watch' : (scripts['watch:test'] ? 'watch:test' : 'test:dev'))
      : (mode === 'coverage' && (scripts['test:coverage'] || scripts.coverage || scripts['coverage:test'])
        ? (scripts['test:coverage'] ? 'test:coverage' : (scripts.coverage ? 'coverage' : 'coverage:test'))
        : 'test:unit'));
  if (framework === 'vitest') {
    if (/vitest/.test(modeScript)) return `${packageManager} run ${modeScriptName}`;
    if (/vitest/.test(unitScript)) return `${packageManager} run test:unit`;
    if (/vitest/.test(mainTestScript)) return `${packageManager} run test`;
    if (deps.vitest) return frameworkFallback();
  }
  if (framework === 'jest') {
    if (/jest/.test(modeScript)) return `${packageManager} run ${modeScriptName}`;
    if (/jest/.test(unitScript)) return `${packageManager} run test:unit`;
    if (/jest/.test(mainTestScript)) return `${packageManager} run test`;
    if (deps.jest) return frameworkFallback();
  }
  if (framework === 'mocha') {
    if (/mocha/.test(modeScript)) return `${packageManager} run ${modeScriptName}`;
    if (/mocha/.test(unitScript)) return `${packageManager} run test:unit`;
    if (/mocha/.test(mainTestScript)) return `${packageManager} run test`;
    if (deps.mocha) return frameworkFallback();
  }
  return null;
}

/** @param {string} root @param {LooseRecord} [profile] @param {LooseRecord} [memory] @param {unknown[]} [requested] @param {LooseRecord} [options] */
function inferVerifyCommands(root, profile = {}, memory = {}, requested = [], options = {}) {
  if (String(profile.runtime || '').trim() === 'python') {
    const requestedList = normalizeCommands(requested);
    const commands = requestedList.length > 0
      ? requestedList
      : ((Array.isArray(profile.validation) ? profile.validation.map((item) => item && item.command).filter(Boolean) : []).slice(0, 2));
    const preferred = commands.find((command) => /pytest|unittest/.test(command)) || null;
    return {
      commands,
      reasons: commands.map((command) => `using python validation command: ${command}`),
      safe_mode: false,
      preferred_test_command: preferred,
      preferred_test_commands: { default: preferred, ci: preferred, watch: null, coverage: null },
      preferred_test_runner_profile: {
        default: preferred ? { runner: /pytest/.test(preferred) ? 'pytest' : 'unittest', mode: 'default', ci_safe: true, watch: false, coverage: false, command: preferred } : null,
        ci: null,
        watch: null,
        coverage: null,
      },
    };
  }
  if (String(profile.runtime || '').trim() === 'go') {
    const requestedList = normalizeCommands(requested);
    const commands = requestedList.length > 0
      ? requestedList
      : ((Array.isArray(profile.validation) ? profile.validation.map((item) => item && item.command).filter(Boolean) : []).slice(0, 4));
    if (commands.length === 0) commands.push('go build ./...', 'go test ./...');
    const preferred = commands.find((command) => /go test/.test(String(command || ''))) || 'go test ./...';
    const coverageCommand = commands.find((command) => /cover/.test(String(command || ''))) || null;
    return {
      commands,
      reasons: commands.map((command) => `using go verification command: ${command}`),
      safe_mode: false,
      preferred_test_command: preferred,
      preferred_test_commands: { default: preferred, ci: preferred, watch: null, coverage: null },
      preferred_test_runner_profile: {
        default: { runner: 'go test', mode: 'default', ci_safe: true, watch: false, coverage: /cover/.test(preferred), command: preferred },
        ci: { runner: 'go test', mode: 'ci', ci_safe: true, watch: false, coverage: /cover/.test(preferred), command: preferred },
        watch: null,
        coverage: coverageCommand ? { runner: 'go test', mode: 'coverage', ci_safe: true, watch: false, coverage: true, command: coverageCommand } : null,
      },
    };
  }

  const pkg = readProjectPackage(root);
  const scripts = /** @type {LooseRecord} */ (pkg.scripts || {});
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const packageManager = String(profile.package_manager || 'npm').trim() || 'npm';
  const requestedList = normalizeCommands(requested);
  const failures = collectFailureCounts(memory);
  /** @type {string[]} */
  const reasons = [];
  /** @type {string[]} */
  const commands = [];

  /** @param {string | null | undefined} command @param {string} reason */
  function addCommand(command, reason) {
    if (!command || commands.includes(command)) return;
    commands.push(command);
    if (reason) reasons.push(reason);
  }

  /** @param {string} command @param {string} reason */
  function skipReason(command, reason) {
    reasons.push(`${command}: ${reason}`);
  }

  const requestedMode = String(options.mode || (options.ci_mode ? 'ci' : 'default')).trim() || 'default';

  /** @param {string} [mode] */
  function preferredTestCommand(mode = requestedMode) {
    return preferredMemoryTestCommand(memory, scripts, deps, packageManager, mode)
      || preferredFrameworkTestCommand(memory, scripts, deps, packageManager, mode)
      || inferNodeTestFallback(root, memory);
  }

  for (const command of requestedList) {
    if (options.ci_mode && /watch/.test(command)) {
      const preferred = preferredTestCommand('ci') || preferredTestCommand('default');
      if (preferred) addCommand(preferred, 'replaced watch-oriented verify step with ci-safe command');
      else skipReason(command, 'ci mode disallows watch-style verify commands');
      continue;
    }
    if (requestedMode === 'coverage' && /(npm\s+run\s+test:coverage|npm\s+run\s+coverage|coverage:test|--coverage)/.test(command)) {
      const preferred = preferredTestCommand('coverage') || preferredTestCommand('default');
      if (preferred) addCommand(preferred, 'selected coverage-aware verify step');
      else skipReason(command, 'project has no coverage-capable test command');
      continue;
    }
    if (/^npm\s+run\s+build$/.test(command)) {
      if (scripts.build) addCommand(`${packageManager} run build`, 'using project build script');
      else if (failures.has('missing-build-script')) skipReason(command, 'previous build script failure recorded');
      else skipReason(command, 'project has no build script');
      continue;
    }
    if (/^npm\s+test$/.test(command) || /^npm\s+run\s+test$/.test(command)) {
      if (scripts.test) addCommand(`${packageManager} run test`, 'using project test script');
      else {
        const preferred = preferredTestCommand();
        if (preferred) addCommand(preferred, `selected ${memory.test_framework || 'project-specific'} test command`);
        else if (failures.has('missing-test-script')) skipReason(command, 'previous test script failure recorded');
        else skipReason(command, 'project has no test script');
      }
      continue;
    }
    if (/^(?:npx|npm\s+exec)\s+vitest\s+run$/.test(command)) {
      const preferred = preferredTestCommand();
      if (preferred) addCommand(preferred, 'normalized vitest verify step to project-preferred command');
      else addCommand(command, 'using requested verify step');
      continue;
    }
    if (/^(?:npx|npm\s+exec)\s+jest\s+--runInBand$/.test(command)) {
      const preferred = preferredTestCommand();
      if (preferred) addCommand(preferred, 'normalized jest verify step to project-preferred command');
      else addCommand(command, 'using requested verify step');
      continue;
    }
    if (/^(?:npx|npm\s+exec)\s+mocha$/.test(command)) {
      const preferred = preferredTestCommand();
      if (preferred) addCommand(preferred, 'normalized mocha verify step to project-preferred command');
      else addCommand(command, 'using requested verify step');
      continue;
    }
    if (/watch/.test(command) || /^npm\s+run\s+test:watch$/.test(command) || /^npm\s+run\s+test:dev$/.test(command)) {
      const preferred = preferredTestCommand(options.ci_mode ? 'ci' : 'watch') || preferredTestCommand('default');
      if (preferred) addCommand(preferred, options.ci_mode ? 'normalized watch verify step to CI-safe command' : 'normalized watch verify step to project-preferred command');
      else addCommand(command, 'using requested verify step');
      continue;
    }
    addCommand(command, 'using requested verify step');
  }

  if (commands.length === 0) {
    if (scripts.build) addCommand(`${packageManager} run build`, 'defaulted to project build script');
    const preferred = preferredTestCommand();
    if (preferred) addCommand(preferred, `defaulted to ${memory.test_framework || 'project-specific'} test command`);
    else if (scripts.test) addCommand(`${packageManager} run test`, 'defaulted to project test script');
  }

  const safeMode = hasRecentPattern(memory, 'cannot-find-module') || hasRecentPattern(memory, 'verify-failed') || hasRecentPattern(memory, 'missing-build-script') || hasRecentPattern(memory, 'missing-test-script');

  /** @type {PreferredTestCommands} */
  const preferredTestCommands = {
    default: preferredTestCommand('default') || null,
    ci: preferredTestCommand('ci') || preferredTestCommand('default') || null,
    watch: preferredTestCommand('watch') || null,
    coverage: preferredTestCommand('coverage') || null,
  };

  return {
    commands,
    safe_mode: safeMode,
    reasons,
    preferred_test_command: commands.find((command) => /test|vitest|jest|mocha/.test(command)) || preferredTestCommands.default || null,
    preferred_test_commands: preferredTestCommands,
    preferred_test_runner_profile: buildRunnerProfile(preferredTestCommands, memory, scripts),
    failure_counts: Object.fromEntries(failures.entries()),
  };
}

module.exports = {
  readJsonSafe,
  normalizeCommands,
  collectFailureCounts,
  hasRecentPattern,
  inferNodeTestFallback,
  normalizeBooleanLike,
  readProjectPackage,
  resolveNamedCommand,
  preferredMemoryTestCommand,
  buildRunnerProfile,
  preferredFrameworkTestCommand,
  inferVerifyCommands,
};
