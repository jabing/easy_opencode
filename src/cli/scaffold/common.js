const fs = require('fs');
const path = require('path');

/** @param {unknown} value @returns {string} */
function toKebabCase(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** @param {unknown} value @returns {string} */
function toCamelCase(value) {
  return toKebabCase(value).replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

/** @param {string} dirPath */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/** @param {string} rootDir @param {string} relativePath @param {string} body @returns {string} */
function writeFile(rootDir, relativePath, body) {
  const filePath = path.join(rootDir, relativePath);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, body, 'utf8');
  return filePath;
}

module.exports = { ensureDir, toCamelCase, toKebabCase, writeFile };
