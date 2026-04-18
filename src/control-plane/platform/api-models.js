const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { listRunRecords, loadActiveRunRecord, resolveKernelDir } = require('../kernel/run-store.js');
const { resolveEventLogPath } = require('../kernel/event-log.js');
const { readEvents, readBenchmarkRuns, summarizeBenchmarkRuns, resolveObservabilityDir } = require('../observability/index.js');

/** @typedef {{ run_id?: string | null, workflow?: string | null, flow?: string | null, objective?: string | null, status?: string | null, source_kind?: string | null, source_id?: string | null, created_at?: string | null, updated_at?: string | null, latest_event?: unknown, steps?: Array<{ status?: string | null }>, artifacts?: Array<{ id?: string | null, type?: string | null, path?: string | null, created_at?: string | null, meta?: Record<string, unknown> | null }>, pointers?: Record<string, unknown>, summary?: Record<string, unknown>, root_dir?: string | null }} RunRecord */
/** @typedef {{ total: number, pending: number, running: number, succeeded: number, failed: number, skipped: number, retrying: number, ready: number, cancelled: number, [key: string]: number }} StepSummary */
/** @typedef {{ total: number, by_type: Record<string, number> }} ArtifactSummary */

/** @param {string} filePath */
function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {string} filePath */
function tryReadNdjson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).filter(Boolean);
  } catch {
    return [];
  }
}

/** @param {unknown} input */
function hash(input) {
  return crypto.createHash('sha1').update(String(input || '')).digest('hex').slice(0, 12);
}

/** @param {unknown} value */
function toArray(value) {
  return Array.isArray(value) ? value : [];
}

/** @param {unknown} steps @returns {StepSummary} */
function summarizeSteps(steps) {
  /** @type {StepSummary} */
  const summary = { total: 0, pending: 0, running: 0, succeeded: 0, failed: 0, skipped: 0, retrying: 0, ready: 0, cancelled: 0 };
  for (const step of toArray(steps)) {
    summary.total += 1;
    const status = String(step && step.status ? step.status : 'pending');
    const current = Object.prototype.hasOwnProperty.call(summary, status) ? Number(summary[status]) : 0;
    if (!Object.prototype.hasOwnProperty.call(summary, status)) summary[status] = 0;
    summary[status] = current + 1;
  }
  return summary;
}

/** @param {unknown} artifacts @returns {ArtifactSummary} */
function summarizeArtifacts(artifacts) {
  /** @type {ArtifactSummary} */
  const summary = { total: 0, by_type: {} };
  for (const artifact of toArray(artifacts)) {
    summary.total += 1;
    const type = artifact && artifact.type ? String(artifact.type) : 'unknown';
    summary.by_type[type] = (summary.by_type[type] || 0) + 1;
  }
  return summary;
}

/** @param {string} rootDir @param {RunRecord | null | undefined} runRecord */
function collectWorkflowTraces(rootDir, runRecord) {
  const workflowDir = path.join(path.resolve(rootDir), '.opencode', 'workflows');
  if (!fs.existsSync(workflowDir)) return [];
  const traces = [];
  for (const entry of fs.readdirSync(workflowDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(workflowDir, entry.name);
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const trace = tryReadJson(path.join(dir, file));
      if (!trace) continue;
      const linked = Boolean(runRecord && trace.run_id && trace.run_id === runRecord.run_id);
      const traceIdHint = Boolean(runRecord && runRecord.summary && runRecord.summary.trace_id && trace.trace_id === runRecord.summary.trace_id);
      if (runRecord && !(linked || traceIdHint)) continue;
      traces.push({
        trace_id: trace.trace_id,
        workflow_id: trace.workflow_id,
        status: trace.status,
        started_at: trace.started_at,
        finished_at: trace.finished_at,
        step_count: Array.isArray(trace.steps) ? trace.steps.length : 0,
      });
    }
  }
  traces.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  return traces;
}

/** @param {RunRecord | null | undefined} runRecord @param {string} rootDir */
function buildRunSummary(runRecord, rootDir) {
  if (!runRecord) return null;
  return {
    schema_name: 'platform_run_summary',
    schema_version: '1.0',
    run_id: runRecord.run_id,
    workflow: runRecord.workflow,
    flow: runRecord.flow,
    objective: runRecord.objective,
    status: runRecord.status,
    source_kind: runRecord.source_kind,
    source_id: runRecord.source_id,
    created_at: runRecord.created_at,
    updated_at: runRecord.updated_at,
    latest_event: runRecord.latest_event || null,
    step_summary: summarizeSteps(runRecord.steps),
    artifact_summary: summarizeArtifacts(runRecord.artifacts),
    trace_summary: collectWorkflowTraces(rootDir || runRecord.root_dir || process.cwd(), runRecord),
    pointers: runRecord.pointers || {},
    summary: runRecord.summary || {},
  };
}

/** @param {string} rootDir @param {RunRecord | null | undefined} runRecord */
function buildRunTimeline(rootDir, runRecord) {
  if (!runRecord) return null;
  const kernelEvents = tryReadNdjson(resolveEventLogPath(rootDir)).filter((event) => event.run_id === runRecord.run_id);
  const observabilityEvents = readEvents(rootDir, { limit: 500, reverse: false }).filter((event) => {
    return event.run_id === runRecord.run_id || event.plan_id === runRecord.source_id || event.flow === runRecord.flow;
  });
  const workflowDir = path.join(path.resolve(rootDir), '.opencode', 'workflows');
  const workflowItems = [];
  if (fs.existsSync(workflowDir)) {
    for (const entry of fs.readdirSync(workflowDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(workflowDir, entry.name);
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        const trace = tryReadJson(path.join(dir, file));
        if (!trace || trace.run_id !== runRecord.run_id) continue;
        workflowItems.push({
          at: trace.started_at,
          source: 'workflow',
          type: 'workflow.trace',
          workflow_id: trace.workflow_id,
          trace_id: trace.trace_id,
          status: trace.status,
          summary: `${trace.workflow_id} (${trace.status})`,
          meta: {
            started_at: trace.started_at,
            finished_at: trace.finished_at,
            steps: toArray(trace.steps).map((step) => ({ step_id: step.step_id, status: step.status, summary: step.summary || null })),
          },
        });
      }
    }
  }
  const items = [
    { at: runRecord.created_at, source: 'kernel', type: 'run.created', summary: `${runRecord.workflow} created`, meta: { status: runRecord.status } },
    ...kernelEvents.map((event) => ({ at: event.ts, source: 'kernel', type: event.event_type || 'kernel.event', summary: event.summary || event.event_type || 'kernel event', meta: event })),
    ...workflowItems,
    ...observabilityEvents.map((event) => ({ at: event.at, source: 'observability', type: event.type, summary: event.objective || event.type, meta: event })),
  ].filter((item) => item.at);
  items.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return {
    schema_name: 'platform_run_timeline',
    schema_version: '1.0',
    run_id: runRecord.run_id,
    item_count: items.length,
    items,
  };
}

/** @param {string} rootDir @param {RunRecord[]} [runRecords] */
function buildArtifactIndex(rootDir, runRecords = []) {
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const entries = [];
  for (const run of runRecords) {
    for (const artifact of toArray(run.artifacts)) {
      entries.push({
        artifact_id: artifact.id || `artifact-${hash(JSON.stringify(artifact))}`,
        run_id: run.run_id,
        workflow: run.workflow,
        type: artifact.type || 'unknown',
        path: artifact.path || null,
        created_at: artifact.created_at || run.updated_at || run.created_at,
        meta: artifact.meta || {},
      });
    }
  }
  const observabilityDir = resolveObservabilityDir(resolvedRoot);
  const knownFiles = [
    path.join(observabilityDir, 'events.ndjson'),
    path.join(observabilityDir, 'benchmarks', 'latest.json'),
    path.join(observabilityDir, 'release-rehearsals', 'latest.json'),
    path.join(observabilityDir, 'release-audits'),
  ];
  for (const filePath of knownFiles) {
    if (!fs.existsSync(filePath)) continue;
    const stat = fs.statSync(filePath);
    entries.push({
      artifact_id: `artifact-${hash(filePath)}`,
      run_id: null,
      workflow: 'platform',
      type: stat.isDirectory() ? 'directory' : 'file',
      path: path.relative(resolvedRoot, filePath),
      created_at: new Date(stat.mtimeMs).toISOString(),
      meta: { source: 'platform-index' },
    });
  }
  entries.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return {
    schema_name: 'platform_artifact_index',
    schema_version: '1.0',
    root_dir: resolvedRoot,
    count: entries.length,
    entries,
  };
}

/** @param {string} rootDir */
function buildTelemetrySummary(rootDir) {
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const kernelDir = resolveKernelDir(resolvedRoot);
  const kernelEvents = tryReadNdjson(resolveEventLogPath(resolvedRoot));
  const observabilityEvents = readEvents(resolvedRoot, { limit: 500, reverse: false });
  const benchmarks = readBenchmarkRuns(resolvedRoot, { limit: 20 });
  const latestObservabilityEvent = observabilityEvents.length > 0 ? observabilityEvents[observabilityEvents.length - 1] : null;
  return {
    schema_name: 'platform_telemetry_summary',
    schema_version: '1.0',
    root_dir: resolvedRoot,
    kernel_dir: kernelDir,
    kernel_event_count: kernelEvents.length,
    observability_event_count: observabilityEvents.length,
    benchmark_summary: summarizeBenchmarkRuns(benchmarks),
    latest_kernel_event_at: kernelEvents.length > 0 ? kernelEvents[kernelEvents.length - 1].ts : null,
    latest_observability_event_at: latestObservabilityEvent ? latestObservabilityEvent.at || null : null,
  };
}

module.exports = {
  buildRunSummary,
  buildRunTimeline,
  buildArtifactIndex,
  buildTelemetrySummary,
};
