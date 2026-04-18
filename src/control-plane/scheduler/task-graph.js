/** @typedef {{ task_id: string, command?: string, validation?: string, workdir?: string, timeout_sec?: number, retries?: number, deps?: string[], status: string, priority?: number, attempts?: number, last_error?: string }} SchedulerTask */
/** @typedef {{ validateSchedulerLimits: (count: number, minimum: number, policy: any) => void, assertSafeTaskId?: (taskId: string, policy: any) => void, validateRunnableCommand?: (command: string | null | undefined, kind: string, taskId: string, policy: any) => void, normalizeWorkdir?: (workdir: string | null | undefined, rootDir: string, taskId: string) => string, normalizeTimeout?: (timeout: number | string | null | undefined, policy: any, taskId: string) => number, normalizeRetries?: (retries: number | string | null | undefined, policy: any, taskId: string) => number }} ExecPolicyLike */
/** @typedef {Record<string, SchedulerTask>} TaskMap */
/** @typedef {{ metrics?: Record<string, number> }} SchedulerLike */

/** @param {unknown} raw */
function depList(raw) {
  if (!raw) return [];
  return String(raw).split(',').map((x) => x.trim()).filter(Boolean);
}

/** @param {unknown} status */
function isTerminal(status) {
  return status === 'success' || status === 'failed' || status === 'skipped';
}

/** @param {unknown} err */
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/** @param {TaskMap} tasks @param {ExecPolicyLike} execPolicy @param {any} policy @param {string} rootDir */
function validateTasks(tasks, execPolicy, policy, rootDir) {
  const ids = new Set(Object.keys(tasks));
  /** @type {string[]} */
  const errors = [];
  try {
    execPolicy.validateSchedulerLimits(Object.keys(tasks).length, 1, policy);
  } catch (err) {
    errors.push(errorMessage(err));
  }
  for (const task of Object.values(tasks)) {
    try {
      if (execPolicy.assertSafeTaskId) execPolicy.assertSafeTaskId(task.task_id, policy);
      if (execPolicy.validateRunnableCommand) execPolicy.validateRunnableCommand(task.command, 'command', task.task_id, policy);
      if (execPolicy.validateRunnableCommand) execPolicy.validateRunnableCommand(task.validation, 'validation', task.task_id, policy);
      if (execPolicy.normalizeWorkdir) execPolicy.normalizeWorkdir(task.workdir, rootDir, task.task_id);
      if (execPolicy.normalizeTimeout) execPolicy.normalizeTimeout(task.timeout_sec, policy, task.task_id);
      if (execPolicy.normalizeRetries) execPolicy.normalizeRetries(task.retries || 0, policy, task.task_id);
    } catch (err) {
      errors.push(errorMessage(err));
    }
    for (const dep of task.deps || []) {
      if (!ids.has(dep)) errors.push(`task "${task.task_id}" depends on missing task "${dep}"`);
      if (dep === task.task_id) errors.push(`task "${task.task_id}" cannot depend on itself`);
    }
  }
  return errors;
}

/** @param {TaskMap} tasks */
function detectCycles(tasks) {
  /** @type {Record<string, number>} */
  const color = {};
  /** @type {Record<string, string | undefined>} */
  const parent = {};
  /** @type {string | null} */
  let cycle = null;
  /** @param {string} node @param {string} to */
  function buildCycle(node, to) {
    const nodes = [to];
    let cur = node;
    while (cur && cur !== to) {
      nodes.push(cur);
      cur = parent[cur] || '';
    }
    nodes.push(to);
    nodes.reverse();
    return nodes.join(' -> ');
  }
  /** @param {string} node */
  function dfs(node) {
    color[node] = 1;
    const deps = tasks[node]?.deps || [];
    for (const dep of deps) {
      if (!tasks[dep]) continue;
      if (color[dep] === 0 || color[dep] === undefined) {
        parent[dep] = node;
        if (dfs(dep)) return true;
      } else if (color[dep] === 1) {
        cycle = buildCycle(node, dep);
        return true;
      }
    }
    color[node] = 2;
    return false;
  }
  for (const id of Object.keys(tasks)) color[id] = 0;
  for (const id of Object.keys(tasks)) if (color[id] === 0 && dfs(id)) break;
  return cycle;
}

/** @param {TaskMap} tasks */
function buildDescendants(tasks) {
  /** @type {Record<string, Set<string>>} */
  const out = {};
  for (const id of Object.keys(tasks)) out[id] = new Set();
  for (const [id, task] of Object.entries(tasks)) for (const dep of task.deps || []) if (out[dep]) out[dep].add(id);
  return out;
}

/** @param {TaskMap} tasks @param {Record<string, Set<string>>} descendants */
function nextRunnable(tasks, descendants) {
  return Object.values(tasks)
    .filter((task) => task.status === 'queued')
    .filter((task) => (task.deps || []).every((dep) => tasks[dep] && tasks[dep].status === 'success'))
    .sort((a, b) => {
      const aDesc = descendants[a.task_id];
      const bDesc = descendants[b.task_id];
      return (a.priority || 100) - (b.priority || 100)
        || (bDesc ? bDesc.size : 0) - (aDesc ? aDesc.size : 0)
        || a.task_id.localeCompare(b.task_id);
    });
}

/** @param {TaskMap} tasks */
function propagateDependencySkips(tasks) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of Object.values(tasks)) {
      if (task.status !== 'queued') continue;
      const deps = task.deps || [];
      if (deps.some((dep) => tasks[dep] && (tasks[dep].status === 'failed' || tasks[dep].status === 'skipped'))) {
        task.status = 'skipped';
        task.last_error = 'dependency_failed';
        changed = true;
      }
    }
  }
}

/** @typedef {{ total: number, queued: number, running: number, success: number, failed: number, skipped: number, retried: number, timed_out: number, [key: string]: number }} SchedulerMetrics */
/** @param {{ metrics?: SchedulerMetrics }} scheduler @param {TaskMap} tasks */
function refreshMetrics(scheduler, tasks) {
  /** @type {SchedulerMetrics} */
  const metrics = { total: 0, queued: 0, running: 0, success: 0, failed: 0, skipped: 0, retried: 0, timed_out: 0 };
  for (const task of Object.values(tasks)) {
    metrics.total += 1;
    metrics[task.status || 'queued'] = (metrics[task.status || 'queued'] || 0) + 1;
    if ((task.attempts || 0) > 1) metrics.retried += 1;
    if (String(task.last_error || '').includes('timeout')) metrics.timed_out += 1;
  }
  scheduler.metrics = metrics;
  return metrics;
}

module.exports = {
  depList,
  isTerminal,
  validateTasks,
  detectCycles,
  buildDescendants,
  nextRunnable,
  propagateDependencySkips,
  refreshMetrics,
};
