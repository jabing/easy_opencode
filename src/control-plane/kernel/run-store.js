const fs = require('fs');
const path = require('path');
const { assertRunTransition, RUN_STATUS } = require('./state-machine.js');
const { nowIso } = require('../../shared/time.js');
const { tryReadJson, writeJson } = require('../../shared/json.js');

/**
 * @typedef {{
 *   schema_version: string,
 *   run_id: string,
 *   workflow: string,
 *   flow: string,
 *   objective: string | null,
 *   status: string,
 *   source_kind: string,
 *   source_id: string,
 *   root_dir: string,
 *   created_at: string,
 *   updated_at: string,
 *   context: Record<string, unknown>,
 *   pointers: Record<string, unknown>,
 *   steps: unknown[],
 *   artifacts: unknown[],
 *   policy_snapshot: Record<string, unknown>,
 *   recovery: Record<string, unknown>,
 *   summary: Record<string, unknown>,
 *   latest_event: unknown
 * }} RunRecord
 * @typedef {{
 *   run_id: string,
 *   workflow: string,
 *   flow?: string,
 *   objective?: string | null,
 *   status?: string,
 *   source_kind?: string,
 *   source_id?: string,
 *   root_dir?: string,
 *   created_at?: string,
 *   context?: Record<string, unknown>,
 *   pointers?: Record<string, unknown>,
 *   steps?: unknown[],
 *   artifacts?: unknown[],
 *   policy_snapshot?: Record<string, unknown>,
 *   recovery?: Record<string, unknown>,
 *   summary?: Record<string, unknown>,
 *   latest_event?: unknown
 * }} RunRecordInput
 * @typedef {{ run_id: string, workflow: string, flow: string, status: string, source_kind: string, source_id: string, updated_at: string }} ActiveRunIndex
 */

/** @param {string} rootDir */
function resolveKernelDir(rootDir) {
  return path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'kernel');
}

/** @param {string} rootDir */
function resolveRunsDir(rootDir) {
  return path.join(resolveKernelDir(rootDir), 'runs');
}

/** @param {string} rootDir @param {string} runId */
function resolveRunPath(rootDir, runId) {
  return path.join(resolveRunsDir(rootDir), `${runId}.json`);
}

/** @param {string} rootDir */
function resolveIndexPath(rootDir) {
  return path.join(resolveKernelDir(rootDir), 'active-run.json');
}

/** @param {RunRecordInput} input @returns {RunRecord} */
function createRunRecord(input) {
  const rootDir = path.resolve(input.root_dir || process.cwd());
  const now = nowIso();
  return {
    schema_version: '2.0',
    run_id: input.run_id,
    workflow: input.workflow,
    flow: input.flow || input.workflow,
    objective: input.objective || null,
    status: input.status || RUN_STATUS.CREATED,
    source_kind: input.source_kind || 'unknown',
    source_id: input.source_id || input.run_id,
    root_dir: rootDir,
    created_at: input.created_at || now,
    updated_at: now,
    context: input.context || {},
    pointers: input.pointers || {},
    steps: Array.isArray(input.steps) ? input.steps : [],
    artifacts: Array.isArray(input.artifacts) ? input.artifacts : [],
    policy_snapshot: input.policy_snapshot || {},
    recovery: input.recovery || {},
    summary: input.summary || {},
    latest_event: input.latest_event || null,
  };
}

/** @param {RunRecord} record @returns {RunRecord} */
function saveRunRecord(record) {
  const filePath = resolveRunPath(record.root_dir, record.run_id);
  const normalized = {
    ...record,
    root_dir: path.resolve(record.root_dir || process.cwd()),
    updated_at: nowIso(),
  };
  writeJson(filePath, normalized);
  /** @type {ActiveRunIndex} */
  const indexRecord = {
    run_id: normalized.run_id,
    workflow: normalized.workflow,
    flow: normalized.flow,
    status: normalized.status,
    source_kind: normalized.source_kind,
    source_id: normalized.source_id,
    updated_at: normalized.updated_at,
  };
  writeJson(resolveIndexPath(normalized.root_dir), indexRecord);
  return normalized;
}

/** @param {string} rootDir @param {string} runId @returns {RunRecord | null} */
function loadRunRecord(rootDir, runId) {
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  return /** @type {RunRecord | null} */ (tryReadJson(resolveRunPath(resolvedRoot, runId)));
}

/** @param {string} rootDir @returns {RunRecord | null} */
function loadActiveRunRecord(rootDir) {
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const active = /** @type {ActiveRunIndex | null} */ (tryReadJson(resolveIndexPath(resolvedRoot)));
  if (!active || !active.run_id) return null;
  return loadRunRecord(resolvedRoot, active.run_id);
}

/** @param {string} rootDir @param {string} runId @param {(current: RunRecord) => Partial<RunRecord> | RunRecord | null | undefined} updater */
function updateRunRecord(rootDir, runId, updater) {
  const current = loadRunRecord(rootDir, runId);
  if (!current) throw new Error(`kernel run not found: ${runId}`);
  const next = typeof updater === 'function' ? updater(current) || current : current;
  if (next.status && current.status && next.status !== current.status) {
    assertRunTransition(current.status, next.status);
  }
  return saveRunRecord({ ...current, ...next, run_id: current.run_id });
}

/** @param {string} rootDir */
function clearActiveRunRecord(rootDir) {
  const filePath = resolveIndexPath(rootDir);
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
}

/** @param {string} rootDir @returns {RunRecord[]} */
function listRunRecords(rootDir) {
  const dir = resolveRunsDir(rootDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(/** @param {string} name */ (name) => name.endsWith('.json'))
    .map(/** @param {string} name */ (name) => /** @type {RunRecord | null} */ (tryReadJson(path.join(dir, name))))
    .filter(/** @returns {record is RunRecord} */ (record) => Boolean(record))
    .sort(/** @param {RunRecord} a @param {RunRecord} b */ (a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

module.exports = {
  createRunRecord,
  saveRunRecord,
  loadRunRecord,
  loadActiveRunRecord,
  updateRunRecord,
  clearActiveRunRecord,
  listRunRecords,
  resolveKernelDir,
  resolveRunsDir,
};
