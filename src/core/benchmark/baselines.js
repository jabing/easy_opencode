const fs = require('fs');
const path = require('path');
const { compareRuns, loadRunFromRef, summarizeTaskMetrics } = require('./analysis.js');
const { readBenchmarkRuns } = require('../../control-plane/observability/index.js');

/**
 * @typedef {{
 *   run_id?: string | null,
 *   suite_name?: string | null,
 *   completed_at?: string | null,
 *   summary?: {
 *     total?: number,
 *     passed?: number,
 *     failed?: number,
 *     pass_rate?: number | null,
 *     task_success_rate?: number | null,
 *     avg_failed_count?: number | null,
 *   } | null,
 *   results?: unknown[] | null,
 * }} BenchmarkRun
 */

/**
 * @typedef {{
 *   run_id: string | null,
 *   suite_name: string | null,
 *   completed_at: string | null,
 *   case_total: number,
 *   passed: number,
 *   failed: number,
 *   pass_rate: number | null,
 *   task_success_rate: number | null,
 *   avg_failed_count: number | null,
 * }} BenchmarkRunSummary
 */

/** @typedef {{ latest?: boolean, from?: string | null, sourceKind?: string | null, sourceRef?: string | null, notes?: string | null, tags?: unknown[] | null }} BaselineOptions */
/** @typedef {{ schema_version: string, name: string, created_at: string | null, source: { kind: string | null, ref: string | null } | null, baseline_run: BenchmarkRun | null, baseline_summary: BenchmarkRunSummary | null, notes: string | null, tags: string[] }} BenchmarkBaseline */

/** @param {string} dir */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

/** @param {unknown} value */
function sanitizeBaselineName(value) {
  const raw = String(value || '').trim().toLowerCase();
  const name = raw.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!name) throw new Error('missing baseline name');
  return name;
}

/** @param {string | null | undefined} rootDir */
function resolveBenchmarkBaselinesDir(rootDir) {
  return path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'observability', 'benchmark-baselines');
}

/** @param {string | null | undefined} rootDir @param {string} name */
function resolveBenchmarkBaselineFile(rootDir, name) {
  return path.join(resolveBenchmarkBaselinesDir(rootDir), `${sanitizeBaselineName(name)}.json`);
}

/** @param {string} filePath @returns {BenchmarkBaseline | null} */
function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return /** @type {BenchmarkBaseline} */ (JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

/** @param {string | null | undefined} rootDir @param {BaselineOptions} [options] @returns {BenchmarkRun} */
function selectRun(rootDir, options = {}) {
  if (options.latest) {
    const runs = /** @type {BenchmarkRun[]} */ (readBenchmarkRuns(rootDir || process.cwd(), { limit: 1 }));
    const latestRun = runs[0];
    if (!latestRun) throw new Error('no benchmark runs available for baseline creation');
    return latestRun;
  }
  if (options.from) return /** @type {BenchmarkRun} */ (loadRunFromRef(rootDir || process.cwd(), String(options.from)));
  throw new Error('baseline creation requires --latest or --from <run-id>');
}

/** @param {BenchmarkRun | null | undefined} run @returns {BenchmarkRunSummary} */
function summarizeRun(run) {
  const summary = run && run.summary ? run.summary : null;
  const runResults = run && Array.isArray(run.results) ? run.results : [];
  const metrics = /** @type {{ case_total?: number, passed?: number, failed?: number, task_success_rate?: number | null, avg_failed_count?: number | null }} */ (summarizeTaskMetrics(runResults));
  const caseTotal = summary && summary.total !== undefined ? Number(summary.total) : Number(metrics.case_total || 0);
  const passed = summary && summary.passed !== undefined ? Number(summary.passed) : Number(metrics.passed || 0);
  const failed = summary && summary.failed !== undefined ? Number(summary.failed) : Number(metrics.failed || 0);
  const passRate = summary && summary.pass_rate !== undefined
    ? Number(summary.pass_rate)
    : caseTotal > 0 ? Number(((passed / caseTotal) * 100).toFixed(2)) : null;
  return {
    run_id: run && run.run_id ? run.run_id : null,
    suite_name: run && run.suite_name ? run.suite_name : null,
    completed_at: run && run.completed_at ? run.completed_at : null,
    case_total: caseTotal,
    passed,
    failed,
    pass_rate: passRate,
    task_success_rate: summary && summary.task_success_rate !== undefined ? Number(summary.task_success_rate) : metrics.task_success_rate ?? null,
    avg_failed_count: summary && summary.avg_failed_count !== undefined ? Number(summary.avg_failed_count) : metrics.avg_failed_count ?? null,
  };
}

/** @param {string | null | undefined} rootDir @param {string} name @param {BenchmarkRun} run @param {BaselineOptions} [options] @returns {BenchmarkBaseline} */
function writeBenchmarkBaseline(rootDir, name, run, options = {}) {
  const baselineName = sanitizeBaselineName(name);
  const filePath = resolveBenchmarkBaselineFile(rootDir, baselineName);
  ensureDir(path.dirname(filePath));
  const payload = {
    schema_version: '1.0',
    name: baselineName,
    created_at: nowIso(),
    source: {
      kind: options.sourceKind || (options.latest ? 'latest-run' : 'run-ref'),
      ref: options.sourceRef || run.run_id || null,
    },
    baseline_run: run,
    baseline_summary: summarizeRun(run),
    notes: options.notes ? String(options.notes) : null,
    tags: Array.isArray(options.tags) ? options.tags.map(String) : [],
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

/** @param {string | null | undefined} rootDir @param {string | null | undefined} name @returns {BenchmarkBaseline | null} */
function readBenchmarkBaseline(rootDir, name) {
  if (!name) return null;
  return tryReadJson(resolveBenchmarkBaselineFile(rootDir, name));
}

/** @param {string | null | undefined} rootDir */
function listBenchmarkBaselines(rootDir) {
  const dir = resolveBenchmarkBaselinesDir(rootDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const filePath = path.join(dir, entry.name);
      const data = tryReadJson(filePath);
      if (!data) return null;
      return {
        name: data.name || entry.name.replace(/\.json$/, ''),
        created_at: data.created_at || null,
        source: data.source || null,
        baseline_summary: data.baseline_summary || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String((b && b.created_at) || '').localeCompare(String((a && a.created_at) || '')));
}

/** @param {string | null | undefined} rootDir @param {string} baselineName @param {string | null | undefined} currentRef @param {BaselineOptions} [options] */
function compareBaselineToRun(rootDir, baselineName, currentRef, options = {}) {
  const baseline = readBenchmarkBaseline(rootDir, baselineName);
  if (!baseline || !baseline.baseline_run) throw new Error(`benchmark baseline not found: ${baselineName}`);
  const currentRun = options.latest
    ? (() => {
        const runs = /** @type {BenchmarkRun[]} */ (readBenchmarkRuns(rootDir || process.cwd(), { limit: 1 }));
        const latestRun = runs[0];
        if (!latestRun) throw new Error('no benchmark runs available to compare against baseline');
        return latestRun;
      })()
    : /** @type {BenchmarkRun} */ (loadRunFromRef(rootDir || process.cwd(), String(currentRef || '')));
  const comparison = compareRuns(baseline.baseline_run, currentRun);
  return {
    baseline_name: baseline.name,
    baseline_created_at: baseline.created_at,
    baseline_summary: baseline.baseline_summary || summarizeRun(baseline.baseline_run),
    current_summary: summarizeRun(currentRun),
    comparison,
  };
}

module.exports = {
  compareBaselineToRun,
  listBenchmarkBaselines,
  readBenchmarkBaseline,
  resolveBenchmarkBaselineFile,
  resolveBenchmarkBaselinesDir,
  sanitizeBaselineName,
  selectRun,
  summarizeRun,
  writeBenchmarkBaseline,
};
