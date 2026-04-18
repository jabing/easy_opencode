const fs = require('fs');
const path = require('path');

/**
 * @typedef {{
 *   ignoredDirs?: Set<string>,
 *   allowedExtensions?: Set<string> | null,
 *   shouldDescendDirectory?: (relPath: string, options?: WalkOptions) => boolean,
 * }} WalkOptions
 */

/**
 * @param {string} relPath
 * @param {WalkOptions} [options]
 */
function defaultShouldDescendDirectory(relPath, options = {}) {
  const ignoredDirs = options.ignoredDirs || new Set();
  if (!relPath) return true;
  const normalized = relPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return true;
  if (parts[0] === '.opencode') {
    return parts.length === 1 || normalized === '.opencode/plugins';
  }
  return !parts.some((part) => ignoredDirs.has(part));
}

/**
 * @param {string} rootDir
 * @param {(fullPath: string, nextRel: string, entry: any, options?: WalkOptions) => void} visitor
 * @param {WalkOptions} [options]
 * @param {string} [relPath]
 */
function walkFiles(rootDir, visitor, options = {}, relPath = '') {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    const nextRel = relPath ? path.join(relPath, entry.name) : entry.name;
    if (entry.isDirectory()) {
/** @type {(relPath: string, options?: WalkOptions) => boolean} */
      const shouldDescend = options.shouldDescendDirectory || defaultShouldDescendDirectory;
      if (!shouldDescend(nextRel, options)) continue;
      walkFiles(fullPath, visitor, options, nextRel);
      continue;
    }
    if (entry.isFile()) visitor(fullPath, nextRel, entry, options);
  }
}

/**
 * @param {string} rootDir
 * @param {WalkOptions} [options]
 * @returns {string[]}
 */
function collectFiles(rootDir, options = {}) {
  /** @type {string[]} */
  const files = [];
  const allowedExtensions = options.allowedExtensions || null;
  walkFiles(rootDir, (fullPath) => {
    if (!allowedExtensions) {
      files.push(fullPath);
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    if (allowedExtensions.has(ext)) files.push(fullPath);
  }, options);
  return files;
}

module.exports = {
  collectFiles,
  defaultShouldDescendDirectory,
  walkFiles,
};
