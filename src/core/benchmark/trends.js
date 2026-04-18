const { summarizeTaskMetrics } = require('./analysis.js');
const { resolveResultSkill, resolveResultTaskFamily } = require('../skills/taxonomy.js');

/** @typedef {'runtime' | 'framework' | 'runtime-framework' | 'skill-family' | 'skill'} TrendGroupBy */
/** @typedef {{ run_id?: string | null, suite_name?: string | null, started_at?: string | null, completed_at?: string | null, results?: unknown[] | null }} BenchmarkRun */
/** @typedef {{ run_id?: string | null, suite_name?: string | null, completed_at?: string | null, case_total?: number | null, passed?: number | null, failed?: number | null, pass_rate?: number | null, task_success_total?: number | null, task_success_rate?: number | null, avg_failed_count?: number | null, avg_output_count?: number | null, avg_update_count?: number | null }} BucketPoint */
/** @typedef {{ bucket_key: string, label: string, runtime: string, framework: string, task_family: string | null, skill: string | null, case_total: number, task_families: Record<string, number>, skills: Record<string, number>, passed: number, failed: number, pass_rate: number | null, task_success_total: number, task_success_rate: number | null, avg_failed_count: number | null, avg_output_count: number | null, avg_update_count: number | null, review_verdicts: Record<string, number>, actions: Record<string, number>, case_ids: string[] }} BucketSummary */
/** @typedef {{ bucket_key: string, label: string, runtime: string, framework: string, task_family: string | null, skill: string | null, point_count: number, direction: string, latest: BucketPoint | null, previous: BucketPoint | null, deltas: Record<string, number> | null, stability: { pass_rate_range: number | null, task_success_rate_range: number | null, avg_failed_count_range: number | null }, series: BucketPoint[] }} TrendBucket */
/** @typedef {{ group_by: TrendGroupBy, run_count: number, bucket_count: number, latest_completed_at: string | null, summary: { directions: Record<string, number>, avg_latest_pass_rate: number | null, avg_latest_task_success_rate: number | null }, windows: Array<{ window_runs: number, observed_runs: number, latest_completed_at: string | null, summary: { directions: Record<string, number>, avg_latest_pass_rate: number | null, avg_latest_task_success_rate: number | null } }>, buckets: TrendBucket[] }} TrendReport */

/** @param {unknown} value @returns {TrendGroupBy} */
function normalizeGroupBy(value) {
  const raw = String(value || 'runtime-framework').trim().toLowerCase();
  if (raw === 'runtime' || raw === 'framework' || raw === 'runtime-framework' || raw === 'skill-family' || raw === 'skill') return raw;
  if (raw === 'runtime+framework' || raw === 'runtime_framework' || raw === 'runtime/framework') return 'runtime-framework';
  if (raw === 'skill_family' || raw === 'skill/family' || raw === 'skill+family') return 'skill-family';
  throw new Error(`unsupported group-by value: ${value}`);
}

/** @param {unknown} value @param {string} [fallback] */
function normalizeToken(value, fallback = 'unknown') {
  const token = String(value || '').trim();
  return token || fallback;
}

/** @param {any} result @param {TrendGroupBy} groupBy */
function bucketInfo(result, groupBy) {
  const runtime = normalizeToken(result && result.detected ? result.detected.runtime : null);
  const framework = normalizeToken(result && result.detected ? result.detected.framework : null);
  const taskFamily = normalizeToken(resolveResultTaskFamily(result), 'other');
  const skill = normalizeToken(resolveResultSkill(result), 'unknown');
  if (groupBy === 'runtime') {
    return { key: runtime, runtime, framework, task_family: taskFamily, skill, label: runtime };
  }
  if (groupBy === 'framework') {
    return { key: framework, runtime, framework, task_family: taskFamily, skill, label: framework };
  }
  if (groupBy === 'skill-family') {
    return { key: taskFamily, runtime, framework, task_family: taskFamily, skill, label: taskFamily };
  }
  if (groupBy === 'skill') {
    return { key: skill, runtime, framework, task_family: taskFamily, skill, label: skill };
  }
  return {
    key: `${runtime}:${framework}`,
    runtime,
    framework,
    task_family: taskFamily,
    skill,
    label: framework === 'unknown' ? runtime : `${runtime} / ${framework}`,
  };
}

/** @param {unknown[] | null | undefined} values */
function average(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  let total = 0;
  for (const value of values) total += Number(value || 0);
  return Number((total / values.length).toFixed(2));
}

/** @param {unknown} value @param {number} runCount */
function normalizeWindowSizes(value, runCount) {
  const defaultSizes = [3, 5, 10];
  const parsed = Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item >= 2)
    : String(value || '')
      .split(',')
      .map((item) => Number(String(item || '').trim()))
      .filter((item) => Number.isFinite(item) && item >= 2);
  const source = Array.isArray(value) ? parsed : (parsed.length > 0 ? parsed : defaultSizes);
  return Array.from(new Set(source.map((item) => Math.min(Number(item), Math.max(2, Number(runCount || 0)))))).filter((item) => item >= 2).sort((a, b) => a - b);
}

/** @param {unknown[] | null | undefined} results @param {TrendGroupBy} groupBy @returns {Record<string, BucketSummary>} */
function summarizeBucketResults(results, groupBy) {
  /** @type {Record<string, { bucket_key: string, label: string, runtime: string, framework: string, task_family: string | null, skill: string | null, results: any[] }>} */
  const buckets = {};
  for (const result of Array.isArray(results) ? results : []) {
    const info = bucketInfo(result, groupBy);
    if (!buckets[info.key]) {
      buckets[info.key] = {
        bucket_key: info.key,
        label: info.label,
        runtime: info.runtime,
        framework: info.framework,
        task_family: info.task_family || null,
        skill: info.skill || null,
        results: [],
      };
    }
    const bucket = buckets[info.key];
    if (bucket) bucket.results.push(result);
  }
  /** @type {Record<string, BucketSummary>} */
  const summaries = {};
  for (const [key, bucket] of Object.entries(buckets)) {
    const task = summarizeTaskMetrics(bucket.results);
    /** @type {Record<string, number>} */
    const reviewVerdicts = {};
    /** @type {Record<string, number>} */
    const actions = {};
    /** @type {string[]} */
    const caseIds = [];
    for (const item of bucket.results) {
      const taskInfo = item && item.task ? item.task : {};
      const verdict = taskInfo.review_verdict || 'none';
      reviewVerdicts[verdict] = (reviewVerdicts[verdict] || 0) + 1;
      const action = taskInfo.strategy_action || 'none';
      actions[action] = (actions[action] || 0) + 1;
      if (item && item.case_id) caseIds.push(String(item.case_id));
    }
    summaries[key] = {
      bucket_key: key,
      label: bucket.label,
      runtime: bucket.runtime,
      framework: bucket.framework,
      task_family: bucket.task_family,
      skill: bucket.skill,
      case_total: task.case_total,
      task_families: task.task_families,
      skills: task.skills,
      passed: task.passed,
      failed: task.failed,
      pass_rate: task.case_total > 0 ? Number(((task.passed / task.case_total) * 100).toFixed(2)) : null,
      task_success_total: task.task_success_total,
      task_success_rate: task.task_success_rate,
      avg_failed_count: task.avg_failed_count,
      avg_output_count: task.avg_output_count,
      avg_update_count: task.avg_update_count,
      review_verdicts: reviewVerdicts,
      actions,
      case_ids: caseIds,
    };
  }
  return summaries;
}

/** @param {BucketPoint[]} points */
function computeDirection(points) {
  if (!Array.isArray(points) || points.length < 2) return 'insufficient_data';
  const first = points[0];
  const last = points[points.length - 1];
  const passDelta = Number((Number((last && last.pass_rate) || 0) - Number((first && first.pass_rate) || 0)).toFixed(2));
  const taskDelta = Number((Number((last && last.task_success_rate) || 0) - Number((first && first.task_success_rate) || 0)).toFixed(2));
  const failDelta = Number((Number((last && last.avg_failed_count) || 0) - Number((first && first.avg_failed_count) || 0)).toFixed(2));
  if ((passDelta > 0 || taskDelta > 0) && failDelta <= 0) return 'improving';
  if ((passDelta < 0 || taskDelta < 0) && failDelta >= 0) return 'regressing';
  if (passDelta === 0 && taskDelta === 0 && failDelta === 0) return 'stable';
  return 'mixed';
}

/** @param {unknown[] | null | undefined} runs @param {{ groupBy?: unknown, limit?: unknown, includeWindows?: boolean, windows?: unknown }} [options] @returns {TrendReport} */
function buildTrendReport(runs, options = {}) {
  const groupBy = normalizeGroupBy(options.groupBy);
  const limit = Math.max(1, Number(options.limit || 10));
  const includeWindows = options.includeWindows !== false;
  const orderedRuns = /** @type {BenchmarkRun[]} */ (Array.isArray(runs) ? runs.slice(0, limit) : [])
    .slice()
    .sort((a, b) => new Date((a && (a.completed_at || a.started_at)) || 0).getTime() - new Date((b && (b.completed_at || b.started_at)) || 0).getTime());
  const allKeys = new Set();
  /** @type {Record<string, { bucket_key: string, label: string, runtime: string, framework: string, task_family: string | null, skill: string | null, points: BucketPoint[] }>} */
  const series = {};
  for (const run of orderedRuns) {
    const summaries = summarizeBucketResults(run.results || [], groupBy);
    for (const [key, summary] of Object.entries(summaries)) {
      allKeys.add(key);
      if (!series[key]) {
        series[key] = {
          bucket_key: key,
          label: summary.label,
          runtime: summary.runtime,
          framework: summary.framework,
          task_family: summary.task_family || null,
          skill: summary.skill || null,
          points: [],
        };
      }
      series[key].points.push({
        run_id: run.run_id || null,
        suite_name: run.suite_name || null,
        completed_at: run.completed_at || run.started_at || null,
        case_total: summary.case_total,
        passed: summary.passed,
        failed: summary.failed,
        pass_rate: summary.pass_rate,
        task_success_total: summary.task_success_total,
        task_success_rate: summary.task_success_rate,
        avg_failed_count: summary.avg_failed_count,
        avg_output_count: summary.avg_output_count,
        avg_update_count: summary.avg_update_count,
      });
    }
  }
  /** @type {TrendBucket[]} */
  const buckets = Array.from(allKeys).sort().map((key) => {
    const bucket = series[key] || { bucket_key: key, label: key, runtime: 'unknown', framework: 'unknown', task_family: null, skill: null, points: /** @type {BucketPoint[]} */ ([]) };
    const points = bucket.points;
    const latest = points.length > 0 ? (points[points.length - 1] || null) : null;
    const previous = points.length > 1 ? (points[points.length - 2] || null) : null;
    const deltas = latest && previous ? {
      pass_rate: Number((Number(latest.pass_rate || 0) - Number(previous.pass_rate || 0)).toFixed(2)),
      task_success_rate: Number((Number(latest.task_success_rate || 0) - Number(previous.task_success_rate || 0)).toFixed(2)),
      avg_failed_count: Number((Number(latest.avg_failed_count || 0) - Number(previous.avg_failed_count || 0)).toFixed(2)),
      avg_output_count: Number((Number(latest.avg_output_count || 0) - Number(previous.avg_output_count || 0)).toFixed(2)),
      avg_update_count: Number((Number(latest.avg_update_count || 0) - Number(previous.avg_update_count || 0)).toFixed(2)),
    } : null;
    return {
      bucket_key: bucket.bucket_key,
      label: bucket.label,
      runtime: bucket.runtime,
      framework: bucket.framework,
      task_family: bucket.task_family || null,
      skill: bucket.skill || null,
      point_count: points.length,
      direction: computeDirection(points),
      latest,
      previous,
      deltas,
      stability: {
        pass_rate_range: points.length > 0 ? Number((Math.max(...points.map((item) => Number(item.pass_rate || 0))) - Math.min(...points.map((item) => Number(item.pass_rate || 0)))).toFixed(2)) : null,
        task_success_rate_range: points.length > 0 ? Number((Math.max(...points.map((item) => Number(item.task_success_rate || 0))) - Math.min(...points.map((item) => Number(item.task_success_rate || 0)))).toFixed(2)) : null,
        avg_failed_count_range: points.length > 0 ? Number((Math.max(...points.map((item) => Number(item.avg_failed_count || 0))) - Math.min(...points.map((item) => Number(item.avg_failed_count || 0)))).toFixed(2)) : null,
      },
      series: points,
    };
  });
  /** @type {Record<string, number>} */
  const directionCounts = { improving: 0, regressing: 0, stable: 0, mixed: 0, insufficient_data: 0 };
  for (const bucket of buckets) {
    directionCounts[bucket.direction] = (directionCounts[bucket.direction] || 0) + 1;
  }
  /** @type {number[]} */
  const latestPassRates = [];
  /** @type {number[]} */
  const latestTaskRates = [];
  for (const item of buckets) {
    if (item.latest && item.latest.pass_rate !== null && item.latest.pass_rate !== undefined) latestPassRates.push(Number(item.latest.pass_rate));
    if (item.latest && item.latest.task_success_rate !== null && item.latest.task_success_rate !== undefined) latestTaskRates.push(Number(item.latest.task_success_rate));
  }
  const windowSizes = includeWindows ? normalizeWindowSizes(options.windows, orderedRuns.length) : [];
  const windows = windowSizes.map((size) => {
    const subset = orderedRuns.slice(Math.max(0, orderedRuns.length - size));
    const points = subset.length;
    const report = points >= 2 ? buildTrendReport(subset, { groupBy, limit: points, includeWindows: false }) : null;
    const lastRun = subset.length > 0 ? (subset[subset.length - 1] || null) : null;
    return {
      window_runs: size,
      observed_runs: subset.length,
      latest_completed_at: lastRun ? lastRun.completed_at || lastRun.started_at || null : null,
      summary: report ? report.summary : { directions: { improving: 0, regressing: 0, stable: 0, mixed: 0, insufficient_data: 0 }, avg_latest_pass_rate: null, avg_latest_task_success_rate: null },
    };
  });
  const lastOrderedRun = orderedRuns.length > 0 ? (orderedRuns[orderedRuns.length - 1] || null) : null;
  return {
    group_by: groupBy,
    run_count: orderedRuns.length,
    bucket_count: buckets.length,
    latest_completed_at: lastOrderedRun ? lastOrderedRun.completed_at || lastOrderedRun.started_at || null : null,
    summary: {
      directions: directionCounts,
      avg_latest_pass_rate: average(latestPassRates),
      avg_latest_task_success_rate: average(latestTaskRates),
    },
    windows,
    buckets,
  };
}

module.exports = {
  normalizeGroupBy,
  normalizeWindowSizes,
  summarizeBucketResults,
  buildTrendReport,
};
