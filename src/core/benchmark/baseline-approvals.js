const fs = require('fs');
const path = require('path');
const { readBenchmarkBaseline } = require('./baselines.js');

/**
 * @typedef {{
 *   schema_version: string,
 *   baseline_name: string,
 *   status: string,
 *   approved: boolean,
 *   approved_at?: string | null,
 *   revoked_at?: string | null,
 *   updated_at?: string | null,
 *   approver?: string | null,
 *   revoked_by?: string | null,
 *   note?: string | null,
 *   baseline_run_id?: string | null,
 *   baseline_created_at?: string | null,
 *   baseline_summary?: { run_id?: string | null } | null,
 *   previous_approval?: BenchmarkApproval | null,
 * }} BenchmarkApproval
 */

/** @typedef {{ approver?: string | null, by?: string | null, note?: string | null }} ApprovalOptions */

/** @param {string} dir */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

/** @param {unknown} value */
function sanitizeName(value) {
  const raw = String(value || '').trim().toLowerCase();
  const name = raw.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!name) throw new Error('missing baseline approval name');
  return name;
}

/** @param {string | null | undefined} rootDir */
function resolveApprovalDir(rootDir) {
  return path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'observability', 'benchmark-approvals');
}

/** @param {string | null | undefined} rootDir @param {string} name */
function resolveApprovalFile(rootDir, name) {
  return path.join(resolveApprovalDir(rootDir), `${sanitizeName(name)}.json`);
}

/** @param {string} filePath @returns {BenchmarkApproval | null} */
function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return /** @type {BenchmarkApproval} */ (JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

/** @param {string | null | undefined} rootDir @param {string | null | undefined} name @returns {BenchmarkApproval | null} */
function readBaselineApproval(rootDir, name) {
  if (!name) return null;
  return tryReadJson(resolveApprovalFile(rootDir, name));
}

/** @param {string | null | undefined} rootDir */
function listBaselineApprovals(rootDir) {
  const dir = resolveApprovalDir(rootDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => tryReadJson(path.join(dir, entry.name)))
    .filter(Boolean)
    .sort((a, b) => String((b && (b.updated_at || b.approved_at)) || '').localeCompare(String((a && (a.updated_at || a.approved_at)) || '')));
}

/** @param {string | null | undefined} rootDir @param {string} name */
function resolveApprovalStatus(rootDir, name) {
  const approval = readBaselineApproval(rootDir, name);
  const baseline = readBenchmarkBaseline(rootDir, name);
  if (!baseline) {
    return {
      baseline_name: sanitizeName(name),
      status: 'missing_baseline',
      approved: false,
      baseline_run_id: null,
      approval: approval || null,
      matched_run: false,
      ready: false,
      reason: 'benchmark baseline is missing',
    };
  }
  if (!approval || approval.status !== 'approved') {
    return {
      baseline_name: baseline.name,
      status: approval && approval.status === 'revoked' ? 'revoked' : 'missing_approval',
      approved: false,
      baseline_run_id: baseline.baseline_summary ? baseline.baseline_summary.run_id : null,
      approval: approval || null,
      matched_run: false,
      ready: false,
      reason: approval && approval.status === 'revoked' ? 'baseline approval has been revoked' : 'baseline approval is missing',
    };
  }
  const baselineRunId = baseline.baseline_summary ? baseline.baseline_summary.run_id : null;
  const matchedRun = Boolean(baselineRunId && approval.baseline_run_id && baselineRunId === approval.baseline_run_id);
  return {
    baseline_name: baseline.name,
    status: matchedRun ? 'approved' : 'stale_approval',
    approved: matchedRun,
    baseline_run_id: baselineRunId,
    approval,
    matched_run: matchedRun,
    ready: matchedRun,
    reason: matchedRun ? 'baseline approval is ready' : 'baseline approval targets an older baseline run',
  };
}

/** @param {string | null | undefined} rootDir @param {string} name @param {ApprovalOptions} [options] @returns {BenchmarkApproval} */
function approveBaseline(rootDir, name, options = {}) {
  const baseline = readBenchmarkBaseline(rootDir, name);
  if (!baseline || !baseline.baseline_run) throw new Error(`benchmark baseline not found: ${name}`);
  const stamp = nowIso();
  const approval = {
    schema_version: '1.0',
    baseline_name: baseline.name,
    status: 'approved',
    approved: true,
    approved_at: stamp,
    updated_at: stamp,
    approver: String(options.approver || options.by || 'release-manager'),
    note: options.note ? String(options.note) : null,
    baseline_run_id: baseline.baseline_summary ? baseline.baseline_summary.run_id : null,
    baseline_created_at: baseline.created_at || null,
    baseline_summary: baseline.baseline_summary || null,
  };
  const filePath = resolveApprovalFile(rootDir, baseline.name);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(approval, null, 2)}\n`, 'utf8');
  return approval;
}

/** @param {string | null | undefined} rootDir @param {string} name @param {ApprovalOptions} [options] @returns {BenchmarkApproval} */
function revokeBaselineApproval(rootDir, name, options = {}) {
  const current = readBaselineApproval(rootDir, name);
  const baseline = readBenchmarkBaseline(rootDir, name);
  const stamp = nowIso();
  const payload = {
    schema_version: '1.0',
    baseline_name: sanitizeName(name),
    status: 'revoked',
    approved: false,
    revoked_at: stamp,
    updated_at: stamp,
    revoked_by: String(options.approver || options.by || 'release-manager'),
    note: options.note ? String(options.note) : null,
    baseline_run_id: baseline && baseline.baseline_summary ? baseline.baseline_summary.run_id : (current && current.baseline_run_id ? current.baseline_run_id : null),
    previous_approval: current || null,
  };
  const filePath = resolveApprovalFile(rootDir, name);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

module.exports = {
  approveBaseline,
  listBaselineApprovals,
  readBaselineApproval,
  resolveApprovalDir,
  resolveApprovalFile,
  resolveApprovalStatus,
  revokeBaselineApproval,
};
