#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DEFAULT_ALLOWED_EXECUTABLES = [
  'node',
  'node.exe',
  'npm',
  'npm.cmd',
  'npx',
  'npx.cmd',
  'pnpm',
  'pnpm.cmd',
  'yarn',
  'yarn.cmd',
  'git',
  'git.exe',
  'python',
  'python.exe',
  'python3',
];

const SHELL_EXECUTABLES = new Set([
  'pwsh', 'pwsh.exe', 'powershell', 'powershell.exe', 'cmd', 'cmd.exe', 'bash', 'sh'
]);

/** @type {Record<string, string[]>} */
const DEFAULT_BLOCKED_ARG_PATTERNS = {
  pwsh: ['^-c$', '^-command$', '^-enc$', '^-encodedcommand$'],
  'pwsh.exe': ['^-c$', '^-command$', '^-enc$', '^-encodedcommand$'],
  powershell: ['^-c$', '^-command$', '^-enc$', '^-encodedcommand$'],
  'powershell.exe': ['^-c$', '^-command$', '^-enc$', '^-encodedcommand$'],
  cmd: ['^/c$'],
  'cmd.exe': ['^/c$'],
  bash: ['^-c$'],
  sh: ['^-c$'],
};

const DEFAULT_LIMITS = {
  max_tasks: 48,
  max_concurrency: 6,
  max_timeout_sec: 1800,
  max_retries: 2,
  max_command_length: 240,
  max_task_id_length: 48,
};

const SAFE_TASK_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,47}$/;

/** @typedef {{
 * allowed_executables: string[],
 * allow_shell_executables: boolean,
 * blocked_arg_patterns: Record<string, string[]>,
 * max_tasks: number,
 * max_concurrency: number,
 * max_timeout_sec: number,
 * max_retries: number,
 * max_command_length: number,
 * max_task_id_length: number,
 * }} CommandPolicy */

/** @returns {CommandPolicy} */
function defaults() {
  return {
    allowed_executables: DEFAULT_ALLOWED_EXECUTABLES.slice(),
    allow_shell_executables: false,
    blocked_arg_patterns: { ...DEFAULT_BLOCKED_ARG_PATTERNS },
    ...DEFAULT_LIMITS,
  };
}

/** @param {string} filePath @returns {unknown | null} */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {unknown} value @param {number} fallback */
function normalizePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  return v > 0 ? v : fallback;
}

/** @param {CommandPolicy} base @param {unknown} override @returns {CommandPolicy} */
function mergePolicy(base, override) {
  const out = { ...base };
  if (!override || typeof override !== 'object') return out;

  const typedOverride = /** @type {Record<string, unknown>} */ (override);

  if (Array.isArray(typedOverride.allowed_executables)) {
    const normalized = typedOverride.allowed_executables
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean);
    if (normalized.length > 0) out.allowed_executables = normalized;
  }
  if (typedOverride.allow_shell_executables !== undefined) {
    out.allow_shell_executables = Boolean(typedOverride.allow_shell_executables);
  }

  if (typedOverride.blocked_arg_patterns && typeof typedOverride.blocked_arg_patterns === 'object') {
    /** @type {Record<string, string[]>} */
    const normalized = {};
    for (const [execName, patterns] of Object.entries(/** @type {Record<string, unknown>} */ (typedOverride.blocked_arg_patterns))) {
      if (!Array.isArray(patterns)) continue;
      normalized[String(execName).toLowerCase()] = patterns.map((p) => String(p)).filter(Boolean);
    }
    if (Object.keys(normalized).length > 0) {
      out.blocked_arg_patterns = normalized;
    }
  }

  out.max_tasks = normalizePositiveInt(typedOverride.max_tasks, out.max_tasks);
  out.max_concurrency = normalizePositiveInt(typedOverride.max_concurrency, out.max_concurrency);
  out.max_timeout_sec = normalizePositiveInt(typedOverride.max_timeout_sec, out.max_timeout_sec);
  out.max_retries = normalizePositiveInt(typedOverride.max_retries, out.max_retries);
  out.max_command_length = normalizePositiveInt(typedOverride.max_command_length, out.max_command_length);
  out.max_task_id_length = normalizePositiveInt(typedOverride.max_task_id_length, out.max_task_id_length);
  return out;
}

/** @param {{ rootDir?: string, runDir?: string }} [options] @returns {CommandPolicy} */
function loadCommandPolicy({ rootDir = process.cwd(), runDir } = {}) {
  let policy = defaults();
  const candidates = [
    path.join(rootDir, '.opencode', 'command-policy.json'),
    runDir ? path.join(runDir, 'command-policy.json') : null,
  ].filter((candidate) => typeof candidate === 'string');

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const parsed = readJson(filePath);
    policy = mergePolicy(policy, parsed);
  }
  return policy;
}

/** @param {unknown} command */
function hasUnsafeShellOperators(command) {
  return /[\r\n\0]|(\|\||&&|[|;<>`])/.test(String(command || ''));
}

/** @param {unknown} command @returns {{ file: string, args: string[] }} */
function splitCommand(command) {
  const input = String(command || '').trim();
  const tokens = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|[^\s"']+/g;
  let m;
  while ((m = re.exec(input)) !== null) {
    if (m[1] !== undefined) tokens.push(m[1].replace(/\\"/g, '"'));
    else if (m[2] !== undefined) tokens.push(m[2].replace(/\\'/g, "'"));
    else tokens.push(m[0]);
  }
  if (tokens.length === 0) throw new Error('Empty command');
  return { file: tokens[0] || '', args: tokens.slice(1) };
}

/** @param {string[] | undefined} patterns @returns {RegExp[]} */
function compilePatterns(patterns) {
  const out = [];
  for (const p of patterns || []) {
    try {
      out.push(new RegExp(String(p), 'i'));
    } catch {
      // ignore malformed regex
    }
  }
  return out;
}

/** @param {unknown} file @param {unknown} policy */
function isExecutableAllowed(file, policy) {
  const typedPolicy = /** @type {CommandPolicy | null | undefined} */ (policy);
  const raw = String(file || '').trim();
  if (!raw) return false;
  if (/[/\\]/.test(raw)) return false;
  const base = path.basename(raw).toLowerCase();
  const allowed = new Set((typedPolicy && typedPolicy.allowed_executables) || DEFAULT_ALLOWED_EXECUTABLES);
  return allowed.has(base) || allowed.has(raw.toLowerCase());
}

/** @param {unknown} file @param {unknown[]} args @param {unknown} policy */
function areArgsAllowed(file, args, policy) {
  const typedPolicy = /** @type {CommandPolicy | null | undefined} */ (policy);
  const base = path.basename(String(file || '')).toLowerCase();
  if (SHELL_EXECUTABLES.has(base) && !Boolean(typedPolicy && typedPolicy.allow_shell_executables)) {
    return { ok: false, reason: `shell executable disabled by policy: ${base}` };
  }
  const map = (typedPolicy && typedPolicy.blocked_arg_patterns) || DEFAULT_BLOCKED_ARG_PATTERNS;
  const patterns = compilePatterns(map[base] || []);
  for (const arg of args || []) {
    const token = String(arg || '');
    if (/[\r\n\0]/.test(token)) return { ok: false, reason: `unsafe control characters for ${base}` };
    for (const re of patterns) {
      if (re.test(token)) {
        return { ok: false, reason: `blocked argument for ${base}: ${token}` };
      }
    }
  }
  return { ok: true, reason: '' };
}

/** @param {unknown} taskId @param {unknown} policy */
function assertSafeTaskId(taskId, policy) {
  const typedPolicy = /** @type {CommandPolicy | null | undefined} */ (policy);
  const value = String(taskId || '').trim();
  if (!value) throw new Error('Task missing id/task_id');
  const maxLen = Number(typedPolicy?.max_task_id_length || DEFAULT_LIMITS.max_task_id_length);
  if (value.length > maxLen) throw new Error(`Task id too long: ${value}`);
  if (!SAFE_TASK_ID_RE.test(value)) {
    throw new Error(`Task id contains unsafe characters: ${value}`);
  }
  return value;
}

/** @param {unknown} command @param {string} field @param {string} taskId @param {unknown} policy */
function validateRunnableCommand(command, field, taskId, policy) {
  const typedPolicy = /** @type {CommandPolicy | null | undefined} */ (policy);
  const value = String(command || '').trim();
  if (!value) throw new Error(`Task \"${taskId}\" missing ${field}`);
  if (value.length > Number(typedPolicy?.max_command_length || DEFAULT_LIMITS.max_command_length)) {
    throw new Error(`Task \"${taskId}\" ${field} too long`);
  }
  if (hasUnsafeShellOperators(value)) {
    throw new Error(`Task \"${taskId}\" ${field} contains blocked shell operators.`);
  }
  const parsed = splitCommand(value);
  if (!isExecutableAllowed(parsed.file, policy)) {
    throw new Error(`Task \"${taskId}\" ${field} executable not allowed: ${parsed.file}`);
  }
  const argCheck = areArgsAllowed(parsed.file, parsed.args, policy);
  if (!argCheck.ok) {
    throw new Error(`Task \"${taskId}\" ${field} ${argCheck.reason}`);
  }
  return value;
}

/** @param {unknown} workdir @param {string} rootDir @param {string} taskId */
function normalizeWorkdir(workdir, rootDir, taskId) {
  const resolvedRoot = path.resolve(String(rootDir || process.cwd()));
  const candidate = path.resolve(String(workdir || resolvedRoot));
  const rel = path.relative(resolvedRoot, candidate);
  if (!(rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)))) {
    throw new Error(`Task \"${taskId}\" workdir escapes project root: ${workdir}`);
  }
  return candidate;
}

/** @param {unknown} timeoutSec @param {unknown} policy @param {string} taskId */
function normalizeTimeout(timeoutSec, policy, taskId) {
  const typedPolicy = /** @type {CommandPolicy | null | undefined} */ (policy);
  const n = Number(timeoutSec);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Task \"${taskId}\" timeout must be > 0`);
  const max = Number(typedPolicy?.max_timeout_sec || DEFAULT_LIMITS.max_timeout_sec);
  if (n > max) throw new Error(`Task \"${taskId}\" timeout exceeds max_timeout_sec=${max}`);
  return Math.floor(n);
}

/** @param {unknown} retries @param {unknown} policy @param {string} taskId */
function normalizeRetries(retries, policy, taskId) {
  const typedPolicy = /** @type {CommandPolicy | null | undefined} */ (policy);
  const n = Number(retries);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Task \"${taskId}\" retries must be >= 0`);
  const max = Number(typedPolicy?.max_retries || DEFAULT_LIMITS.max_retries);
  if (n > max) throw new Error(`Task \"${taskId}\" retries exceeds max_retries=${max}`);
  return Math.floor(n);
}

/** @param {number} taskCount @param {number} concurrency @param {unknown} policy */
function validateSchedulerLimits(taskCount, concurrency, policy) {
  const typedPolicy = /** @type {CommandPolicy | null | undefined} */ (policy);
  const maxTasks = Number(typedPolicy?.max_tasks || DEFAULT_LIMITS.max_tasks);
  const maxConcurrency = Number(typedPolicy?.max_concurrency || DEFAULT_LIMITS.max_concurrency);
  const c = Number(concurrency);
  if (!Number.isFinite(c) || c <= 0) throw new Error('concurrency must be > 0');
  if (taskCount > maxTasks) throw new Error(`task count exceeds max_tasks=${maxTasks}`);
  if (c > maxConcurrency) throw new Error(`concurrency exceeds max_concurrency=${maxConcurrency}`);
  return { taskCount, concurrency: Math.floor(c) };
}

module.exports = {
  DEFAULT_ALLOWED_EXECUTABLES,
  DEFAULT_BLOCKED_ARG_PATTERNS,
  DEFAULT_LIMITS,
  SHELL_EXECUTABLES,
  SAFE_TASK_ID_RE,
  loadCommandPolicy,
  hasUnsafeShellOperators,
  splitCommand,
  isExecutableAllowed,
  areArgsAllowed,
  assertSafeTaskId,
  validateRunnableCommand,
  normalizeWorkdir,
  normalizeTimeout,
  normalizeRetries,
  validateSchedulerLimits,
};
