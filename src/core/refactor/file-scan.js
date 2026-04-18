const fs = require('fs');
const path = require('path');

/** @type {ReadonlySet<string>} */
const DEFAULT_SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.opencode']);

/**
 * @param {string} root
 * @param {ReadonlySet<string> | null | undefined} extensions
 * @param {ReadonlySet<string>} [skipDirs]
 * @param {string[]} [acc]
 * @returns {string[]}
 */
function collectFiles(root, extensions, skipDirs = DEFAULT_SKIP_DIRS, acc = []) {
  const normalizedRoot = path.resolve(root || '.');
  const entries = fs.readdirSync(normalizedRoot, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(normalizedRoot, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      collectFiles(fullPath, extensions, skipDirs, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!extensions || extensions.size === 0 || extensions.has(path.extname(entry.name).toLowerCase())) {
      acc.push(fullPath);
    }
  }
  return acc;
}

module.exports = {
  DEFAULT_SKIP_DIRS,
  collectFiles,
};
