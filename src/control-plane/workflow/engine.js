const fs = require('fs');
const path = require('path');
const { appendKernelEvent } = require('../kernel/event-log.js');
const { nowIso } = require('../../shared/time.js');
const { ensureDir } = require('../../shared/fs.js');

/**
 * @typedef {Record<string, unknown>} WorkflowContext
 * @typedef {{ workflow: WorkflowDefinition, trace: WorkflowTrace, rootDir: string, traceId: string }} WorkflowStepMeta
 * @typedef {{ context?: WorkflowContext, outputs?: Record<string, unknown>, summary?: string | null | Promise<string> }} WorkflowStepResult
 * @typedef {{ id: string, title?: string, when?: (context: WorkflowContext) => boolean, run?: (context: WorkflowContext, meta: WorkflowStepMeta) => Promise<WorkflowStepResult | null> | WorkflowStepResult | null }} WorkflowStep
 * @typedef {{ id: string, title?: string, version?: string, steps?: WorkflowStep[] }} WorkflowDefinition
 * @typedef {{ step_id: string, title: string, status: string, started_at: string | null, finished_at: string | null, summary: string | null, outputs: Record<string, unknown> }} WorkflowTraceStep
 * @typedef {{ schema_version: string, trace_id: string, workflow_id: string, title: string, version: string, root_dir: string, run_id: string | null, started_at: string, finished_at: string | null, status: string, steps: WorkflowTraceStep[] }} WorkflowTrace
 * @typedef {{ context?: WorkflowContext, rootDir?: string, traceId?: string, runId?: string }} ExecuteWorkflowOptions
 */

/** @param {WorkflowDefinition} definition @returns {WorkflowDefinition & { steps: WorkflowStep[], title: string, version: string }} */
function defineWorkflow(definition) {
  if (!definition || !definition.id) throw new Error('workflow id is required');
  return {
    id: definition.id,
    title: definition.title || definition.id,
    version: definition.version || '1.0',
    steps: Array.isArray(definition.steps) ? definition.steps : [],
  };
}

/** @param {string} rootDir @param {string} workflowId @param {string} traceId */
function resolveTracePath(rootDir, workflowId, traceId) {
  return path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'workflows', workflowId, `${traceId}.json`);
}

/** @param {WorkflowStep | null | undefined} step @param {WorkflowContext} context */
function shouldRunStep(step, context) {
  if (!step) return false;
  if (typeof step.when !== 'function') return true;
  return Boolean(step.when(context));
}

/** @param {WorkflowStep} step @param {unknown} result @returns {WorkflowStepResult | null} */
function validateStepResult(step, result) {
  if (result == null) return null;
  if (typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`workflow step ${step.id} must return an object when a result is provided`);
  }
  const typed = /** @type {WorkflowStepResult} */ (result);
  if (typed.context != null && (typeof typed.context !== 'object' || Array.isArray(typed.context))) {
    throw new Error(`workflow step ${step.id} returned invalid context`);
  }
  if (typed.outputs != null && (typeof typed.outputs !== 'object' || Array.isArray(typed.outputs))) {
    throw new Error(`workflow step ${step.id} returned invalid outputs`);
  }
  if (typed.summary && typeof /** @type {any} */ (typed.summary).then === 'function') {
    throw new Error(`workflow step ${step.id} returned a Promise as summary; await it before returning`);
  }
  return typed;
}

/** @param {string} rootDir @param {string} workflowId @param {string} traceId @param {WorkflowTrace} trace */
function persistWorkflowTrace(rootDir, workflowId, traceId, trace) {
  const tracePath = resolveTracePath(rootDir, workflowId, traceId);
  ensureDir(path.dirname(tracePath));
  fs.writeFileSync(tracePath, `${JSON.stringify(trace, null, 2)}\n`, 'utf8');
  return tracePath;
}

/** @param {string} rootDir @param {string} workflowId @param {string} traceId @param {WorkflowTrace} trace */
function persistTraceSnapshot(rootDir, workflowId, traceId, trace) {
  persistWorkflowTrace(rootDir, workflowId, traceId, trace);
}

/** @param {unknown} error */
function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error || 'workflow step failed');
}

/** @param {WorkflowDefinition & { steps: WorkflowStep[], title: string, version: string }} workflow @param {ExecuteWorkflowOptions} [options] */
async function executeWorkflow(workflow, options = {}) {
  const context = options.context || {};
  const contextRootDir = typeof context.rootDir === 'string' ? context.rootDir : null;
  const contextRunId = typeof context.runId === 'string' ? context.runId : null;
  const rootDir = path.resolve(options.rootDir || contextRootDir || process.cwd());
  const traceId = options.traceId || `${workflow.id}-${Date.now()}`;
  /** @type {WorkflowTrace} */
  const trace = {
    schema_version: '1.1',
    trace_id: traceId,
    workflow_id: workflow.id,
    title: workflow.title,
    version: workflow.version,
    root_dir: rootDir,
    run_id: options.runId || contextRunId || null,
    started_at: nowIso(),
    finished_at: null,
    status: 'running',
    steps: [],
  };

  appendKernelEvent(rootDir, {
    event_type: 'workflow.started',
    workflow_id: workflow.id,
    trace_id: traceId,
    run_id: trace.run_id,
  });
  persistTraceSnapshot(rootDir, workflow.id, traceId, trace);

  for (const step of workflow.steps) {
    /** @type {WorkflowTraceStep} */
    const entry = {
      step_id: step.id,
      title: step.title || step.id,
      status: 'pending',
      started_at: null,
      finished_at: null,
      summary: null,
      outputs: {},
    };
    trace.steps.push(entry);
    persistTraceSnapshot(rootDir, workflow.id, traceId, trace);

    if (!shouldRunStep(step, context)) {
      entry.status = 'skipped';
      entry.started_at = nowIso();
      entry.finished_at = nowIso();
      entry.summary = 'Skipped by condition';
      appendKernelEvent(rootDir, {
        event_type: 'workflow.step.skipped',
        workflow_id: workflow.id,
        trace_id: traceId,
        step_id: step.id,
        run_id: trace.run_id,
      });
      persistTraceSnapshot(rootDir, workflow.id, traceId, trace);
      continue;
    }

    entry.status = 'running';
    entry.started_at = nowIso();
    appendKernelEvent(rootDir, {
      event_type: 'workflow.step.started',
      workflow_id: workflow.id,
      trace_id: traceId,
      step_id: step.id,
      run_id: trace.run_id,
    });
    persistTraceSnapshot(rootDir, workflow.id, traceId, trace);

    try {
      const rawResult = typeof step.run === 'function'
        ? await step.run(context, {
          workflow,
          trace,
          rootDir,
          traceId,
        })
        : null;
      const result = validateStepResult(step, rawResult);
      if (result && result.context && typeof result.context === 'object') {
        Object.assign(context, result.context);
      }
      if (result && result.outputs && typeof result.outputs === 'object') {
        entry.outputs = result.outputs;
      }
      if (result && typeof result.summary === 'string') entry.summary = result.summary;
      entry.status = 'succeeded';
      entry.finished_at = nowIso();
      if (!entry.summary) entry.summary = 'Completed';
      appendKernelEvent(rootDir, {
        event_type: 'workflow.step.completed',
        workflow_id: workflow.id,
        trace_id: traceId,
        step_id: step.id,
        run_id: trace.run_id,
        summary: entry.summary,
      });
      persistTraceSnapshot(rootDir, workflow.id, traceId, trace);
    } catch (error) {
      entry.status = 'failed';
      entry.finished_at = nowIso();
      entry.summary = getErrorMessage(error);
      appendKernelEvent(rootDir, {
        event_type: 'workflow.step.failed',
        workflow_id: workflow.id,
        trace_id: traceId,
        step_id: step.id,
        run_id: trace.run_id,
        summary: entry.summary,
      });
      trace.status = 'failed';
      trace.finished_at = nowIso();
      persistTraceSnapshot(rootDir, workflow.id, traceId, trace);
      throw error;
    }
  }

  trace.status = 'succeeded';
  trace.finished_at = nowIso();
  persistTraceSnapshot(rootDir, workflow.id, traceId, trace);
  appendKernelEvent(rootDir, {
    event_type: 'workflow.completed',
    workflow_id: workflow.id,
    trace_id: traceId,
    run_id: trace.run_id,
    status: trace.status,
  });
  return { context, trace };
}

module.exports = {
  defineWorkflow,
  executeWorkflow,
  persistWorkflowTrace,
  resolveTracePath,
};
