const fs = require('fs');
const path = require('path');

/** @param {string} dirPath */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/** @param {string} filePath */
function ensureDirForFile(filePath) {
  ensureDir(path.dirname(filePath));
}

module.exports = {
  ensureDir,
  ensureDirForFile,
};
