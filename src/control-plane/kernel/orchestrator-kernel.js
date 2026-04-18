const path = require('path');
const { createRunRecord, saveRunRecord, updateRunRecord, loadActiveRunRecord, listRunRecords } = require('./run-store.js');
const { appendKernelEvent } = require('./event-log.js');
const { mapImplementationStatus, mapGateStatus } = require('./state-machine.js');

const { nowIso } = require('../../shared/time.js');

/** @typedef {import('./run-store.js').RunRecord} RunRecord */
/** @typedef {{ run_id?: string | null, status?: string | null, failed_count?: number | null, round_count?: number | null, strategy_action?: string | null, strategy_confidence?: string | number | null }} PlanCoderLoop */
/** @typedef {{ context?: string | null, next_prompt?: string | null }} PlanFiles */
/** @typedef {{ snapshot_id?: string | null, snapshot_status?: string | null, recovery_baseline?: unknown, }} PlanSafety */
/** @typedef {{ plan_id?: string | null, created_at?: string | null, root_dir?: string | null, objective?: string | null, profile?: Record<string, unknown> | null, selected_skill?: unknown, benchmark_feedback?: unknown, execution_policy?: Record<string, unknown> | null, files?: PlanFiles | null, safety?: PlanSafety | null, coder_loop?: PlanCoderLoop | null }} ImplementationPlan */
/** @typedef {{ action?: string | null, confidence?: string | number | null }} RunFailureStrategy */
/** @typedef {{ root_dir?: string | null, run_id?: string | null, objective?: string | null, status?: string | null, created_at?: string | null, context?: Record<string, unknown> | null, latest_failures?: unknown[] | null, rounds?: unknown[] | null, failure_strategy?: RunFailureStrategy | null }} CoderRunLike */
/** @typedef {{ root_dir?: string | null, run_id?: string | null, objective?: string | null, status?: string | null, created_at?: string | null, plan_id?: string | null, current_gate?: string | null, failure_strategy?: RunFailureStrategy | null }} GateRunLike */
/** @typedef {{ kernel_run_id?: string | null, flow?: string | null, plan_id?: string | null }} RegisterCoderRunExtras */

/** @param {ImplementationPlan} plan */
function deriveImplementationSteps(plan) {
  const steps = [];
  steps.push({
    step_id: 'plan',
    kind: 'plan',
    status: 'succeeded',
    started_at: plan.created_at || nowIso(),
    ended_at: plan.created_at || nowIso(),
    summary: `Implementation plan ${plan.plan_id}`,
  });
  if (plan.coder_loop && plan.coder_loop.run_id) {
    steps.push({
      step_id: 'coder-loop',
      kind: 'execution',
      status: plan.coder_loop.status === 'green' ? 'succeeded' : (plan.coder_loop.status === 'red' ? 'failed' : 'running'),
      started_at: plan.created_at || nowIso(),
      ended_at: plan.coder_loop.status === 'green' || plan.coder_loop.status === 'red' ? nowIso() : null,
      summary: `Coder loop ${plan.coder_loop.run_id}`,
      metrics: {
        failed_count: plan.coder_loop.failed_count || 0,
        round_count: plan.coder_loop.round_count || 0,
      },
    });
  }
  return steps;
}

/** @param {ImplementationPlan} plan */
function registerImplementationPlan(plan) {
  const rootDir = path.resolve(plan.root_dir || process.cwd());
  const run = createRunRecord({
    run_id: `impl-${String(plan.plan_id || 'unknown')}`,
    workflow: 'implement-task',
    flow: 'implementation',
    objective: plan.objective || null,
    status: mapImplementationStatus(plan.coder_loop ? plan.coder_loop.status : 'initialized'),
    source_kind: 'implementation_plan',
    source_id: String(plan.plan_id || 'unknown'),
    root_dir: rootDir,
    ...(plan.created_at ? { created_at: plan.created_at } : {}),
    context: {
      profile: plan.profile || {},
      selected_skill: plan.selected_skill || null,
      benchmark_feedback: plan.benchmark_feedback || null,
      execution_policy: plan.execution_policy || {},
    },
    pointers: {
      implementation_plan_id: String(plan.plan_id || 'unknown'),
      coder_run_id: plan.coder_loop ? plan.coder_loop.run_id : null,
      latest_prompt: plan.files ? plan.files.next_prompt || null : null,
      context_file: plan.files ? plan.files.context || null : null,
    },
    artifacts: [
      ...(plan.files && plan.files.context ? [{ type: 'context', path: plan.files.context }] : []),
      ...(plan.files && plan.files.next_prompt ? [{ type: 'next_prompt', path: plan.files.next_prompt }] : []),
    ],
    policy_snapshot: plan.execution_policy || {},
    recovery: {
      snapshot_id: plan.safety ? plan.safety.snapshot_id || null : null,
      snapshot_status: plan.safety ? plan.safety.snapshot_status || null : null,
      recovery_baseline: plan.safety ? plan.safety.recovery_baseline || null : null,
    },
    summary: {
      failed_count: plan.coder_loop ? plan.coder_loop.failed_count || 0 : 0,
      round_count: plan.coder_loop ? plan.coder_loop.round_count || 0 : 0,
      strategy_action: plan.coder_loop ? plan.coder_loop.strategy_action || null : null,
      strategy_confidence: plan.coder_loop ? plan.coder_loop.strategy_confidence || null : null,
    },
    steps: deriveImplementationSteps(plan),
  });
  const saved = saveRunRecord(run);
  appendKernelEvent(rootDir, {
    event_type: 'kernel.run.registered',
    run_id: saved.run_id,
    workflow: saved.workflow,
    flow: saved.flow,
    source_kind: saved.source_kind,
    source_id: saved.source_id,
    status: saved.status,
  });
  return saved;
}

/** @param {CoderRunLike} run @param {RegisterCoderRunExtras} [extras] @returns {RunRecord} */
function registerCoderRun(run, extras = {}) {
  const rootDir = path.resolve(run.root_dir || process.cwd());
  const runId = String(run.run_id || 'unknown');
  const kernelRunId = String(extras.kernel_run_id || `coder-${runId}`);
  const existing = listRunRecords(rootDir).find((item) => item.source_kind === 'coder_run' && item.source_id === runId);
  if (!existing) {
    const created = createRunRecord({
      run_id: kernelRunId,
      workflow: 'coder-loop',
      flow: extras.flow || 'implementation',
      objective: run.objective || null,
      status: mapImplementationStatus(run.status),
      source_kind: 'coder_run',
      source_id: runId,
      root_dir: rootDir,
      ...(run.created_at ? { created_at: run.created_at } : {}),
      context: run.context || {},
      pointers: {
        coder_run_id: runId,
        implementation_plan_id: extras.plan_id || null,
      },
      summary: {
        latest_failures: run.latest_failures || [],
        round_count: Array.isArray(run.rounds) ? run.rounds.length : 0,
        strategy_action: run.failure_strategy ? run.failure_strategy.action || null : null,
        strategy_confidence: run.failure_strategy ? run.failure_strategy.confidence || null : null,
      },
      steps: [{
        step_id: 'coder-loop',
        kind: 'execution',
        status: run.status === 'green' ? 'succeeded' : (run.status === 'red' ? 'failed' : 'running'),
        started_at: run.created_at || nowIso(),
        ended_at: run.status === 'green' || run.status === 'red' ? nowIso() : null,
        summary: `Coder loop ${runId}`,
      }],
    });
    const saved = saveRunRecord(created);
    appendKernelEvent(rootDir, {
      event_type: 'kernel.run.registered',
      run_id: saved.run_id,
      workflow: saved.workflow,
      flow: saved.flow,
      source_kind: saved.source_kind,
      source_id: saved.source_id,
      status: saved.status,
    });
    return saved;
  }
  const updated = updateRunRecord(rootDir, existing.run_id, (current) => ({
    ...current,
    objective: run.objective || null,
    status: mapImplementationStatus(run.status),
    context: run.context || current.context,
    pointers: {
      ...current.pointers,
      coder_run_id: runId,
      implementation_plan_id: extras.plan_id || current.pointers.implementation_plan_id || null,
    },
    summary: {
      ...current.summary,
      latest_failures: run.latest_failures || [],
      round_count: Array.isArray(run.rounds) ? run.rounds.length : 0,
      strategy_action: run.failure_strategy ? run.failure_strategy.action || null : null,
      strategy_confidence: run.failure_strategy ? run.failure_strategy.confidence || null : null,
    },
    steps: [{
      step_id: 'coder-loop',
      kind: 'execution',
      status: run.status === 'green' ? 'succeeded' : (run.status === 'red' ? 'failed' : 'running'),
      started_at: current.created_at || run.created_at || nowIso(),
      ended_at: run.status === 'green' || run.status === 'red' ? nowIso() : null,
      summary: `Coder loop ${runId}`,
    }],
    latest_event: 'coder-loop.updated',
  }));
  appendKernelEvent(rootDir, {
    event_type: 'kernel.run.updated',
    run_id: updated.run_id,
    workflow: updated.workflow,
    flow: updated.flow,
    source_kind: updated.source_kind,
    source_id: updated.source_id,
    status: updated.status,
  });
  return updated;
}

/** @param {GateRunLike} run @returns {RunRecord} */
function registerGateRun(run) {
  const rootDir = path.resolve(run.root_dir || process.cwd());
  const runId = String(run.run_id || 'unknown');
  const existing = listRunRecords(rootDir).find((item) => item.source_kind === 'gate_run' && item.source_id === runId);
  if (!existing) {
    const created = createRunRecord({
      run_id: `gate-${runId}`,
      workflow: 'gated-run',
      flow: 'gated_run',
      objective: run.objective || null,
      status: mapGateStatus(run.status),
      source_kind: 'gate_run',
      source_id: runId,
      root_dir: rootDir,
      ...(run.created_at ? { created_at: run.created_at } : {}),
      pointers: {
        eoc_run_id: runId,
        implementation_plan_id: run.plan_id || null,
      },
      summary: {
        gate: run.current_gate || null,
        strategy_action: run.failure_strategy ? run.failure_strategy.action || null : null,
        strategy_confidence: run.failure_strategy ? run.failure_strategy.confidence || null : null,
      },
      steps: [{
        step_id: 'gate',
        kind: 'review',
        status: run.status === 'passed' ? 'succeeded' : (run.status === 'failed' ? 'failed' : 'running'),
        started_at: run.created_at || nowIso(),
        ended_at: run.status === 'passed' || run.status === 'failed' ? nowIso() : null,
        summary: `Gate ${run.current_gate || 'unknown'}`,
      }],
    });
    const saved = saveRunRecord(created);
    appendKernelEvent(rootDir, {
      event_type: 'kernel.run.registered',
      run_id: saved.run_id,
      workflow: saved.workflow,
      flow: saved.flow,
      source_kind: saved.source_kind,
      source_id: saved.source_id,
      status: saved.status,
    });
    return saved;
  }
  const updated = updateRunRecord(rootDir, existing.run_id, (current) => ({
    ...current,
    objective: run.objective || null,
    status: mapGateStatus(run.status),
    pointers: {
      ...current.pointers,
      eoc_run_id: runId,
      implementation_plan_id: run.plan_id || current.pointers.implementation_plan_id || null,
    },
    summary: {
      ...current.summary,
      gate: run.current_gate || null,
      strategy_action: run.failure_strategy ? run.failure_strategy.action || null : null,
      strategy_confidence: run.failure_strategy ? run.failure_strategy.confidence || null : null,
    },
  }));
  appendKernelEvent(rootDir, {
    event_type: 'kernel.run.updated',
    run_id: updated.run_id,
    workflow: updated.workflow,
    flow: updated.flow,
    source_kind: updated.source_kind,
    source_id: updated.source_id,
    status: updated.status,
  });
  return updated;
}

/** @param {string} rootDir @param {string} flow */
function findLatestRunForFlow(rootDir, flow) {
  return listRunRecords(rootDir).find((item) => item.flow === flow) || null;
}

module.exports = {
  registerImplementationPlan,
  registerCoderRun,
  registerGateRun,
  loadActiveRunRecord,
  findLatestRunForFlow,
};
