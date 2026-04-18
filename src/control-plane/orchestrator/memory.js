const fs = require('fs');
const path = require('path');
const { formatManagedInvocation } = require('../../cli/runtime-paths.js');
const { getGitRepoState, diffRepoState } = require('../../core/project/git-state.js');
const { assessBenchmarkFeedback } = require('../../core/benchmark/feedback.js');
const { registerImplementationPlan, registerCoderRun, registerGateRun, loadActiveRunRecord, findLatestRunForFlow } = require('../kernel/orchestrator-kernel.js');

/**
 * @typedef {Record<string, unknown>} JsonObject
 * @typedef {{ implementation_plan_id?: string|null, coder_run_id?: string|null, eoc_run_id?: string|null, kernel_run_id?: string|null }} LatestIds
 * @typedef {{ flow?: string, objective?: string|null, plan_id?: string|null, coder_run_id?: string|null, eoc_run_id?: string|null, gate?: string|null, status?: string|null, failed_count?: number, round_count?: number, strategy_action?: string|null, strategy_confidence?: number|string|null, kernel_run_id?: string|null, updated_at?: string|null }} ActiveSummary
 * @typedef {{ schema_version: string, root_dir: string, updated_at: string, active_flow: string|null, latest_ids: LatestIds, active: ActiveSummary|null }} OrchestratorState
 * @typedef {{ run_id?: string|null, status?: string|null, failed_count?: number, round_count?: number, strategy_action?: string|null, strategy_confidence?: number|string|null }} CoderLoopRecord
 * @typedef {import('../../core/project/git-state.js').GitRepoState} GitRepoState
 * @typedef {{ recovery_baseline?: GitRepoState | null, snapshot_id?: string|null }} SafetyRecord
 * @typedef {{ runtime?: string|null, framework?: string|null }} ProfileRecord
 * @typedef {{ dir?: string|null, task_family?: string|null }} SelectedSkillRecord
 * @typedef {{ root_dir?: string, plan_id?: string|null, objective?: string|null, created_at?: string|null, coder_loop?: CoderLoopRecord|null, safety?: SafetyRecord|null, profile?: ProfileRecord|null, selected_skill?: SelectedSkillRecord|null, targets?: string[]|null }} PlanRecord
 * @typedef {{ action?: string|null, confidence?: number|string|null }} FailureStrategyRecord
 * @typedef {{ profile?: ProfileRecord|null }} RunContextRecord
 * @typedef {{ root_dir?: string, run_id?: string|null, objective?: string|null, status?: string|null, plan_id?: string|null, current_gate?: string|null, updated_at?: string|null, failure_strategy?: FailureStrategyRecord|null, latest_failures?: unknown[]|null, rounds?: unknown[]|null, context?: RunContextRecord|null }} RunRecord
 * @typedef {{ run_id?: string|null, flow?: string|null, pointers?: LatestIds|null }} KernelRunRecord
 */

function nowIso() {
  return new Date().toISOString();
}

/** @param {string} dir */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** @param {string} filePath @param {unknown} data */
function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** @param {string} filePath */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** @param {string} filePath */
function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return readJson(filePath);
  } catch {
    return null;
  }
}

/** @param {string | null | undefined} rootDir */
function resolveStateDir(rootDir) {
  return path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'orchestrator');
}

/** @param {string | null | undefined} rootDir */
function resolveStateFile(rootDir) {
  return path.join(resolveStateDir(rootDir), 'active.json');
}

/** @param {string | null | undefined} rootDir @returns {OrchestratorState} */
function readState(rootDir) {
  return /** @type {OrchestratorState | null} */ (tryReadJson(resolveStateFile(rootDir))) || {
    schema_version: '1.2',
    root_dir: path.resolve(rootDir || process.cwd()),
    updated_at: nowIso(),
    active_flow: null,
    latest_ids: {},
    active: null,
  };
}

/** @param {string | null | undefined} rootDir @param {OrchestratorState} state */
function writeState(rootDir, state) {
  const normalized = {
    schema_version: '1.2',
    root_dir: path.resolve(rootDir || process.cwd()),
    updated_at: nowIso(),
    active_flow: state.active_flow || null,
    latest_ids: state.latest_ids || {},
    active: state.active || null,
  };
  writeJson(resolveStateFile(rootDir), normalized);
  return normalized;
}

/** @param {string | null | undefined} rootDir @param {(state: OrchestratorState) => OrchestratorState} updater */
function updateState(rootDir, updater) {
  const current = readState(rootDir);
  const next = typeof updater === 'function' ? updater(current) || current : current;
  return writeState(rootDir, next);
}

/** @param {string | null | undefined} rootDir */
function planPointersPath(rootDir) {
  return path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'implementation-plans', 'latest.json');
}

/** @param {string | null | undefined} rootDir @param {PlanRecord} plan */
function writeLatestPlanPointer(rootDir, plan) {
  writeJson(planPointersPath(rootDir), {
    plan_id: plan.plan_id || null,
    objective: plan.objective || null,
    status: plan.coder_loop ? plan.coder_loop.status || null : null,
    coder_run_id: plan.coder_loop ? plan.coder_loop.run_id || null : null,
    updated_at: nowIso(),
  });
}

/** @param {PlanRecord} plan */
function rememberPlan(plan) {
  const rootDir = plan.root_dir || process.cwd();
  const kernelRun = /** @type {KernelRunRecord} */ (registerImplementationPlan(plan));
  writeLatestPlanPointer(rootDir, plan);
  return updateState(rootDir, (state) => ({
    ...state,
    active_flow: 'implementation',
    latest_ids: {
      ...state.latest_ids,
      implementation_plan_id: plan.plan_id || null,
      coder_run_id: plan.coder_loop ? plan.coder_loop.run_id || null : (state.latest_ids.coder_run_id || null),
      kernel_run_id: kernelRun.run_id || null,
    },
    active: {
      flow: 'implementation',
      objective: plan.objective || null,
      plan_id: plan.plan_id || null,
      coder_run_id: plan.coder_loop ? plan.coder_loop.run_id || null : null,
      status: plan.coder_loop ? plan.coder_loop.status || 'initialized' : 'initialized',
      kernel_run_id: kernelRun.run_id || null,
      updated_at: nowIso(),
    },
  }));
}

/** @param {RunRecord} run @param {{ plan_id?: string|null }} [extras] */
function rememberCoderRun(run, extras = {}) {
  const kernelRun = /** @type {KernelRunRecord} */ (registerCoderRun(run, extras));
  return updateState(run.root_dir || process.cwd(), (state) => ({
    ...state,
    active_flow: state.active_flow === 'gated_run' ? state.active_flow : 'implementation',
    latest_ids: {
      ...state.latest_ids,
      coder_run_id: run.run_id || null,
      implementation_plan_id: extras.plan_id || state.latest_ids.implementation_plan_id || null,
      kernel_run_id: kernelRun.run_id || null,
    },
    active: {
      flow: state.active_flow === 'gated_run' ? 'gated_run' : 'implementation',
      objective: run.objective || null,
      plan_id: extras.plan_id || (state.active && state.active.plan_id) || null,
      coder_run_id: run.run_id || null,
      status: run.status || null,
      strategy_action: run.failure_strategy ? run.failure_strategy.action || null : null,
      strategy_confidence: run.failure_strategy ? run.failure_strategy.confidence || null : null,
      kernel_run_id: kernelRun.run_id || null,
      updated_at: nowIso(),
    },
  }));
}

/** @param {RunRecord} run */
function rememberGateRun(run) {
  const rootDir = run.root_dir || process.cwd();
  const kernelRun = /** @type {KernelRunRecord} */ (registerGateRun(run));
  return updateState(rootDir, (state) => ({
    ...state,
    active_flow: 'gated_run',
    latest_ids: {
      ...state.latest_ids,
      eoc_run_id: run.run_id || null,
      implementation_plan_id: run.plan_id || state.latest_ids.implementation_plan_id || null,
      kernel_run_id: kernelRun.run_id || null,
    },
    active: {
      flow: 'gated_run',
      objective: run.objective || null,
      plan_id: run.plan_id || null,
      eoc_run_id: run.run_id || null,
      gate: run.current_gate || null,
      status: run.status || null,
      strategy_action: run.failure_strategy ? run.failure_strategy.action || null : null,
      strategy_confidence: run.failure_strategy ? run.failure_strategy.confidence || null : null,
      kernel_run_id: kernelRun.run_id || null,
      updated_at: nowIso(),
    },
  }));
}

/** @param {string | null | undefined} rootDir */
function readLatestPlanId(rootDir) {
  const latest = /** @type {{ plan_id?: string|null } | null} */ (tryReadJson(planPointersPath(rootDir)));
  return latest && latest.plan_id ? latest.plan_id : null;
}

/** @param {string | null | undefined} rootDir @param {string | null | undefined} planId @returns {PlanRecord | null} */
function readPlanById(rootDir, planId) {
  if (!planId) return null;
  return /** @type {PlanRecord | null} */ (tryReadJson(path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'implementation-plans', planId, 'plan.json')));
}

/** @param {string | null | undefined} rootDir @returns {PlanRecord | null} */
function scanLatestPlan(rootDir) {
  const plansDir = path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'implementation-plans');
  if (!fs.existsSync(plansDir)) return null;
  const dirs = fs.readdirSync(plansDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(plansDir, entry.name, 'plan.json'))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => {
      const stat = fs.statSync(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const latestDir = dirs[0];
  if (!latestDir) return null;
  return /** @type {PlanRecord | null} */ (tryReadJson(latestDir.filePath));
}

/** @param {string | null | undefined} rootDir @returns {RunRecord | null} */
function readLatestCoderRun(rootDir) {
  const latest = /** @type {{ run_id?: string|null } | null} */ (tryReadJson(path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'coder-loop', 'latest.json')));
  if (!latest || !latest.run_id) return null;
  return /** @type {RunRecord | null} */ (tryReadJson(path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'coder-loop', `${latest.run_id}.json`)));
}

/** @param {string | null | undefined} rootDir @returns {RunRecord | null} */
function readActiveGateRun(rootDir) {
  const active = /** @type {{ run_id?: string|null } | null} */ (tryReadJson(path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'eoc-run', 'active.json')));
  if (!active || !active.run_id) return null;
  return /** @type {RunRecord | null} */ (tryReadJson(path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'eoc-run', `${active.run_id}.json`)));
}

/** @param {string | null | undefined} rootDir @param {PlanRecord | null} plan */
function assessPlanRecovery(rootDir, plan) {
  const baseline = plan && plan.safety && plan.safety.recovery_baseline ? plan.safety.recovery_baseline : null;
  const current = getGitRepoState(rootDir || process.cwd(), plan && plan.targets ? plan.targets : []);
  const assessment = diffRepoState(baseline || null, current);
  return {
    ...assessment,
    current_branch: current.branch,
    current_head: current.head,
    current_dirty: current.dirty,
    snapshot_id: plan && plan.safety ? plan.safety.snapshot_id || null : null,
  };
}

/** @param {string | null | undefined} rootDir */
function buildRecovery(rootDir) {
  const state = readState(rootDir);
  const activeKernelRun = /** @type {KernelRunRecord | null} */ (loadActiveRunRecord(rootDir || process.cwd()));
  const latestImplKernelRun = /** @type {KernelRunRecord | null} */ (findLatestRunForFlow(rootDir || process.cwd(), 'implementation'));
  const latestGateKernelRun = /** @type {KernelRunRecord | null} */ (findLatestRunForFlow(rootDir || process.cwd(), 'gated_run'));
  const planId = state.latest_ids.implementation_plan_id
    || (activeKernelRun && activeKernelRun.pointers ? activeKernelRun.pointers.implementation_plan_id || null : null)
    || (latestImplKernelRun && latestImplKernelRun.pointers ? latestImplKernelRun.pointers.implementation_plan_id || null : null)
    || readLatestPlanId(rootDir);
  const plan = readPlanById(rootDir, planId) || scanLatestPlan(rootDir);
  const coderRun = readLatestCoderRun(rootDir);
  const gateRun = readActiveGateRun(rootDir);
  const activeFlow = state.active_flow || (activeKernelRun ? activeKernelRun.flow || null : null) || (gateRun ? 'gated_run' : (plan || coderRun ? 'implementation' : null));
  const hasState = Boolean(plan || coderRun || gateRun || activeKernelRun || latestImplKernelRun || latestGateKernelRun);

  /** @type {ActiveSummary | null} */
  let summary = null;
  /** @type {string[]} */
  let commands = [];
  /** @type {JsonObject | null} */
  let recoveryAssessment = null;

  if (plan) {
    recoveryAssessment = /** @type {JsonObject} */ (assessPlanRecovery(rootDir, plan));
  }

  if (activeFlow === 'gated_run' && gateRun) {
    summary = {
      flow: 'gated_run',
      objective: gateRun.objective || null,
      eoc_run_id: gateRun.run_id || null,
      plan_id: gateRun.plan_id || null,
      gate: gateRun.current_gate || null,
      status: gateRun.status || null,
      kernel_run_id: activeKernelRun ? activeKernelRun.run_id || null : (latestGateKernelRun ? latestGateKernelRun.run_id || null : null),
      updated_at: gateRun.updated_at || null,
    };
    commands = [
      formatManagedInvocation('eoc-start', ['status'], { cwd: rootDir || process.cwd() }),
      formatManagedInvocation('eoc-start', ['advance'], { cwd: rootDir || process.cwd() }),
    ];
  } else if (plan || coderRun) {
    summary = {
      flow: 'implementation',
      objective: (plan && plan.objective) || (coderRun && coderRun.objective) || null,
      plan_id: plan ? plan.plan_id || null : null,
      coder_run_id: (plan && plan.coder_loop && plan.coder_loop.run_id) || (coderRun && coderRun.run_id) || null,
      status: (plan && plan.coder_loop && plan.coder_loop.status) || (coderRun && coderRun.status) || 'initialized',
      failed_count: (plan && plan.coder_loop && plan.coder_loop.failed_count) || ((coderRun && coderRun.latest_failures && coderRun.latest_failures.length) || 0),
      round_count: (plan && plan.coder_loop && plan.coder_loop.round_count) || ((coderRun && coderRun.rounds && coderRun.rounds.length) || 0),
      updated_at: (plan && plan.created_at) || (coderRun && coderRun.updated_at) || null,
      strategy_action: (plan && plan.coder_loop && plan.coder_loop.strategy_action) || (coderRun && coderRun.failure_strategy && coderRun.failure_strategy.action) || null,
      strategy_confidence: (plan && plan.coder_loop && plan.coder_loop.strategy_confidence) || (coderRun && coderRun.failure_strategy && coderRun.failure_strategy.confidence) || null,
      kernel_run_id: activeKernelRun ? activeKernelRun.run_id || null : (latestImplKernelRun ? latestImplKernelRun.run_id || null : null),
    };
    if (summary && summary.strategy_action && summary.status !== 'green') {
      commands.push(formatManagedInvocation('failure-strategy', ['report', ...(summary.coder_run_id ? ['--run-id', summary.coder_run_id] : [])], { cwd: rootDir || process.cwd() }));
    }
    if (recoveryAssessment && recoveryAssessment.recommended_action === 'resume') {
      const implSummary = /** @type {ActiveSummary} */ (summary);
      commands = [
        formatManagedInvocation('implement-task', ['status', ...(implSummary.plan_id ? ['--plan-id', implSummary.plan_id] : [])], { cwd: rootDir || process.cwd() }),
        formatManagedInvocation('implement-task', ['next-prompt', ...(implSummary.plan_id ? ['--plan-id', implSummary.plan_id] : [])], { cwd: rootDir || process.cwd() }),
      ];
      if (implSummary.coder_run_id) {
        commands.push(formatManagedInvocation('coder-loop', ['run', '--run-id', implSummary.coder_run_id, '--root', rootDir || process.cwd(), '--emit-prompt'], { cwd: rootDir || process.cwd() }));
      }
    } else if (recoveryAssessment && recoveryAssessment.recommended_action === 'rebuild_context') {
      const implSummary = /** @type {ActiveSummary} */ (summary);
      commands = [
        formatManagedInvocation('coder-context', ['--objective', implSummary.objective || 'continue task', '--root', rootDir || process.cwd(), '--targets', (plan && plan.targets ? plan.targets.join(',') : '')], { cwd: rootDir || process.cwd() }),
        formatManagedInvocation('implement-task', ['run', '--objective', implSummary.objective || 'continue task', '--root', rootDir || process.cwd()], { cwd: rootDir || process.cwd() }),
      ];
    } else if (recoveryAssessment && recoveryAssessment.recommended_action === 'new_plan') {
      const implSummary = /** @type {ActiveSummary} */ (summary);
      commands = [
        formatManagedInvocation('implement-task', ['run', '--objective', implSummary.objective || 'continue task', '--root', rootDir || process.cwd()], { cwd: rootDir || process.cwd() }),
      ];
    }
    if (plan && plan.safety && plan.safety.snapshot_id) {
      commands.push(formatManagedInvocation('safe-apply', ['status', '--snapshot-id', plan.safety.snapshot_id], { cwd: rootDir || process.cwd() }));
      commands.push(formatManagedInvocation('safe-apply', ['rollback', '--snapshot-id', plan.safety.snapshot_id, '--dry-run'], { cwd: rootDir || process.cwd() }));
    }
  }

  const benchmarkFeedback = (plan || coderRun || gateRun) ? assessBenchmarkFeedback(rootDir || process.cwd(), {
    objective: summary && summary.objective ? summary.objective : null,
    runtime: (plan && plan.profile && plan.profile.runtime) || (coderRun && coderRun.context && coderRun.context.profile && coderRun.context.profile.runtime) || null,
    framework: (plan && plan.profile && plan.profile.framework) || (coderRun && coderRun.context && coderRun.context.profile && coderRun.context.profile.framework) || null,
    skill: (plan && plan.selected_skill && plan.selected_skill.dir) || null,
    task_family: (plan && plan.selected_skill && plan.selected_skill.task_family) || null,
  }) : null;
  if (benchmarkFeedback && Array.isArray(benchmarkFeedback.commands)) {
    for (const command of benchmarkFeedback.commands) {
      if (typeof command === 'string' && !commands.includes(command)) commands.push(command);
    }
  }

  return {
    schema_version: '1.2',
    root_dir: path.resolve(rootDir || process.cwd()),
    has_recoverable_state: hasState,
    active_flow: activeFlow,
    active: summary,
    latest_ids: {
      implementation_plan_id: plan ? plan.plan_id || null : null,
      coder_run_id: coderRun ? coderRun.run_id || null : null,
      eoc_run_id: gateRun ? gateRun.run_id || null : null,
      kernel_run_id: activeKernelRun ? activeKernelRun.run_id || null : ((activeFlow === 'gated_run' && latestGateKernelRun) ? latestGateKernelRun.run_id || null : (latestImplKernelRun ? latestImplKernelRun.run_id || null : null)),
    },
    recovery_assessment: recoveryAssessment,
    benchmark_feedback: benchmarkFeedback,
    commands,
  };
}

module.exports = {
  readState,
  writeState,
  updateState,
  rememberPlan,
  rememberCoderRun,
  rememberGateRun,
  readLatestPlanId,
  readPlanById,
  buildRecovery,
  writeLatestPlanPointer,
};
