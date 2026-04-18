const fs = require('fs');
const path = require('path');
const { executeCommand } = require('../kernel/executor.js');
const { nowIso } = require('../../shared/time.js');

/** @typedef {{ rootDir?: string, runId?: string | null | undefined, stepId?: string | null | undefined, executableField?: string, contextFile?: string | null | undefined, metadata?: Record<string, unknown> }} ShellCommandContext */
/** @typedef {{ task_id: string, command?: string, validation?: string, workdir?: string, timeout_sec?: number, deps?: string[], owner_hint?: string, retries?: number, priority?: number, status?: string, started_at?: string | null, attempts?: number, last_attempt_at?: string | null, last_error?: string | null, exit_code?: number | null, ended_at?: string | null }} ScheduledTask */
/** @typedef {{ run_id?: string | null }} SchedulerRun */
/** @typedef {{ code: number, timedOut: boolean }} ShellOutcome */
/** @typedef {{ task: ScheduledTask, run: SchedulerRun, rootDir: string, runDir: string, simulate?: boolean, ensureTaskCtx: (runDir: string, runId: string | null, taskId: string) => string }} ExecuteTaskAttemptOptions */

/** @param {string} command @param {string} workdir @param {number} timeoutMs @param {string} logFile @param {ShellCommandContext} [ctx] @returns {Promise<ShellOutcome>} */
function shellCommand(command, workdir, timeoutMs, logFile, ctx = {}) {
  return executeCommand({
    command,
    ...(ctx.rootDir ? { rootDir: ctx.rootDir } : {}),
    workdir,
    runId: ctx.runId || null,
    stepId: ctx.stepId || null,
    executableField: ctx.executableField || 'command',
    timeoutSec: Math.max(1, Math.floor(Number(timeoutMs || 0) / 1000) || 600),
    logFile,
    contextFile: ctx.contextFile || null,
    metadata: ctx.metadata || {},
  }).then((result) => ({ code: result.exit_code, timedOut: result.timed_out }));
}

/** @param {ExecuteTaskAttemptOptions} options */
async function executeTaskAttempt({ task, run, rootDir, runDir, simulate = false, ensureTaskCtx }) {
  const taskBase = ensureTaskCtx(runDir, run.run_id || null, task.task_id);
  task.status = 'running';
  task.started_at = task.started_at || nowIso();
  task.attempts = (task.attempts || 0) + 1;
  task.last_attempt_at = nowIso();

  const ctxFile = path.join(taskBase, 'context.json');
  const logFile = path.join(taskBase, `attempt-${task.attempts}.log`);
  fs.writeFileSync(logFile, '', 'utf8');

  /** @type {ShellOutcome} */
  let result;
  if (simulate) {
    fs.writeFileSync(logFile, `[simulate] ${task.command}\n`, 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 30));
    result = { code: 0, timedOut: false };
  } else {
    result = await shellCommand(String(task.command || ''), String(task.workdir || rootDir || process.cwd()), Number(task.timeout_sec || 600) * 1000, logFile, {
      rootDir,
      runId: run.run_id,
      stepId: task.task_id,
      executableField: 'command',
      contextFile: ctxFile,
      metadata: {
        deps: task.deps,
        validation: task.validation,
        owner_hint: task.owner_hint || 'fullstack',
        retries: task.retries || 0,
        priority: task.priority || 100,
        attempt: task.attempts,
      },
    });
  }

  if (result.timedOut) {
    task.last_error = 'timeout';
    if (task.attempts <= (task.retries || 0) + 1) task.status = 'queued';
    else {
      task.status = 'failed';
      task.ended_at = nowIso();
    }
    return;
  }

  if (result.code === 0) {
    /** @type {ShellOutcome} */
    let validationResult;
    if (simulate) {
      fs.appendFileSync(logFile, `[simulate:validation] ${task.validation}\n`, 'utf8');
      validationResult = { code: 0, timedOut: false };
    } else {
      validationResult = await shellCommand(String(task.validation || ''), String(task.workdir || rootDir || process.cwd()), Number(task.timeout_sec || 600) * 1000, logFile, {
        rootDir,
        runId: run.run_id,
        stepId: `${task.task_id}.validation`,
        executableField: 'validation',
        metadata: { task_id: task.task_id, attempt: task.attempts },
      });
    }
    if (validationResult.timedOut) {
      task.last_error = 'validation_timeout';
      if (task.attempts <= (task.retries || 0) + 1) task.status = 'queued';
      else {
        task.status = 'failed';
        task.ended_at = nowIso();
      }
      return;
    }
    if (validationResult.code !== 0) {
      task.last_error = `validation_exit_code_${validationResult.code}`;
      task.exit_code = validationResult.code;
      if (task.attempts <= (task.retries || 0) + 1) task.status = 'queued';
      else {
        task.status = 'failed';
        task.ended_at = nowIso();
      }
      return;
    }
    task.status = 'success';
    task.exit_code = 0;
    task.ended_at = nowIso();
    return;
  }

  task.last_error = `exit_code_${result.code}`;
  task.exit_code = result.code;
  if (task.attempts <= (task.retries || 0) + 1) {
    task.status = 'queued';
    return;
  }
  task.status = 'failed';
  task.ended_at = nowIso();
}

module.exports = {
  shellCommand,
  executeTaskAttempt,
};
