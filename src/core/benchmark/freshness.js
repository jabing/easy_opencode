const { resolveReleasePolicy } = require('../release/policy.js');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** @typedef {{ fresh_days?: number, aging_days?: number, stale_days?: number }} FreshnessThresholds */
/** @typedef {{ policy?: string, runs?: any[], evaluations?: any[], now?: string | Date }} BenchmarkFreshnessOptions */

/** @param {string | Date | null | undefined} value @returns {Date | null} */
function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** @param {string | Date | null | undefined} value @param {string | Date} [nowValue] */
function ageInDays(value, nowValue = new Date()) {
  const date = asDate(value);
  const now = asDate(nowValue) || new Date();
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY));
}

/** @param {number | null | undefined} ageDays @param {FreshnessThresholds} [thresholds] */
function classifyBenchmarkAge(ageDays, thresholds = {}) {
  if (ageDays === null || ageDays === undefined) return 'missing';
  const freshDays = Number(thresholds.fresh_days || 14);
  const agingDays = Number(thresholds.aging_days || Math.max(freshDays, 21));
  const staleDays = Number(thresholds.stale_days || Math.max(agingDays, 35));
  if (ageDays <= freshDays) return 'fresh';
  if (ageDays <= agingDays) return 'aging';
  if (ageDays <= staleDays) return 'stale';
  return 'expired';
}

/** @param {any[]} sources */
function pickNewestSource(sources) {
  const valid = (Array.isArray(sources) ? sources : []).filter((entry) => asDate(entry && entry.completed_at));
  if (valid.length === 0) return null;
  return valid.slice().sort((a, b) => {
    const newer = asDate(b.completed_at);
    const older = asDate(a.completed_at);
    return (newer ? newer.getTime() : 0) - (older ? older.getTime() : 0);
  })[0];
}

/** @param {BenchmarkFreshnessOptions} [options] */
function buildBenchmarkFreshness(options = {}) {
  const policy = resolveReleasePolicy(options.policy || 'standard');
  const thresholds = (policy.benchmark && policy.benchmark.freshness) || {};
  const runs = Array.isArray(options.runs) ? options.runs : [];
  const evaluationSources = Array.isArray(options.evaluations)
    ? options.evaluations.filter((entry) => entry && entry.matched && entry.bucket && entry.bucket.latest && entry.bucket.latest.completed_at)
      .map((entry) => ({ kind: 'matched_bucket', label: entry.label, bucket_key: entry.bucket.bucket_key || null, completed_at: entry.bucket.latest.completed_at, point_count: Number(entry.bucket.point_count || 0) }))
    : [];
  const fallbackRun = runs[0] && runs[0].completed_at
    ? [{ kind: 'latest_run', label: 'latest benchmark run', completed_at: runs[0].completed_at, run_id: runs[0].run_id || null }]
    : [];
  const selected = pickNewestSource(evaluationSources.length > 0 ? evaluationSources : fallbackRun);
  const observedAt = selected ? selected.completed_at : null;
  const ageDays = ageInDays(observedAt, options.now || new Date());
  return {
    status: classifyBenchmarkAge(ageDays, thresholds),
    observed_at: observedAt,
    age_days: ageDays,
    source: selected ? selected.kind : 'missing',
    source_label: selected ? selected.label || null : null,
    bucket_key: selected ? selected.bucket_key || null : null,
    run_id: selected ? selected.run_id || null : null,
    matched_source_count: evaluationSources.length,
    thresholds: { fresh_days: Number(thresholds.fresh_days || 14), aging_days: Number(thresholds.aging_days || 21), stale_days: Number(thresholds.stale_days || 35) },
    policy: { id: policy.id, label: policy.label },
  };
}

/** @param {any[]} runs @param {{ policy?: string, now?: string | Date }} [options] */
function summarizeRunFreshness(runs, options = {}) {
  const policy = resolveReleasePolicy(options.policy || 'standard');
  const now = options.now || new Date();
  const thresholds = (policy.benchmark && policy.benchmark.freshness) || {};
  const items = (Array.isArray(runs) ? runs : []).map((/** @type {any} */ run) => {
    const ageDays = ageInDays(run && (run.completed_at || run.started_at), now);
    return { run_id: run && run.run_id ? run.run_id : null, completed_at: run && (run.completed_at || run.started_at) ? (run.completed_at || run.started_at) : null, age_days: ageDays, status: classifyBenchmarkAge(ageDays, thresholds), suite_name: run && run.suite_name ? run.suite_name : null };
  });
  /** @type {Record<string, number>} */
  const byStatus = { fresh: 0, aging: 0, stale: 0, expired: 0, missing: 0 };
  for (const item of items) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  const latest = items[0] || null;
  return {
    policy: { id: policy.id, label: policy.label },
    thresholds: { fresh_days: Number(thresholds.fresh_days || 14), aging_days: Number(thresholds.aging_days || 21), stale_days: Number(thresholds.stale_days || 35) },
    run_count: items.length,
    latest_completed_at: latest ? latest.completed_at : null,
    latest_age_days: latest ? latest.age_days : null,
    latest_status: latest ? latest.status : 'missing',
    by_status: byStatus,
    stale_runs: items.filter((item) => item.status === 'stale' || item.status === 'expired'),
    runs: items,
  };
}

module.exports = { ageInDays, buildBenchmarkFreshness, classifyBenchmarkAge, summarizeRunFreshness };
