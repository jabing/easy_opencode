const fs = require('fs');
const path = require('path');

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs', '.py', '.go', '.java']);
const TEST_RE = /(?:^|\.)(test|spec)\.[A-Za-z0-9]+$/i;
const PYTHON_TEST_RE = /(?:^|\/)(?:test_[^/]+|[^/]+_test)\.py$/i;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', '.venv', 'venv', 'target', 'bin', 'out']);

/** @param {string} filePath */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {string} root @param {(relPath: string) => void} visitor @param {string} [rel] */
function walk(root, visitor, rel = '') {
  const dir = path.join(root, rel);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const nextRel = rel ? path.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(root, visitor, nextRel);
      continue;
    }
    if (entry.isFile()) visitor(nextRel);
  }
}

/** @param {string} root */
function listCodeFiles(root) {
  /** @type {string[]} */
  const files = [];
  walk(root, (rel) => {
    if (CODE_EXT.has(path.extname(rel).toLowerCase())) files.push(rel.replace(/\\/g, '/'));
  });
  return files;
}

/** @param {string} rel */
function isTestFile(rel) {
  const normalized = rel.replace(/\\/g, '/');
  const base = path.basename(normalized);
  return (
    TEST_RE.test(base) ||
    PYTHON_TEST_RE.test(normalized) ||
    normalized.includes('/__tests__/') ||
    normalized.startsWith('test/') ||
    normalized.startsWith('tests/') ||
    normalized.endsWith('_test.go') ||
    normalized.startsWith('src/test/') ||
    normalized.includes('/src/test/') ||
    normalized.startsWith('spec/')
  );
}

/** @template T @param {T[]} values @returns {T[]} */
function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

/** @param {string | string[] | undefined | null} raw @returns {string[]} */
function splitCsv(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap((item) => splitCsv(item));
  return String(raw)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** @param {string} root @param {string} candidate */
function normalizeTarget(root, candidate) {
  const raw = String(candidate || '').trim();
  if (!raw) return '';
  const abs = path.resolve(root, raw);
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  return rel || '.';
}

/** @param {string} root @param {string[]} targetFiles @param {number} [maxCount] */
function findRelatedTests(root, targetFiles, maxCount = 12) {
  const codeFiles = listCodeFiles(root);
  const tests = codeFiles.filter(isTestFile);
  const targetSet = unique(targetFiles.map((file) => normalizeTarget(root, file)));
  /** @type {{ file: string, score: number }[]} */
  const scored = [];

  for (const testFile of tests) {
    const testBase = path.basename(testFile)
      .replace(/\.(test|spec)\.[A-Za-z0-9]+$/i, '')
      .replace(/_test\.go$/i, '')
      .replace(/Test\.java$/i, '')
      .replace(/\.[A-Za-z0-9]+$/, '');
    let score = 0;
    for (const target of targetSet) {
      const targetBase = path.basename(target).replace(/\.[A-Za-z0-9]+$/, '');
      if (testBase === targetBase) score += 8;
      if (testFile.includes(targetBase)) score += 4;
      if (path.dirname(testFile) === path.dirname(target)) score += 2;
    }
    if (score > 0) scored.push({ file: testFile, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, maxCount)
    .map((item) => item.file);
}

module.exports = {
  CODE_EXT,
  TEST_RE,
  PYTHON_TEST_RE,
  SKIP_DIRS,
  findRelatedTests,
  isTestFile,
  listCodeFiles,
  normalizeTarget,
  readJsonSafe,
  splitCsv,
  unique,
  walk,
};
