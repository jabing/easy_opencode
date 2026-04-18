const fs = require('fs');
const path = require('path');
const { tryReadJson, writeJson } = require('../../shared/json.js');
const { ensureDir } = require('../../shared/fs.js');
const { emitObservabilityEvent } = require('../kernel/events/event-bus.js');
const { readUnifiedEvents } = require('../kernel/events/event-store.js');
const { normalizeKernelEvent } = require('../../shared/contracts.js');

/**
 * @typedef {{ event_id?: string | null, at?: string | null, ts?: string | null, channel?: string | null, source?: string | null, type?: string | null, event_type?: string | null, status?: string | null, flow?: string | null, objective?: string | null, summary?: string | null, run_id?: string | null } & Record<string, unknown>} EventRecord
 * @typedef {{ limit?: number, type?: string, since?: string, reverse?: boolean, channel?: string }} ReadEventsOptions
 * @typedef {{
 *   run_id: string,
 *   suite_name?: string,
 *   completed_at?: string | null,
 *   results?: Array<{
 *     passed?: boolean,
 *     task_success?: boolean,
 *     failed_count?: number,
 *     output_count?: number,
 *     update_count?: number,
 *     detected?: { runtime?: string, framework?: string },
 *     task?: { task_family?: string, selected_skill?: string }
 *   }>
 * }} BenchmarkRunRecord
 */

/** @param {string} rootDir */
function resolveObservabilityDir(rootDir) {
  return path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'observability');
}

/** @param {string} rootDir */
function resolveEventsFile(rootDir) {
  return path.join(resolveObservabilityDir(rootDir), 'events.ndjson');
}

/** @param {string} rootDir */
function resolveBenchmarksDir(rootDir) {
  return path.join(resolveObservabilityDir(rootDir), 'benchmarks');
}

/** @param {string} rootDir @param {string} type @param {Record<string, unknown>} [payload] */
function appendEvent(rootDir, type, payload = {}) {
  return emitObservabilityEvent(rootDir, type, payload);
}

/** @param {string} rootDir @returns {EventRecord[]} */
function readLegacyEvents(rootDir) {
  const filePath = resolveEventsFile(rootDir);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(/** @param {string} line */ (line) => Boolean(line)).map(/** @param {string} line */ (line) => {
    try {
      const parsed = /** @type {EventRecord} */ (JSON.parse(line));
      return /** @type {EventRecord} */ (normalizeKernelEvent({
        event_id: parsed.event_id || null,
        at: parsed.at || parsed.ts || null,
        type: parsed.type || parsed.event_type || 'event.unknown',
        channel: parsed.channel || 'observability',
        source: parsed.source || 'observability',
        ...parsed,
      }, { channel: 'observability', source: 'observability' }));
    } catch {
      return null;
    }
  }).filter(/** @returns {event is EventRecord} */ (event) => Boolean(event));
}

/** @param {EventRecord[]} events @returns {EventRecord[]} */
function dedupeEvents(events) {
  const seen = new Set();
  /** @type {EventRecord[]} */
  const items = [];
  for (const event of events) {
    const key = event.event_id || `${event.channel || ''}:${event.type || ''}:${event.at || ''}:${event.run_id || ''}:${event.summary || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(event);
  }
  return items;
}

/** @param {string} rootDir @param {ReadEventsOptions} [options] @returns {EventRecord[]} */
function readEvents(rootDir, options = {}) {
  const { limit = 200, type, since, reverse = true, channel } = options;
  const readOptions = /** @type {ReadEventsOptions} */ ({ limit: Math.max(1000, Number(limit) || 200), reverse });
  if (type) readOptions.type = type;
  if (since) readOptions.since = since;
  if (channel) readOptions.channel = channel;
  let events = /** @type {EventRecord[]} */ (readUnifiedEvents(rootDir, readOptions));
  if (events.length === 0 || !channel) {
    const legacy = readLegacyEvents(rootDir).filter((event) => {
      if (type && event.type !== type) return false;
      if (since) {
        const sinceTime = new Date(since).getTime();
        if (!Number.isNaN(sinceTime) && new Date(String(event.at || '')).getTime() < sinceTime) return false;
      }
      return !channel || event.channel === channel;
    });
    events = dedupeEvents(events.concat(legacy));
    events.sort((a, b) => {
      const left = new Date(String(a.at || '')).getTime();
      const right = new Date(String(b.at || '')).getTime();
      return reverse ? right - left : left - right;
    });
  }
  return events.slice(0, Math.max(1, Number(limit) || 200));
}

/** @param {Record<string, number>} map @param {string | null | undefined} key */
function increment(map, key) {
  const safeKey = key || 'unknown';
  map[safeKey] = (map[safeKey] || 0) + 1;
}

/** @param {EventRecord[]} events */
function summarizeEvents(events) {
  const firstEvent = events.length > 0 ? events[0] : null;
  const summary = /** @type {{ event_count: number, by_type: Record<string, number>, by_flow: Record<string, number>, by_status: Record<string, number>, by_channel: Record<string, number>, latest_at: string | null, recent_objectives: string[] }} */ ({
    event_count: events.length,
    by_type: {},
    by_flow: {},
    by_status: {},
    by_channel: {},
    latest_at: firstEvent ? firstEvent.at || null : null,
    recent_objectives: [],
  });
  const objectives = new Set();
  for (const event of events) {
    increment(summary.by_type, event.type || event.event_type);
    if (event.flow) increment(summary.by_flow, String(event.flow));
    if (event.status) increment(summary.by_status, event.status);
    if (event.channel) increment(summary.by_channel, event.channel);
    if (event.objective && !objectives.has(event.objective)) {
      objectives.add(event.objective);
      summary.recent_objectives.push(event.objective);
      if (summary.recent_objectives.length >= 8) break;
    }
  }
  return summary;
}

/** @param {string} rootDir @param {string} runId */
function benchmarkRunFile(rootDir, runId) {
  return path.join(resolveBenchmarksDir(rootDir), `${runId}.json`);
}

/** @param {string} rootDir @param {BenchmarkRunRecord} runData */
function writeBenchmarkRun(rootDir, runData) {
  ensureDir(resolveBenchmarksDir(rootDir));
  const filePath = benchmarkRunFile(rootDir, runData.run_id);
  writeJson(filePath, runData);
  writeJson(
    path.join(resolveBenchmarksDir(rootDir), 'latest.json'),
    { run_id: runData.run_id, suite_name: runData.suite_name, completed_at: runData.completed_at }
  );
  return filePath;
}

/** @param {string} rootDir @param {string} runId @returns {BenchmarkRunRecord | null} */
function readBenchmarkRun(rootDir, runId) {
  const filePath = benchmarkRunFile(rootDir, runId);
  return /** @type {BenchmarkRunRecord | null} */ (tryReadJson(filePath));
}

/** @param {string} rootDir @param {{ limit?: number }} [options] @returns {Array<BenchmarkRunRecord & { _mtimeMs: number }>} */
function readBenchmarkRuns(rootDir, options = {}) {
  const { limit = 20 } = options;
  const dir = resolveBenchmarksDir(rootDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'latest.json')
    .map((entry) => {
      const filePath = path.join(dir, entry.name);
      const data = /** @type {BenchmarkRunRecord | null} */ (tryReadJson(filePath));
      if (!data) return null;
      const stat = fs.statSync(filePath);
      return { ...data, _mtimeMs: stat.mtimeMs };
    })
    .filter(/** @returns {run is BenchmarkRunRecord & { _mtimeMs: number }} */ (run) => Boolean(run))
    .sort((a, b) => b._mtimeMs - a._mtimeMs)
    .slice(0, Math.max(1, Number(limit) || 20));
}

/** @param {BenchmarkRunRecord[]} runs */
function summarizeBenchmarkRuns(runs) {
  const firstRun = runs.length > 0 ? runs[0] : null;
  const summary = /** @type {{ run_count: number, suite_names: string[], case_total: number, case_passed: number, case_failed: number, task_success_total: number, task_success_rate: number | null, avg_failed_count: number | null, avg_output_count: number | null, avg_update_count: number | null, pass_rate: number | null, runtimes: Record<string, number>, frameworks: Record<string, number>, runtime_frameworks: Record<string, number>, task_families: Record<string, number>, skills: Record<string, number>, latest_completed_at: string | null }} */ ({
    run_count: runs.length,
    suite_names: [],
    case_total: 0,
    case_passed: 0,
    case_failed: 0,
    task_success_total: 0,
    task_success_rate: null,
    avg_failed_count: null,
    avg_output_count: null,
    avg_update_count: null,
    pass_rate: null,
    runtimes: {},
    frameworks: {},
    runtime_frameworks: {},
    task_families: {},
    skills: {},
    latest_completed_at: firstRun ? firstRun.completed_at || null : null,
  });
  const suiteNames = new Set();
  /** @type {number[]} */
  const failedCounts = [];
  /** @type {number[]} */
  const outputCounts = [];
  /** @type {number[]} */
  const updateCounts = [];
  for (const run of runs) {
    if (run.suite_name && !suiteNames.has(run.suite_name)) {
      suiteNames.add(run.suite_name);
      summary.suite_names.push(run.suite_name);
    }
    for (const item of run.results || []) {
      summary.case_total += 1;
      if (item.passed) summary.case_passed += 1;
      else summary.case_failed += 1;
      if (item.task_success) summary.task_success_total += 1;
      failedCounts.push(Number(item.failed_count || 0));
      outputCounts.push(Number(item.output_count || 0));
      updateCounts.push(Number(item.update_count || 0));
      const runtime = item.detected && item.detected.runtime ? item.detected.runtime : 'unknown';
      const framework = item.detected && item.detected.framework ? item.detected.framework : 'unknown';
      const taskFamily = item.task && item.task.task_family ? item.task.task_family : 'other';
      const skill = item.task && item.task.selected_skill ? item.task.selected_skill : 'unknown';
      increment(summary.runtimes, runtime);
      increment(summary.frameworks, framework);
      increment(summary.runtime_frameworks, `${runtime}:${framework}`);
      increment(summary.task_families, taskFamily);
      increment(summary.skills, skill);
    }
  }
  summary.pass_rate = summary.case_total > 0 ? Number(((summary.case_passed / summary.case_total) * 100).toFixed(2)) : null;
  summary.task_success_rate = summary.case_total > 0 ? Number(((summary.task_success_total / summary.case_total) * 100).toFixed(2)) : null;
  /** @param {number[]} values */
  const avg = (values) => values.length > 0 ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : null;
  summary.avg_failed_count = avg(failedCounts);
  summary.avg_output_count = avg(outputCounts);
  summary.avg_update_count = avg(updateCounts);
  return summary;
}

module.exports = {
  resolveObservabilityDir,
  resolveEventsFile,
  resolveBenchmarksDir,
  appendEvent,
  readEvents,
  summarizeEvents,
  writeBenchmarkRun,
  readBenchmarkRun,
  readBenchmarkRuns,
  summarizeBenchmarkRuns,
};
