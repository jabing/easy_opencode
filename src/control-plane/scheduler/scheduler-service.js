const { toBool } = require('../../shared/cli.js');
const { nowIso } = require('../../shared/time.js');
const { depList, isTerminal, validateTasks, detectCycles, buildDescendants, nextRunnable, propagateDependencySkips, refreshMetrics } = require('./task-graph.js');
const { executeTaskAttempt } = require('./task-executor.js');

/**
 * @typedef {{
 *   task_id: string,
 *   status: string,
 *   deps?: string[],
 *   command?: string,
 *   validation?: string,
 *   workdir?: string,
 *   timeout_sec?: number,
 *   retries?: number,
 *   priority?: number,
 *   attempts?: number,
 *   last_error?: string,
 *   ended_at?: string | null
 * }} SchedulerTask
 * @typedef {{ total: number, queued: number, running: number, success: number, failed: number, skipped: number, retried: number, timed_out: number }} SchedulerMetrics
 * @typedef {{ concurrency: number, fast_fail: boolean, tasks: Record<string, SchedulerTask>, started_at: string | null, ended_at: string | null, status: string, errors: string[], metrics: SchedulerMetrics }} SchedulerState
 * @typedef {{ run_id?: string | null, root_dir?: string, scheduler?: SchedulerState }} SchedulerRun
 * @typedef {{
 *   execPolicy: { validateSchedulerLimits: (taskCount: number, concurrency: number, policy: unknown) => void },
 *   loadCommandPolicy: () => unknown,
 *   saveRun?: (runDir: string, run: SchedulerRun) => void,
 *   rootDir?: string,
 *   runDir?: string,
 *   ensureTaskCtx?: (runDir: string, runId: string | null | undefined, taskId: string) => string,
 * }} SchedulerDependencies
 */

/** @returns {SchedulerMetrics} */
function emptyMetrics() {
  return { total: 0, queued: 0, running: 0, success: 0, failed: 0, skipped: 0, retried: 0, timed_out: 0 };
}

/** @param {SchedulerRun} run @param {unknown} concurrency @param {unknown} fastFail @param {SchedulerDependencies} dependencies @returns {SchedulerState} */
function initScheduler(run, concurrency, fastFail, dependencies) {
  const { execPolicy, loadCommandPolicy } = dependencies;
  const policy = loadCommandPolicy();
  const requestedConcurrency = Number(concurrency) || 2;
  execPolicy.validateSchedulerLimits(Object.keys(run.scheduler?.tasks || {}).length, requestedConcurrency, policy);
  if (!run.scheduler) {
    run.scheduler = {
      concurrency: requestedConcurrency,
      fast_fail: toBool(fastFail),
      tasks: {},
      started_at: null,
      ended_at: null,
      status: 'idle',
      errors: [],
      metrics: emptyMetrics(),
    };
    return run.scheduler;
  }
  if (concurrency !== undefined) {
    const nextConcurrency = Number(concurrency) || run.scheduler.concurrency || 2;
    execPolicy.validateSchedulerLimits(Object.keys(run.scheduler.tasks || {}).length, nextConcurrency, policy);
    run.scheduler.concurrency = nextConcurrency;
  }
  if (fastFail !== undefined) run.scheduler.fast_fail = toBool(fastFail);
  if (!run.scheduler.metrics) run.scheduler.metrics = emptyMetrics();
  if (!Array.isArray(run.scheduler.errors)) run.scheduler.errors = [];
  return run.scheduler;
}

/** @param {SchedulerTask} task @param {SchedulerRun} run @param {string} rootDir @param {string} runDir @param {boolean} simulate @param {(runDir: string, runId: string | null | undefined, taskId: string) => string} ensureTaskCtx */
async function launchTaskAttempt(task, run, rootDir, runDir, simulate, ensureTaskCtx) {
  await executeTaskAttempt({ task, run, rootDir: run.root_dir || rootDir, runDir, simulate, ensureTaskCtx });
}

/** @param {SchedulerRun} run @param {boolean} simulate @param {unknown} fastFailOverride @param {SchedulerDependencies} dependencies */
async function runScheduler(run, simulate, fastFailOverride, dependencies) {
  const { saveRun, execPolicy, loadCommandPolicy, rootDir = '', runDir = '', ensureTaskCtx = () => '' } = dependencies;
  initScheduler(run, run.scheduler?.concurrency || 2, run.scheduler?.fast_fail, dependencies);
  if (!run.scheduler) return;
  if (fastFailOverride !== undefined) run.scheduler.fast_fail = toBool(fastFailOverride);

  const sch = run.scheduler;
  const tasks = sch.tasks;
  sch.status = 'running';
  sch.started_at = sch.started_at || nowIso();

  const integrityErrors = validateTasks(tasks, execPolicy, loadCommandPolicy(), rootDir);
  const cycle = detectCycles(tasks);
  if (cycle) integrityErrors.push(`dependency cycle detected: ${cycle}`);
  if (integrityErrors.length > 0) {
    sch.status = 'blocked';
    sch.errors.push(...integrityErrors.map((error) => `${nowIso()} ${error}`));
    refreshMetrics(sch, tasks);
    sch.ended_at = nowIso();
    if (saveRun) saveRun(runDir, run);
    return;
  }

  const descendants = buildDescendants(tasks);
  /** @type {Map<string, Promise<void>>} */
  const active = new Map();

  while (true) {
    propagateDependencySkips(tasks);
    refreshMetrics(sch, tasks);

    const hasFailed = Object.values(tasks).some((task) => task.status === 'failed');
    if (sch.fast_fail && hasFailed) {
      for (const task of Object.values(tasks)) {
        if (task.status === 'queued') {
          task.status = 'skipped';
          task.last_error = 'fast_fail';
          task.ended_at = nowIso();
        }
      }
    }

    const queued = nextRunnable(tasks, descendants);
    while (queued.length > 0 && active.size < sch.concurrency) {
      const task = queued.shift();
      if (!task) break;
      const pending = launchTaskAttempt(task, run, rootDir, runDir, simulate, ensureTaskCtx).then(() => {
        active.delete(task.task_id);
      });
      active.set(task.task_id, pending);
    }

    refreshMetrics(sch, tasks);
    if (saveRun) saveRun(runDir, run);

    const all = Object.values(tasks);
    const done = all.length > 0 && all.every((task) => isTerminal(task.status));
    const deadlocked = active.size === 0 && nextRunnable(tasks, descendants).length === 0 && all.some((task) => task.status === 'queued');

    if (done || deadlocked) {
      if (active.size > 0) {
        await Promise.all(Array.from(active.values()));
        propagateDependencySkips(tasks);
        refreshMetrics(sch, tasks);
      }
      const allSuccess = all.every((task) => task.status === 'success');
      sch.status = deadlocked ? 'blocked' : allSuccess ? 'completed' : 'failed';
      if (deadlocked) sch.errors.push(`${nowIso()} scheduler deadlocked: queued tasks cannot run`);
      sch.ended_at = nowIso();
      if (saveRun) saveRun(runDir, run);
      break;
    }
    if (active.size > 0) await Promise.race(Array.from(active.values()));
    else await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

module.exports = {
  depList,
  initScheduler,
  runScheduler,
  printMetrics: refreshMetrics,
};
