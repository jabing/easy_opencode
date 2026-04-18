const fs = require('fs');
const path = require('path');

/** @param {string} rootDir @param {string} relPath */
function exists(rootDir, relPath) {
  return fs.existsSync(path.join(path.resolve(rootDir), relPath));
}

/** @param {string} [rootDir] */
function detectMcp(rootDir = process.cwd()) {
  const signals = [];

  if (exists(rootDir, '.opencode/mcp.json')) signals.push('opencode-mcp-config');
  if (exists(rootDir, 'mcp.json')) signals.push('mcp-json');
  if (exists(rootDir, '.mcp.json')) signals.push('dot-mcp-json');
  if (exists(rootDir, '.cursor/mcp.json')) signals.push('cursor-mcp-config');

  return {
    available: signals.length > 0,
    signals,
  };
}

module.exports = {
  detectMcp,
};
