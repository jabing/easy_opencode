const fs = require('fs');
const { ensureDirForFile } = require('./fs.js');

/** @param {string} filePath */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** @param {string} filePath */
function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return readJson(filePath);
  } catch {
    return null;
  }
}

/** @param {string} filePath @param {unknown} data */
function writeJson(filePath, data) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}
`, 'utf8');
}

module.exports = {
  readJson,
  tryReadJson,
  writeJson,
};
