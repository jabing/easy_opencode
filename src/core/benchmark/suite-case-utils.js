const fs = require('fs');
const path = require('path');
const os = require('os');

/** @param {string} filePath */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** @param {string} filePath @param {unknown} data */
function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** @param {unknown} value */
function sanitizeCaseId(value) {
  return String(value || 'case').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'case';
}

/** @param {string} caseRoot @param {string} _controlRoot @param {string} runId @param {string} caseId @param {unknown} mode */
function prepareWorkspace(caseRoot, _controlRoot, runId, caseId, mode) {
  const workspaceMode = String(mode || 'copy').toLowerCase();
  if (workspaceMode === 'reuse') {
    return { workspace_root: caseRoot, workspace_mode: 'reuse' };
  }
  const workspaceRoot = path.join(os.tmpdir(), 'easy-opencode-benchmarks', runId, sanitizeCaseId(caseId));
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(workspaceRoot), { recursive: true });
  fs.cpSync(caseRoot, workspaceRoot, {
    recursive: true,
    filter: (/** @type {string} */ src) => {
      const rel = path.relative(caseRoot, src);
      if (!rel) return true;
      const normalized = rel.replace(/\\/g, '/');
      if (normalized === '.opencode' || normalized.startsWith('.opencode/')) return false;
      return true;
    },
  });
  return { workspace_root: workspaceRoot, workspace_mode: 'copy' };
}

/** @param {{ id?: string, root?: string }} caseDef @param {string} suitePath */
function resolveCaseRoot(caseDef, suitePath) {
  if (!caseDef.root) throw new Error(`case ${caseDef.id || '(unnamed)'} missing root`);
  if (path.isAbsolute(caseDef.root)) return caseDef.root;
  return path.resolve(path.dirname(suitePath), caseDef.root);
}

/** @param {unknown} value */
function asVarPairs(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return Object.entries(value).map(([key, item]) => `${key}=${item}`);
}

/** @param {unknown} value */
function toList(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

module.exports = {
  readJson,
  writeJson,
  sanitizeCaseId,
  prepareWorkspace,
  resolveCaseRoot,
  asVarPairs,
  toList,
};
