const fs = require('fs');
const path = require('path');
const { buildCheckCounts } = require('../../shared/contracts.js');

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage']);
const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.go', '.java', '.kt', '.rb', '.php', '.rs', '.swift']);

/** @typedef {{ status: string, check: string, detail: string }} QualityResult */

/** @param {string} root @param {string} relPath */
function exists(root, relPath) {
  return fs.existsSync(path.join(root, relPath));
}

/** @param {string} root */
function isPluginWorkspace(root) {
  return exists(root, 'commands') &&
    exists(root, 'skills') &&
    exists(root, 'prompts') &&
    exists(root, 'AGENTS.md') &&
    exists(root, '.opencode/command-policy.json');
}

/** @param {QualityResult[]} bucket @param {string} status @param {string} check @param {string} detail */
function addResult(bucket, status, check, detail) {
  bucket.push({ status, check, detail });
}

/** @param {string} content @returns {Record<string, string>} */
function parseFrontmatter(content) {
  const normalized = String(content || '').replace(/^\uFEFF/, '');
  const m = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
  if (!m) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of String(m[1] || '').split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_.-]+)\s*:\s*(.+)\s*$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2] || '';
    if (!key) continue;
    out[key] = value.replace(/^["']|["']$/g, '');
  }
  return out;
}

/** @param {QualityResult[]} results */
function summarizeCounts(results) {
  return buildCheckCounts(results);
}

module.exports = {
  IGNORED_DIRS,
  CODE_EXT,
  exists,
  isPluginWorkspace,
  addResult,
  parseFrontmatter,
  summarizeCounts,
};
