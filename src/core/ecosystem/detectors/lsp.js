const fs = require('fs');
const path = require('path');

/** @param {string} rootDir @param {string} relPath */
function exists(rootDir, relPath) {
  return fs.existsSync(path.join(path.resolve(rootDir), relPath));
}

/** @param {string} [rootDir] */
function detectLsp(rootDir = process.cwd()) {
  const signals = [];

  if (exists(rootDir, '.opencode/lsp.json')) signals.push('opencode-lsp-config');
  if (exists(rootDir, 'tsconfig.json')) signals.push('tsconfig');
  if (exists(rootDir, 'jsconfig.json')) signals.push('jsconfig');
  if (exists(rootDir, 'pyrightconfig.json')) signals.push('pyrightconfig');
  if (exists(rootDir, '.clangd')) signals.push('clangd');

  return {
    available: signals.length > 0,
    signals,
  };
}

module.exports = {
  detectLsp,
};
