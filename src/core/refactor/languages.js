const path = require('path');

/** @type {ReadonlySet<string>} */
const TYPESCRIPT_FAMILY_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
/** @type {ReadonlySet<string>} */
const PYTHON_EXTENSIONS = new Set(['.py']);
/** @type {ReadonlySet<string>} */
const GO_EXTENSIONS = new Set(['.go']);
/** @type {ReadonlySet<string>} */
const JAVA_EXTENSIONS = new Set(['.java']);
/** @type {ReadonlySet<string>} */
const TEXT_FALLBACK_EXTENSIONS = new Set([...TYPESCRIPT_FAMILY_EXTENSIONS, ...PYTHON_EXTENSIONS, ...GO_EXTENSIONS, ...JAVA_EXTENSIONS]);

/** @param {string | null | undefined} filePath */
function detectLanguageFromFile(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (['.ts', '.tsx', '.mts', '.cts'].includes(ext)) return 'typescript';
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return 'javascript';
  if (ext === '.py') return 'python';
  if (ext === '.go') return 'go';
  if (ext === '.java') return 'java';
  return 'unknown';
}

/** @param {string | null | undefined} filePath */
function isTypescriptFamilyFile(filePath) {
  return TYPESCRIPT_FAMILY_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

/** @param {string | null | undefined} filePath */
function isPythonFile(filePath) {
  return PYTHON_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

/** @param {string | null | undefined} filePath */
function isGoFile(filePath) {
  return GO_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

/** @param {string | null | undefined} filePath */
function isJavaFile(filePath) {
  return JAVA_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

module.exports = {
  GO_EXTENSIONS,
  JAVA_EXTENSIONS,
  PYTHON_EXTENSIONS,
  TEXT_FALLBACK_EXTENSIONS,
  TYPESCRIPT_FAMILY_EXTENSIONS,
  detectLanguageFromFile,
  isGoFile,
  isJavaFile,
  isPythonFile,
  isTypescriptFamilyFile,
};
