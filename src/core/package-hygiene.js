const fs = require('fs');
const path = require('path');

const DEFAULT_RUNTIME_PATHS = [
  '.opencode/',
  '.opencode/coder-loop/',
  '.opencode/implementation/',
  '.opencode/implementation-plans/',
  '.opencode/observability/',
  '.opencode/orchestrator/',
  '.opencode/reviews/',
  '.opencode/delivery/',
  '.opencode/eoc-run/',
  '.opencode/task-bundles/',
];

const DEFAULT_REQUIRED_STATIC = [
  '.opencode/instructions/',
  '.opencode/plugins/',
  '.opencode/hooks-config.json',
  '.opencode/command-policy.json',
];
const DEFAULT_FORBIDDEN_SOURCE_SUFFIXES = ['.bak', '.probe'];

/** @typedef {{ files?: unknown[] }} PackageJsonShape */
/** @typedef {{ runtimePaths?: string[], requiredStatic?: string[], forbiddenSourceSuffixes?: string[] }} PackageHygieneOptions */
/** @typedef {{ ok: boolean, files: string[], errors: string[], warnings: string[] }} PackageHygieneResult */

/** @param {string} [root] @returns {PackageJsonShape} */
function readPackageJson(root = process.cwd()) {
  return /** @type {PackageJsonShape} */ (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')));
}

/** @param {PackageJsonShape} pkg @returns {string[]} */
function normalizeFiles(pkg) {
  const files = Array.isArray(pkg.files) ? pkg.files : [];
  return files.map((entry) => String(entry).replace(/\\/g, '/').trim()).filter(Boolean);
}

/** @param {string} root @param {string[]} suffixes @returns {string[]} */
function scanSourceForForbiddenSuffixes(root, suffixes) {
  const srcRoot = path.join(root, 'src');
  if (!fs.existsSync(srcRoot)) return [];
  const out = [];
  const queue = [srcRoot];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
        continue;
      }
      const normalized = full.replace(/\\/g, '/');
      if (suffixes.some((suffix) => normalized.endsWith(suffix))) {
        out.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    }
  }
  return out.sort();
}

/** @param {string} [root] @param {PackageHygieneOptions} [options] @returns {PackageHygieneResult} */
function checkPackageHygiene(root = process.cwd(), options = {}) {
  const runtimePaths = options.runtimePaths || DEFAULT_RUNTIME_PATHS;
  const requiredStatic = options.requiredStatic || DEFAULT_REQUIRED_STATIC;
  const forbiddenSourceSuffixes = options.forbiddenSourceSuffixes || DEFAULT_FORBIDDEN_SOURCE_SUFFIXES;
  const pkg = readPackageJson(root);
  const files = normalizeFiles(pkg);
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  for (const forbidden of runtimePaths) {
    if (files.includes(forbidden)) errors.push(`publish whitelist contains runtime path: ${forbidden}`);
  }
  for (const required of requiredStatic) {
    if (!files.includes(required)) errors.push(`publish whitelist is missing required static asset: ${required}`);
  }
  const forbiddenSourceFiles = scanSourceForForbiddenSuffixes(root, forbiddenSourceSuffixes);
  for (const file of forbiddenSourceFiles) {
    errors.push(`source tree contains forbidden file suffix: ${file}`);
  }
  if (!files.includes('.gitignore')) warnings.push('publish whitelist does not include .gitignore');

  return {
    ok: errors.length === 0,
    files,
    errors,
    warnings,
  };
}

module.exports = {
  DEFAULT_REQUIRED_STATIC,
  DEFAULT_RUNTIME_PATHS,
  DEFAULT_FORBIDDEN_SOURCE_SUFFIXES,
  checkPackageHygiene,
  normalizeFiles,
  readPackageJson,
};
