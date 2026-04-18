#!/usr/bin/env node
const path = require('path');
const execPolicy = require('../control-plane/policy/execution-policy.js');
const { formatManagedInvocation } = require('./runtime-paths.js');
const { parseArgs } = require('../shared/cli.js');
const { runPath, loadRun, saveRun, ensureTaskCtx } = require('../control-plane/scheduler/run-store.js');
const { depList } = require('../control-plane/scheduler/task-graph.js');
const { initScheduler, runScheduler, printMetrics } = require('../control-plane/scheduler/scheduler-service.js');

/** @typedef {import('../shared/cli.js').ParsedCliArgs} ParsedCliArgs */
/** @typedef {import('../control-plane/scheduler/scheduler-service.js').SchedulerRun} SchedulerRun */
/** @typedef {import('../control-plane/scheduler/scheduler-service.js').SchedulerState} SchedulerState */
/** @typedef {import('../control-plane/scheduler/scheduler-service.js').SchedulerTask} SchedulerTask */
/** @typedef {{ cmd: string | undefined, opts: ParsedCliArgs }} SchedulerArgs */
/** @typedef {{ rootDir?: string, runDir?: string }} PolicyLoadOptions */

function printLine(line = '') {
  process.stdout.write(String(line) + '\n');
}
const ROOT_DIR = process.cwd();
const RUN_DIR = path.join(ROOT_DIR, '.opencode', 'eoc-run');

/** @param {string[] | readonly string[]} argv @returns {SchedulerArgs} */
function parseSchedulerArgs(argv) {
  const cmd = argv[2];
  const opts = parseArgs(argv, { startIndex: 3 });
  return { cmd, opts };
}

/** @returns {unknown} */
function loadCommandPolicy() {
  return execPolicy.loadCommandPolicy(/** @type {PolicyLoadOptions} */ ({ rootDir: ROOT_DIR, runDir: RUN_DIR }));
}

/** @param {string} command */
function hasUnsafeShellOperators(command) {
  return execPolicy.hasUnsafeShellOperators(command);
}

/** @param {string} command */
function splitCommand(command) {
  return execPolicy.splitCommand(command);
}

/** @param {string} file @param {unknown} policy */
function isExecutableAllowed(file, policy) {
  return execPolicy.isExecutableAllowed(file, policy);
}

/** @param {string} file @param {string[]} args @param {unknown} policy */
function areArgsAllowed(file, args, policy) {
  return execPolicy.areArgsAllowed(file, args, policy);
}

/** @param {SchedulerRun} run @param {number | string | undefined} concurrency @param {unknown} fastFail */
function initSchedulerForRun(run, concurrency, fastFail) {
  return initScheduler(run, concurrency, fastFail, { execPolicy, loadCommandPolicy });
}

/** @param {SchedulerRun} run @param {boolean} simulate @param {unknown} fastFailOverride */
async function runSchedulerForRun(run, simulate, fastFailOverride) {
  return runScheduler(run, simulate, fastFailOverride, {
    execPolicy,
    loadCommandPolicy,
    rootDir: ROOT_DIR,
    runDir: RUN_DIR,
    saveRun: (runDir, nextRun) => saveRun(runDir, /** @type {import('../control-plane/scheduler/run-store.js').SchedulerRun} */ (nextRun)),
    ensureTaskCtx: (runDir, runId, taskId) => ensureTaskCtx(runDir, String(runId || ''), taskId),
  });
}

/** @param {string} runId @param {{ simulate?: boolean, fastFail?: unknown }} [options] */
async function runSchedulerById(runId, options = {}) {
  const run = /** @type {SchedulerRun} */ (loadRun(RUN_DIR, runId));
  await runSchedulerForRun(run, Boolean(options.simulate), options.fastFail);
  return /** @type {SchedulerRun} */ (loadRun(RUN_DIR, runId));
}

/** @param {SchedulerRun} run */
function printStatus(run) {
  const sch = /** @type {SchedulerState | undefined} */ (run.scheduler || undefined);
  if (!sch) {
    printLine('Scheduler not initialized for this run.');
    return;
  }
  printMetrics(sch, sch.tasks || {});
  printLine(`Run ID: ${run.run_id || ''}`);
  printLine(`Scheduler Status: ${sch.status}`);
  printLine(`Concurrency: ${sch.concurrency}`);
  printLine(`Fast Fail: ${Boolean(sch.fast_fail)}`);
  printLine(`Metrics: total=${sch.metrics.total} queued=${sch.metrics.queued} running=${sch.metrics.running} success=${sch.metrics.success} failed=${sch.metrics.failed} skipped=${sch.metrics.skipped} retried=${sch.metrics.retried} timeout=${sch.metrics.timed_out}`);
  if (Array.isArray(sch.errors) && sch.errors.length > 0) {
    printLine('Errors:');
    for (const e of sch.errors) printLine(`- ${e}`);
  }
  const rows = Object.values(sch.tasks).sort((a, b) => a.task_id.localeCompare(b.task_id));
  for (const t of rows) {
    const err = t.last_error ? ` error=${t.last_error}` : '';
    printLine(`- ${t.task_id} status=${t.status} attempts=${t.attempts || 0} priority=${t.priority || 100} deps=[${(t.deps || []).join(',')}]${err}`);
  }
}

function usage() {
  printLine('Usage:');
  printLine(`  ${formatManagedInvocation('eoc-scheduler', ['init', '--run-id', '<id>', '[--concurrency', '2]', '[--fast-fail', 'false]'])}`);
  printLine(`  ${formatManagedInvocation('eoc-scheduler', ['add-task', '--run-id', '<id>', '--task-id', '<id>', '--cmd', '...', '--validation', '...', '[--deps', 'a,b]', '[--timeout', '600]', '[--retries', '1]', '[--priority', '100]', '[--owner', 'fullstack]', '[--workdir', 'path]'])}`);
  printLine(`  ${formatManagedInvocation('eoc-scheduler', ['run', '--run-id', '<id>', '[--simulate]', '[--fast-fail', 'true]'])}`);
  printLine(`  ${formatManagedInvocation('eoc-scheduler', ['status', '--run-id', '<id>'])}`);
}

/** @param {ParsedCliArgs} opts */
function readRunId(opts) {
  const value = opts['run-id'];
  return typeof value === 'string' ? value : '';
}

/** @param {ParsedCliArgs} opts @param {string} key @param {number} fallback */
function readNumberOption(opts, key, fallback) {
  const raw = opts[key];
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** @param {ParsedCliArgs} opts @param {string} key */
function readStringOption(opts, key) {
  const value = opts[key];
  return typeof value === 'string' ? value : '';
}

/** @param {SchedulerRun} run @returns {SchedulerState} */
function requireScheduler(run) {
  return /** @type {SchedulerState} */ (run.scheduler || initSchedulerForRun(run, 2, false));
}

async function main() {
  const { cmd, opts } = parseSchedulerArgs(process.argv);
  try {
    if (!cmd || cmd === 'help' || cmd === '--help') {
      usage();
      process.exit(0);
    }
    const runId = readRunId(opts);
    if (!runId) throw new Error('Missing --run-id');
    const run = /** @type {SchedulerRun} */ (loadRun(RUN_DIR, runId));

    switch (cmd) {
      case 'init': {
        initSchedulerForRun(run, readNumberOption(opts, 'concurrency', 2), opts['fast-fail']);
        saveRun(RUN_DIR, /** @type {import('../control-plane/scheduler/run-store.js').SchedulerRun} */ (run));
        printStatus(run);
        break;
      }
      case 'add-task': {
        const scheduler = requireScheduler(run);
        initSchedulerForRun(run, scheduler.concurrency || 2, scheduler.fast_fail);
        const policy = loadCommandPolicy();
        const taskId = execPolicy.assertSafeTaskId(readStringOption(opts, 'task-id'), policy);
        const command = execPolicy.validateRunnableCommand(readStringOption(opts, 'cmd'), 'command', taskId, policy);
        const validation = execPolicy.validateRunnableCommand(readStringOption(opts, 'validation'), 'validation', taskId, policy);
        if (scheduler.tasks[taskId]) throw new Error(`Task exists: ${taskId}`);
        execPolicy.validateSchedulerLimits(Object.keys(scheduler.tasks).length + 1, scheduler.concurrency || 2, policy);
        scheduler.tasks[taskId] = /** @type {SchedulerTask} */ ({
          task_id: taskId,
          command,
          validation,
          deps: depList(readStringOption(opts, 'deps')),
          timeout_sec: execPolicy.normalizeTimeout(readNumberOption(opts, 'timeout', 600), policy, taskId),
          retries: execPolicy.normalizeRetries(readNumberOption(opts, 'retries', 0), policy, taskId),
          priority: readNumberOption(opts, 'priority', 100),
          owner_hint: String(readStringOption(opts, 'owner') || 'fullstack'),
          workdir: execPolicy.normalizeWorkdir(readStringOption(opts, 'workdir') || process.cwd(), ROOT_DIR, taskId),
          status: 'queued',
          attempts: 0,
          created_at: new Date().toISOString(),
        });
        saveRun(RUN_DIR, /** @type {import('../control-plane/scheduler/run-store.js').SchedulerRun} */ (run));
        printStatus(run);
        break;
      }
      case 'run': {
        const scheduler = requireScheduler(run);
        initSchedulerForRun(run, scheduler.concurrency || 2, scheduler.fast_fail);
        await runSchedulerForRun(run, Boolean(opts.simulate), opts['fast-fail']);
        printStatus(run);
        break;
      }
      case 'status': {
        printStatus(run);
        break;
      }
      default:
        throw new Error(`Unknown cmd: ${cmd}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[eoc-scheduler] ${message}`);
    process.exit(1);
  }
}

module.exports = {
  main,
  runPath: /** @param {string} runId */ (runId) => runPath(RUN_DIR, runId),
  loadRun: /** @param {string} runId */ (runId) => loadRun(RUN_DIR, runId),
  saveRun: /** @param {SchedulerRun} run */ (run) => saveRun(RUN_DIR, /** @type {import('../control-plane/scheduler/run-store.js').SchedulerRun} */ (run)),
  initScheduler: initSchedulerForRun,
  runScheduler: runSchedulerForRun,
  runSchedulerById,
  printStatus,
  hasUnsafeShellOperators,
  splitCommand,
  loadCommandPolicy,
  isExecutableAllowed,
  areArgsAllowed,
};

if (require.main === module) {
  main();
}
