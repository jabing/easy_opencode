const fs = require('fs');
const path = require('path');

/** @typedef {'off' | 'warn' | 'error'} LintRuleLevel */
/** @typedef {{ include: string[], extensions: string[], ignoreDirs: string[], maxWarnings: number, rules: Record<string, LintRuleLevel> }} LintConfig */

/** @type {LintConfig} */
const DEFAULT_CONFIG = Object.freeze({
  include: ['src/**/*.js', 'scripts/**/*.js', 'tests/**/*.js'],
  extensions: ['.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'],
  ignoreDirs: ['.git', 'node_modules', 'dist', 'build', 'coverage', '.opencode'],
  maxWarnings: 0,
  rules: /** @type {Record<string, LintRuleLevel>} */ ({
    'no-debugger': 'error',
    'no-var': 'error',
    'no-trailing-whitespace': 'warn',
    'eol-last': 'warn',
  }),
});

/** @param {string} root */
function configPath(root = process.cwd()) {
  return path.join(root, 'opencode-lint.json');
}

/** @param {unknown} value @returns {string[]} */
function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

/** @param {unknown} value @returns {Record<string, LintRuleLevel>} */
function normalizeRules(value) {
  const source = value && typeof value === 'object' ? value : {};
  /** @type {Record<string, LintRuleLevel>} */
  const output = {};
  for (const [name, level] of Object.entries(source)) {
    const normalized = String(level || '').trim().toLowerCase();
    if (normalized === 'off' || normalized === 'warn' || normalized === 'error') {
      output[name] = normalized;
    }
  }
  return output;
}

/** @param {string} [root] @returns {LintConfig} */
function loadLintConfig(root = process.cwd()) {
  const file = configPath(root);
  if (!fs.existsSync(file)) return { ...DEFAULT_CONFIG, rules: { ...DEFAULT_CONFIG.rules } };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    include: normalizeStringArray(raw.include).length > 0 ? normalizeStringArray(raw.include) : DEFAULT_CONFIG.include.slice(),
    extensions: normalizeStringArray(raw.extensions).length > 0 ? normalizeStringArray(raw.extensions) : DEFAULT_CONFIG.extensions.slice(),
    ignoreDirs: normalizeStringArray(raw.ignoreDirs).length > 0 ? normalizeStringArray(raw.ignoreDirs) : DEFAULT_CONFIG.ignoreDirs.slice(),
    maxWarnings: Number.isFinite(Number(raw.maxWarnings)) ? Math.max(0, Number(raw.maxWarnings)) : DEFAULT_CONFIG.maxWarnings,
    rules: { ...DEFAULT_CONFIG.rules, ...normalizeRules(raw.rules) },
  };
}

module.exports = {
  DEFAULT_CONFIG,
  configPath,
  loadLintConfig,
  normalizeRules,
  normalizeStringArray,
};
