const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { deriveRepairExecution } = require('./executor.js');
const { evaluatePatchFootprint, derivePatchDecision } = require('../implementation/edit-engine.js');

/** @typedef {import('../implementation/edit-engine.js').ChangeSurface} ChangeSurface */
/** @typedef {Record<string, any>} LooseRecord */
/** @typedef {{ command: string, ok: boolean, exit_code: number, stdout: string, stderr: string }} VerifyStep */
/** @typedef {{ ok: boolean, steps: VerifyStep[], combined_output: string }} VerifyResult */

/** @param {string | null | undefined} value @returns {string} */
function slugify(value) {
  return String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** @param {string | null | undefined} value @returns {string} */
function toPascalCase(value) {
  return String(value || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/** @param {string | null | undefined} value @returns {string} */
function toCamelCase(value) {
  const pascal = toPascalCase(value);
  return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : '';
}

/** @param {string | null | undefined} seed */
function deriveNameVars(seed) {
  const raw = String(seed || '').trim();
  const kebab = slugify(raw);
  const pascal = toPascalCase(raw || kebab);
  const camel = toCamelCase(raw || kebab);
  const snake = kebab.replace(/-/g, '_');
  return {
    name: raw,
    kebab_name: kebab,
    snake_name: snake,
    pascal_name: pascal,
    camel_name: camel,
    subject: pascal,
  };
}

/** @param {Record<string, string>} [paths] */
function flattenPathVars(paths = {}) {
  /** @type {Record<string, string | Record<string, string>>} */
  const out = { paths };
  for (const [key, value] of Object.entries(paths)) out[`paths.${key}`] = value;
  return out;
}

/** @param {string | null | undefined} text */
function parseVerifyFailures(text) {
  const raw = String(text || '');
  const fileMentions = new Set();
  /** @type {Array<{ file: string, specifier: string, kind: string }>} */
  const importFailures = [];
  /** @type {Array<{ kind: string, command: string }>} */
  const scriptFailures = [];
  const tsRegex = /([^\n\r]+?\.(?:ts|tsx|js|jsx))\((\d+),(\d+)\):\s*error\s+TS2307:\s*Cannot find module\s+'([^']+)'/g;
  let match;
  while ((match = tsRegex.exec(raw))) {
    const file = String(match[1] || '').trim().replace(/\\/g, '/');
    const specifier = String(match[4] || '').trim();
    fileMentions.add(file);
    importFailures.push({ file, specifier, kind: 'missing_import' });
  }
  const genericRegex = /([^\s]+\.(?:ts|tsx|js|jsx))[^\n\r]*Cannot find module\s+'([^']+)'/g;
  while ((match = genericRegex.exec(raw))) {
    const file = String(match[1] || '').trim().replace(/\\/g, '/');
    const specifier = String(match[2] || '').trim();
    fileMentions.add(file);
    importFailures.push({ file, specifier, kind: 'missing_import' });
  }
  const missingFileRegex = /ENOENT:[^\n\r]*['"]([^'"]+\.(?:ts|tsx|js|jsx|md|json))['"]/g;
  while ((match = missingFileRegex.exec(raw))) {
    const file = String(match[1] || '').trim().replace(/\\/g, '/');
    fileMentions.add(file);
  }
  const missingBuild = /Missing script:\s*["']?build["']?/i.test(raw) || /npm ERR!\s+missing script:\s*build/i.test(raw);
  const missingTest = /Missing script:\s*["']?test(?:[:\w-]+)?["']?/i.test(raw) || /npm ERR!\s+missing script:\s*test(?:[:\w-]+)?/i.test(raw);
  if (missingBuild) scriptFailures.push({ kind: 'missing_build_script', command: 'build' });
  if (missingTest) scriptFailures.push({ kind: 'missing_test_script', command: 'test' });
  return {
    file_mentions: Array.from(fileMentions),
    import_failures: importFailures,
    script_failures: scriptFailures,
    raw,
  };
}

/** @param {string} command @param {LooseRecord} [options] */
function runShellCommand(command, options = {}) {
  const shell = process.platform === 'win32' ? 'cmd.exe' : 'sh';
  const shellArgs = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command];
  return spawnSync(shell, shellArgs, {
    ...options,
    windowsHide: true,
    encoding: 'utf8',
    env: process.env,
  });
}

/** @param {string} root @param {string[] | null | undefined} commands @returns {VerifyResult} */
function runVerifyCommands(root, commands) {
  /** @type {VerifyStep[]} */
  const results = [];
  for (const command of commands || []) {
    const proc = runShellCommand(command, { cwd: root });
    results.push({
      command,
      ok: proc.status === 0,
      exit_code: typeof proc.status === 'number' ? proc.status : 1,
      stdout: String(proc.stdout || ''),
      stderr: String(proc.stderr || ''),
    });
    if (proc.status !== 0) break;
  }
  return {
    ok: results.every((item) => item.ok),
    steps: results,
    combined_output: results.map((item) => [item.stdout, item.stderr].filter(Boolean).join('\n')).filter(Boolean).join('\n'),
  };
}

/** @param {string} filePath */
function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/** @param {string} root @param {{ base: string }} skill @param {{ template: string, output: string }} moduleDef @param {Record<string, string>} vars */
function rerenderModule(root, skill, moduleDef, vars) {
  const templatePath = path.join(skill.base, 'templates', moduleDef.template);
  const outputRel = renderString(moduleDef.output, vars);
  const body = renderString(fs.readFileSync(templatePath, 'utf8'), vars);
  const abs = path.join(root, outputRel);
  ensureDirForFile(abs);
  fs.writeFileSync(abs, body, 'utf8');
  return outputRel;
}

/** @param {string} root @param {{ updates?: Array<{ file?: string, content?: string, create_if_missing?: boolean, only_if_exists?: boolean }>, vars?: Record<string, string> }} plan */
function applyPlannedUpdates(root, plan) {
  /** @type {string[]} */
  const changed = [];
  for (const update of plan.updates || []) {
    const fileRel = renderString(update.file || '', plan.vars || {});
    if (!fileRel) continue;
    const abs = path.join(root, fileRel);
    const content = renderString(update.content || '', plan.vars || {});
    const exists = fs.existsSync(abs);
    if (!exists && !update.create_if_missing && !update.only_if_exists) continue;
    ensureDirForFile(abs);
    const before = exists ? fs.readFileSync(abs, 'utf8') : '';
    if (before.includes(content.trim())) continue;
    const next = before.trimEnd() ? `${before.replace(/\s+$/g, '')}\n\n${content.trim()}\n` : `${content.trim()}\n`;
    fs.writeFileSync(abs, next, 'utf8');
    changed.push(fileRel);
  }
  return changed;
}

/** @param {LooseRecord} profile @param {LooseRecord} memory @param {LooseRecord} [options] @param {Record<string, string>} [inputVars] */
function buildVarsFromMemory(profile, memory, options = {}, inputVars = {}) {
  return {
    ...inputVars,
    runtime: profile.runtime || 'unknown',
    language: profile.language || 'unknown',
    framework: profile.framework || 'unknown',
    package_manager: profile.package_manager || 'unknown',
    test_runner: profile.test_runner || 'unknown',
    'project.coding_style': memory.coding_style || 'functional',
    'project.api_style': memory.api_style || 'rest',
    'project.test_framework': memory.test_framework || profile.test_runner || 'unknown',
    'project.validation_lib': memory.validation_lib || 'unknown',
    'project.orm': memory.orm || 'unknown',
    'project.auth_strategy': memory.auth_strategy || 'unknown',
    'project.error_pattern': memory.error_pattern || 'standard-errors',
    'project.naming.file_case': (memory.naming || {}).file_case || 'kebab',
    'project.preferred_feature_shape': Array.isArray(memory.preferred_feature_shape) ? memory.preferred_feature_shape.join(',') : '',
    'project.implementation_style': options.implementation_style || memory.coding_style || 'functional',
    'project.shape_strategy': options.shape_strategy || 'project-guided',
  };
}

/** @param {string | null | undefined} value @param {Record<string, string | number | boolean | null | undefined>} vars */
function renderString(value, vars) {
  return String(value || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const lookup = vars[String(key)];
    if (lookup === undefined || lookup === null) return `{{${String(key)}}}`;
    return String(lookup);
  });
}

/** @param {LooseRecord | null | undefined} recoveryVerify @param {string[] | null | undefined} verifyCommands @param {string | null | undefined} recoveryMode */
function normalizeRecoveryCommands(recoveryVerify, verifyCommands, recoveryMode) {
  if (!recoveryVerify || !Array.isArray(recoveryVerify.commands)) return recoveryVerify;
  const preferred = recoveryMode === 'coverage'
    ? recoveryVerify.preferred_test_commands?.coverage
    : (recoveryMode === 'ci'
      ? (recoveryVerify.preferred_test_commands?.ci || recoveryVerify.preferred_test_commands?.default)
      : (recoveryVerify.preferred_test_commands?.default || null));
  if (!preferred) return recoveryVerify;
  const original = Array.isArray(verifyCommands) ? verifyCommands : [];
  const commands = recoveryVerify.commands.map((command) => {
    const value = String(command || '').trim();
    const isTestLike = /(?:^npm\s+run\s+test(?::[\w-]+)?$)|(?:^npm\s+test$)|(?:vitest)|(?:jest)|(?:mocha)|(?:^node\s+--test$)/.test(value);
    if (recoveryMode === 'coverage' && isTestLike && preferred !== value) return preferred;
    if (recoveryMode === 'ci' && (/watch/.test(value) || (isTestLike && /watch/.test(preferred) === false && preferred !== value))) return preferred;
    if (original.includes(value) && /^(?:npm\s+run\s+test(?::[\w-]+)?)$/.test(value) && preferred !== value) return preferred;
    return value;
  });
  return {
    ...recoveryVerify,
    commands: Array.from(new Set(commands.filter(Boolean))),
  };
}

/** @param {{ touchedFiles?: string[], repairRecipe?: LooseRecord, changeSurface?: ChangeSurface | undefined, checks?: LooseRecord[], profile?: LooseRecord, relatedTests?: string[], latestFailures?: LooseRecord[] }} [options] */
function buildRepairExecutionSummary({ touchedFiles = [], repairRecipe = {}, changeSurface = undefined, checks = [], profile = {}, relatedTests = [], latestFailures = [] } = {}) {
  const patchGuard = /** @type {LooseRecord} */ (repairRecipe.patch_guard || {});
  const assessmentInput = {
    route: { allowed_files: patchGuard.max_patch_files || null },
    recipe: repairRecipe,
    ...(changeSurface ? { changeSurface } : {}),
    footprint: { touched_files: touchedFiles },
  };
  const assessment = evaluatePatchFootprint(assessmentInput);
  const patchDecision = derivePatchDecision({ assessment, recipe: repairRecipe, route: { allowed_files: patchGuard.max_patch_files || null } });
  const automaticRepair = deriveRepairExecution({
    patchDecision,
    currentPatch: assessment,
    repairRecipe,
    context: { profile, related_tests: relatedTests, targets: [], change_surface: changeSurface },
    checks,
    latestFailures,
  });
  return { patch_evaluation: assessment, patchDecision, automaticRepair };
}

/** @param {LooseRecord} [verifyResult] */
function classifyFailureKinds(verifyResult = {}) {
  const output = String(verifyResult.combined_output || '');
  /** @type {string[]} */
  const summary = [];
  if (/Cannot find module|TS2307|ModuleNotFoundError/.test(output)) summary.push('import_resolve');
  if (/AssertionError|Expected:|received|expect\(/i.test(output)) summary.push('test_assertion');
  if (/error TS\d+|not assignable to type|Property .* does not exist on type/i.test(output)) summary.push('typecheck');
  if (/SyntaxError|Unexpected token|Unexpected identifier/.test(output)) summary.push('syntax');
  if (/Missing script/.test(output)) summary.push('missing_script');
  if (/ERR_REQUIRE_ESM|Cannot use import statement outside a module|ReferenceError: require is not defined in ES module scope/.test(output)) summary.push('module_format');
  if (/ECONNREFUSED|EADDRINUSE|timed out|timeout of \d+ms exceeded/i.test(output)) summary.push('runtime_or_env');
  if (/eslint|prettier|xo|biome|standard.*error/i.test(output)) summary.push('lint_or_format');
  if (/snapshot/i.test(output)) summary.push('snapshot_mismatch');
  return Array.from(new Set(summary));
}

/** @param {{ failureKinds?: string[], objective?: string, verifyCommands?: string[], route?: LooseRecord | null, changeSurface?: ChangeSurface | null }} [options] */
function recommendRepairRecipe({ failureKinds = [], objective = '', verifyCommands = [], route = null, changeSurface = null } = {}) {
  const kinds = Array.from(new Set(Array.isArray(failureKinds) ? failureKinds : [])).filter(Boolean);
  const objectiveText = String(objective || '').toLowerCase();
  /** @type {string[]} */
  const actions = [];
  let preferredEditMode = route && route.edit_mode ? String(route.edit_mode) : 'surgical';
  let verifyScope = route && route.verify_intensity ? String(route.verify_intensity) : 'targeted';
  if (kinds.includes('import_resolve')) {
    actions.push('inspect imports before changing implementation');
    actions.push('limit edits to target file and nearest barrel/index files');
    preferredEditMode = 'surgical';
  }
  if (kinds.includes('typecheck')) {
    actions.push('compare definition and callsite signatures before rewriting logic');
    actions.push('prefer local type alignment over broad refactors');
    preferredEditMode = preferredEditMode === 'expansive' ? 'localized' : preferredEditMode;
  }
  if (kinds.includes('test_assertion') || /test|spec/.test(objectiveText)) {
    actions.push('inspect failing expectation and decide whether behavior or test is stale');
    actions.push('re-run the smallest related test command first');
    preferredEditMode = preferredEditMode === 'surgical' ? 'localized' : preferredEditMode;
    verifyScope = 'targeted';
  }
  if (kinds.includes('module_format')) {
    actions.push('check package type/module format before changing business logic');
    preferredEditMode = 'surgical';
  }
  if (kinds.includes('runtime_or_env')) {
    actions.push('stabilize environment or port usage before editing implementation');
    verifyScope = 'standard';
  }
  if (kinds.includes('lint_or_format')) {
    actions.push('apply formatting-safe or lint-safe edits only');
    preferredEditMode = 'surgical';
  }
  if (kinds.includes('missing_script')) {
    actions.push('infer or synthesize a valid verify command from project scripts');
    verifyScope = 'standard';
  }
  const commandBias = Array.isArray(verifyCommands) && verifyCommands.some((cmd) => /coverage/.test(String(cmd))) ? 'coverage-aware' : 'fast-feedback';
  const candidateFiles = Array.isArray(changeSurface?.candidate_edit_files) ? changeSurface.candidate_edit_files.slice(0, 8).map((item) => String(item.path || '')).filter(Boolean) : [];
  const patchGuard = {
    max_patch_files: preferredEditMode === 'surgical' ? 4 : (preferredEditMode === 'localized' ? 10 : 24),
    protected_files: Array.isArray(changeSurface?.high_risk_neighbors) && preferredEditMode === 'surgical' ? changeSurface.high_risk_neighbors.slice(0, 8) : [],
    preferred_files: candidateFiles,
  };
  return {
    failure_kinds: kinds,
    preferred_edit_mode: preferredEditMode,
    verify_scope: verifyScope,
    command_bias: commandBias,
    patch_guard: patchGuard,
    actions: actions.length ? actions : ['inspect the smallest failing surface before widening the patch'],
  };
}

module.exports = {
  buildRepairExecutionSummary,
  buildVarsFromMemory,
  classifyFailureKinds,
  deriveNameVars,
  flattenPathVars,
  normalizeRecoveryCommands,
  parseVerifyFailures,
  recommendRepairRecipe,
  renderString,
  rerenderModule,
  runShellCommand,
  runVerifyCommands,
  applyPlannedUpdates,
  slugify,
  toCamelCase,
  toPascalCase,
};
