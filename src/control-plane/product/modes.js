const fs = require('fs');
const path = require('path');
const MODE_FILE = path.join('.opencode', 'product-mode.json');

/** @typedef {'solo' | 'team' | 'platform'} ModeId */
/** @typedef {{ quality_mode: string, release_policy: string, review_with_quality_gate: boolean, review_json: boolean }} ModeDefaults */
/** @typedef {{ id: ModeId, label: string, description: string, defaults: ModeDefaults }} ProductMode */
/** @typedef {{ schema_version?: string, mode?: ModeId | string, updated_at?: string, source?: string }} ModeRecord */
/** @typedef {{ source?: string }} SetModeOptions */

/** @type {Record<ModeId, ProductMode>} */
const MODES = {
  solo: { id: 'solo', label: 'Solo', description: 'Fast default path for a single developer. Minimal ceremony and the shortest implement/test/review loop.', defaults: { quality_mode: 'fast', release_policy: 'standard', review_with_quality_gate: false, review_json: false } },
  team: { id: 'team', label: 'Team', description: 'Shared-team workflow with stronger review and release checks enabled by default.', defaults: { quality_mode: 'full', release_policy: 'production', review_with_quality_gate: true, review_json: true } },
  platform: { id: 'platform', label: 'Platform', description: 'Full platform posture for release governance, deeper diagnostics, and advanced automation hooks.', defaults: { quality_mode: 'full', release_policy: 'production', review_with_quality_gate: true, review_json: true } },
};

/** @param {unknown} input @param {ModeId} [fallback] @returns {ModeId} */
function normalizeMode(input, fallback = 'solo') {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return fallback;
  if (Object.prototype.hasOwnProperty.call(MODES, value)) return /** @type {ModeId} */ (value);
  throw new Error(`Unknown mode: ${input}. Expected one of ${Object.keys(MODES).join(', ')}`);
}

/** @param {string} [rootDir] */
function resolveRoot(rootDir = process.cwd()) { return path.resolve(rootDir); }
/** @param {string} [rootDir] */
function resolveModeFile(rootDir = process.cwd()) { return path.join(resolveRoot(rootDir), MODE_FILE); }
/** @param {string} [rootDir] */
function ensureModeDir(rootDir = process.cwd()) { fs.mkdirSync(path.dirname(resolveModeFile(rootDir)), { recursive: true }); }

/** @param {string} [rootDir] @returns {ModeRecord | null} */
function readModeRecord(rootDir = process.cwd()) {
  const filePath = resolveModeFile(rootDir);
  if (!fs.existsSync(filePath)) return null;
  return /** @type {ModeRecord} */ (JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

/** @param {string} [rootDir] @param {ModeId | string | null} [overrideMode] */
function getMode(rootDir = process.cwd(), overrideMode = null) {
  const existing = readModeRecord(rootDir);
  const requested = overrideMode || (existing || {}).mode || 'solo';
  const id = normalizeMode(requested, 'solo');
  return { ...MODES[id], persisted: Boolean(!overrideMode && existing), file_path: resolveModeFile(rootDir) };
}

/** @param {string} rootDir @param {ModeId | string} mode @param {SetModeOptions} [options] */
function setMode(rootDir = process.cwd(), mode, options = {}) {
  const id = normalizeMode(mode);
  ensureModeDir(rootDir);
  const payload = { schema_version: '1.0', mode: id, updated_at: new Date().toISOString(), source: String(options.source || 'user') };
  fs.writeFileSync(resolveModeFile(rootDir), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return getMode(rootDir);
}

/** @returns {ProductMode[]} */
function listModes() {
  return /** @type {ProductMode[]} */ (Object.values(MODES).map((mode) => ({ id: mode.id, label: mode.label, description: mode.description, defaults: { ...mode.defaults } })));
}

module.exports = { MODES, MODE_FILE, getMode, listModes, normalizeMode, readModeRecord, resolveModeFile, setMode };
