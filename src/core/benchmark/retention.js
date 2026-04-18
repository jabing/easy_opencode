const fs = require('fs');
const path = require('path');
const { readBenchmarkRuns, resolveBenchmarksDir } = require('../../control-plane/observability/index.js');
const { ageInDays, classifyBenchmarkAge } = require('./freshness.js');
const { listBenchmarkBaselines } = require('./baselines.js');
const { listBaselineApprovals } = require('./baseline-approvals.js');
const { resolveReleasePolicy } = require('../release/policy.js');

/** @typedef {{ run_id?: string | null, baseline_summary?: { run_id?: string | null } | null }} BaselineItem */
/** @typedef {{ status?: string | null, baseline_run_id?: string | null }} ApprovalItem */
/** @typedef {{ run_id: string, completed_at?: string | null, started_at?: string | null, _mtimeMs?: number }} RetentionRun */
/** @typedef {{ policy?: string, keepLatest?: number, limit?: number, now?: Date, apply?: boolean }} RetentionOptions */

/** @param {string} dir */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** @param {string} rootDir */
function resolveBenchmarkArchiveDir(rootDir) {
  return path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'observability', 'benchmarks-archive');
}

/** @param {string} rootDir */
function collectProtectedRunIds(rootDir) {
  const protectedIds = new Set();
  for (const item of /** @type {BaselineItem[]} */ (listBenchmarkBaselines(rootDir))) {
    const runId = item && item.baseline_summary ? item.baseline_summary.run_id : null;
    if (runId) protectedIds.add(runId);
  }
  for (const item of /** @type {ApprovalItem[]} */ (listBaselineApprovals(rootDir))) {
    if (item && item.status === 'approved' && item.baseline_run_id) protectedIds.add(item.baseline_run_id);
  }
  return protectedIds;
}

/** @param {string} rootDir @param {RetentionOptions} [options] */
function assessBenchmarkRetention(rootDir, options = {}) {
  const policy = resolveReleasePolicy(options.policy || 'standard');
  const keepLatest = Math.max(Number(policy.benchmark.minimum_run_count || 5), Number(options.keepLatest || 0));
  const runs = /** @type {RetentionRun[]} */ (readBenchmarkRuns(rootDir, { limit: Math.max(Number(options.limit || 200), keepLatest) }));
  const protectedRunIds = collectProtectedRunIds(rootDir);
  const thresholds = policy.benchmark && policy.benchmark.freshness ? policy.benchmark.freshness : {};
  const candidates = runs.map((run, index) => {
    const ageDays = ageInDays(run.completed_at || run.started_at || null, options.now || new Date());
    const freshnessStatus = classifyBenchmarkAge(ageDays, thresholds);
    /** @type {string[]} */
    const reasons = [];
    const protectedRef = protectedRunIds.has(run.run_id);
    const retainedByWindow = index < keepLatest;
    const archiveEligible = !protectedRef && !retainedByWindow && (freshnessStatus === 'stale' || freshnessStatus === 'expired');
    if (protectedRef) reasons.push('protected_by_baseline_or_approval');
    if (retainedByWindow) reasons.push(`retained_by_keep_latest=${keepLatest}`);
    if (!(freshnessStatus === 'stale' || freshnessStatus === 'expired')) reasons.push(`freshness=${freshnessStatus}`);
    if (archiveEligible) reasons.push('archive_candidate');
    return {
      run_id: run.run_id,
      completed_at: run.completed_at || null,
      freshness_status: freshnessStatus,
      age_days: ageDays,
      protected: protectedRef,
      retained_by_window: retainedByWindow,
      archive_eligible: archiveEligible,
      reasons,
    };
  });
  return {
    policy: { id: policy.id, label: policy.label },
    keep_latest: keepLatest,
    run_count: runs.length,
    protected_run_ids: Array.from(protectedRunIds),
    candidates,
    archive_candidates: candidates.filter((item) => item.archive_eligible),
  };
}

/** @param {string} rootDir @param {RetentionOptions} [options] */
function archiveBenchmarkRuns(rootDir, options = {}) {
  const report = assessBenchmarkRetention(rootDir, options);
  const benchmarksDir = resolveBenchmarksDir(rootDir);
  const archiveDir = resolveBenchmarkArchiveDir(rootDir);
  /** @type {Array<{ run_id: string, from: string, to: string, freshness_status: string, age_days: number | null }>} */
  const archived = [];
  for (const candidate of report.archive_candidates) {
    const src = path.join(benchmarksDir, `${candidate.run_id}.json`);
    if (!fs.existsSync(src)) continue;
    const stamp = String(candidate.completed_at || '').slice(0, 7).replace(/-/g, '') || 'unknown';
    const targetDir = path.join(archiveDir, stamp);
    ensureDir(targetDir);
    const dest = path.join(targetDir, `${candidate.run_id}.json`);
    if (options.apply) fs.renameSync(src, dest);
    archived.push({ run_id: candidate.run_id, from: src, to: dest, freshness_status: candidate.freshness_status, age_days: candidate.age_days });
  }
  return {
    ...report,
    apply: Boolean(options.apply),
    archived_count: archived.length,
    archived,
    archive_dir: archiveDir,
  };
}

module.exports = {
  archiveBenchmarkRuns,
  assessBenchmarkRetention,
  collectProtectedRunIds,
  resolveBenchmarkArchiveDir,
};
