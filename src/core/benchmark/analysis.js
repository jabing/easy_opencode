const fs = require('fs');
const path = require('path');
const { resolveResultSkill, resolveResultTaskFamily } = require('../skills/taxonomy.js');

/** @typedef {{
 *   case_id?: string | null,
 *   passed?: boolean,
 *   task?: {
 *     task_success?: boolean,
 *     failed_count?: unknown,
 *     scaffold_output_count?: unknown,
 *     scaffold_update_count?: unknown,
 *     review_verdict?: string | null,
 *     strategy_action?: string | null,
 *     task_family?: string | null,
 *     selected_skill?: string | null,
 *   } | null,
 *   plan?: { selected_skill?: { dir?: string | null, name?: string | null } | null } | null,
 *   detected?: { runtime?: string | null } | null,
 * }} BenchmarkResult */

/** @typedef {{ run_id?: string | null, results?: unknown[] | null }} BenchmarkRun */
/** @typedef {{ [key: string]: number }} CountMap */

/** @param {unknown} value @param {number} [fallback] */
function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/** @param {BenchmarkRun | null | undefined} run */
function indexResults(run) {
  /** @type {Map<string, BenchmarkResult>} */
  const out = new Map();
  const results = run && Array.isArray(run.results) ? run.results : [];
  for (const entry of results) {
    const item = /** @type {BenchmarkResult} */ (entry || {});
    out.set(String(item.case_id || ''), item);
  }
  return out;
}

/** @param {unknown[]} values */
function average(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const nums = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (nums.length === 0) return null;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2));
}

/** @param {CountMap} counts @param {string} key */
function bumpCount(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}

/** @param {BenchmarkResult} result */
function taskFamilyFromResult(result) {
  return resolveResultTaskFamily(/** @type {any} */ (result));
}

/** @param {BenchmarkResult} result */
function skillFromResult(result) {
  return resolveResultSkill(/** @type {any} */ (result)) || 'unknown';
}

/** @param {unknown[] | null | undefined} results */
function summarizeTaskMetrics(results) {
  const metrics = /** @type {{case_total:number,passed:number,failed:number,task_success_total:number,task_success_rate:number|null,avg_failed_count:number|null,avg_output_count:number|null,avg_update_count:number|null,review_verdicts:CountMap,actions:CountMap,runtimes:CountMap,task_families:CountMap,skills:CountMap}} */ ({
    case_total: 0,
    passed: 0,
    failed: 0,
    task_success_total: 0,
    task_success_rate: null,
    avg_failed_count: null,
    avg_output_count: null,
    avg_update_count: null,
    review_verdicts: /** @type {CountMap} */ ({}),
    actions: /** @type {CountMap} */ ({}),
    runtimes: /** @type {CountMap} */ ({}),
    task_families: /** @type {CountMap} */ ({}),
    skills: /** @type {CountMap} */ ({}),
  });
  /** @type {number[]} */
  const failedCounts = [];
  /** @type {number[]} */
  const outputCounts = [];
  /** @type {number[]} */
  const updateCounts = [];
  for (const entry of Array.isArray(results) ? results : []) {
    const item = /** @type {BenchmarkResult} */ (entry || {});
    metrics.case_total += 1;
    if (item.passed) metrics.passed += 1;
    else metrics.failed += 1;
    const task = item.task || {};
    if (task.task_success) metrics.task_success_total += 1;
    failedCounts.push(toNumber(task.failed_count, 0));
    outputCounts.push(toNumber(task.scaffold_output_count, 0));
    updateCounts.push(toNumber(task.scaffold_update_count, 0));
    bumpCount(metrics.review_verdicts, String(task.review_verdict || 'none'));
    bumpCount(metrics.actions, String(task.strategy_action || 'none'));
    bumpCount(metrics.runtimes, String((item.detected && item.detected.runtime) || 'unknown'));
    bumpCount(metrics.task_families, taskFamilyFromResult(item));
    bumpCount(metrics.skills, skillFromResult(item));
  }
  metrics.task_success_rate = metrics.case_total > 0
    ? Number(((metrics.task_success_total / metrics.case_total) * 100).toFixed(2))
    : null;
  metrics.avg_failed_count = average(failedCounts);
  metrics.avg_output_count = average(outputCounts);
  metrics.avg_update_count = average(updateCounts);
  return metrics;
}

/** @param {BenchmarkRun | null | undefined} baseline @param {BenchmarkRun | null | undefined} current */
function compareRuns(baseline, current) {
  const baseIndex = indexResults(baseline);
  const currIndex = indexResults(current);
  const allIds = Array.from(new Set([...baseIndex.keys(), ...currIndex.keys()])).sort((a, b) => a.localeCompare(b));
  const cases = [];
  let improved = 0;
  let regressed = 0;
  let unchanged = 0;
  for (const id of allIds) {
    const before = baseIndex.get(id) || null;
    const after = currIndex.get(id) || null;
    const beforePassed = Boolean(before && before.passed);
    const afterPassed = Boolean(after && after.passed);
    const beforeTaskSuccess = Boolean(before && before.task && before.task.task_success);
    const afterTaskSuccess = Boolean(after && after.task && after.task.task_success);
    const beforeFailedCount = toNumber(before && before.task ? before.task.failed_count : null, 0);
    const afterFailedCount = toNumber(after && after.task ? after.task.failed_count : null, 0);
    let status = 'unchanged';
    if ((!beforePassed && afterPassed) || (!beforeTaskSuccess && afterTaskSuccess) || afterFailedCount < beforeFailedCount) {
      status = 'improved';
      improved += 1;
    } else if ((beforePassed && !afterPassed) || (beforeTaskSuccess && !afterTaskSuccess) || afterFailedCount > beforeFailedCount) {
      status = 'regressed';
      regressed += 1;
    } else {
      unchanged += 1;
    }
    cases.push({
      case_id: id,
      status,
      baseline: before ? {
        passed: beforePassed,
        task_success: beforeTaskSuccess,
        failed_count: beforeFailedCount,
        output_count: toNumber(before.task ? before.task.scaffold_output_count : null, 0),
        review_verdict: before.task ? before.task.review_verdict || null : null,
      } : null,
      current: after ? {
        passed: afterPassed,
        task_success: afterTaskSuccess,
        failed_count: afterFailedCount,
        output_count: toNumber(after.task ? after.task.scaffold_output_count : null, 0),
        review_verdict: after.task ? after.task.review_verdict || null : null,
      } : null,
      deltas: {
        passed_changed: beforePassed !== afterPassed,
        task_success_changed: beforeTaskSuccess !== afterTaskSuccess,
        failed_count: afterFailedCount - beforeFailedCount,
        output_count: toNumber(after && after.task ? after.task.scaffold_output_count : null, 0) - toNumber(before && before.task ? before.task.scaffold_output_count : null, 0),
      },
    });
  }
  const baseSummary = summarizeTaskMetrics(baseline && Array.isArray(baseline.results) ? baseline.results : []);
  const currSummary = summarizeTaskMetrics(current && Array.isArray(current.results) ? current.results : []);
  return {
    baseline_run_id: baseline && baseline.run_id ? baseline.run_id : null,
    current_run_id: current && current.run_id ? current.run_id : null,
    summary: {
      case_total: allIds.length,
      improved,
      regressed,
      unchanged,
      pass_rate_delta: Number((((currSummary.passed / Math.max(currSummary.case_total, 1)) * 100) - ((baseSummary.passed / Math.max(baseSummary.case_total, 1)) * 100)).toFixed(2)),
      task_success_rate_delta: Number(((currSummary.task_success_rate || 0) - (baseSummary.task_success_rate || 0)).toFixed(2)),
      avg_failed_count_delta: Number(((currSummary.avg_failed_count || 0) - (baseSummary.avg_failed_count || 0)).toFixed(2)),
      avg_output_count_delta: Number(((currSummary.avg_output_count || 0) - (baseSummary.avg_output_count || 0)).toFixed(2)),
      avg_update_count_delta: Number(((currSummary.avg_update_count || 0) - (baseSummary.avg_update_count || 0)).toFixed(2)),
    },
    baseline_metrics: baseSummary,
    current_metrics: currSummary,
    cases,
  };
}

/** @param {string} rootDir @param {string} ref */
function resolveRunFile(rootDir, ref) {
  const value = String(ref || '').trim();
  if (!value) throw new Error('missing benchmark run reference');
  if (fs.existsSync(value)) return path.resolve(value);
  const candidate = path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'observability', 'benchmarks', `${value}.json`);
  if (fs.existsSync(candidate)) return candidate;
  throw new Error(`benchmark run not found: ${ref}`);
}

/** @param {string} rootDir @param {string} ref */
function loadRunFromRef(rootDir, ref) {
  const filePath = resolveRunFile(rootDir, ref);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

module.exports = {
  summarizeTaskMetrics,
  compareRuns,
  loadRunFromRef,
  resolveRunFile,
};
