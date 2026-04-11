#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const RUN_DIR = path.join(process.cwd(), '.opencode', 'eoc-run');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function nowIso() { return new Date().toISOString(); }

function parseArgs(argv) {
  const cmd = argv[2];
  const args = argv.slice(3);
  const opts = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (!t.startsWith('--')) { opts._.push(t); continue; }
    const k = t.slice(2);
    const n = args[i + 1];
    if (!n || n.startsWith('--')) opts[k] = true;
    else { opts[k] = n; i += 1; }
  }
  return { cmd, opts };
}

function runPath(runId) { return path.join(RUN_DIR, `${runId}.json`); }

function loadRun(runId) {
  const p = runPath(runId);
  if (!fs.existsSync(p)) throw new Error(`Run not found: ${runId}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveRun(run) {
  ensureDir(RUN_DIR);
  run.updated_at = nowIso();
  fs.writeFileSync(runPath(run.run_id), JSON.stringify(run, null, 2) + '\n');
}

function initScheduler(run, concurrency) {
  if (!run.scheduler) {
    run.scheduler = {
      concurrency: Number(concurrency) || 2,
      tasks: {},
      started_at: null,
      ended_at: null,
      status: 'idle',
      metrics: {
        total: 0,
        queued: 0,
        running: 0,
        success: 0,
        failed: 0,
        retried: 0,
        timed_out: 0,
      },
    };
  }
}

function ensureTaskCtx(runId, taskId) {
  const base = path.join(RUN_DIR, runId, 'tasks', taskId);
  ensureDir(base);
  return base;
}

function depList(raw) {
  if (!raw) return [];
  return String(raw).split(',').map((x) => x.trim()).filter(Boolean);
}

function canRun(task, tasks) {
  if (!task.deps || task.deps.length === 0) return true;
  return task.deps.every((d) => tasks[d] && tasks[d].status === 'success');
}

function shellCommand(command, workdir, timeoutMs, logFile) {
  return new Promise((resolve) => {
    exec(command, {
      cwd: workdir || process.cwd(),
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 16,
      shell: true,
    }, (error, stdout, stderr) => {
      const content = `${stdout || ''}${stderr || ''}`;
      fs.writeFileSync(logFile, content, 'utf8');
      const timedOut = Boolean(error && error.killed && error.signal === 'SIGTERM');
      if (!error) {
        resolve({ code: 0, timedOut: false });
        return;
      }
      const code = typeof error.code === 'number' ? error.code : 1;
      resolve({ code, timedOut });
    });
  });
}

async function runScheduler(run, simulate) {
  initScheduler(run, run.scheduler?.concurrency || 2);
  const sch = run.scheduler;
  const tasks = sch.tasks;
  sch.status = 'running';
  sch.started_at = sch.started_at || nowIso();

  const active = new Map();

  function refreshMetrics() {
    const all = Object.values(tasks);
    sch.metrics.total = all.length;
    sch.metrics.queued = all.filter((t) => t.status === 'queued').length;
    sch.metrics.running = all.filter((t) => t.status === 'running').length;
    sch.metrics.success = all.filter((t) => t.status === 'success').length;
    sch.metrics.failed = all.filter((t) => t.status === 'failed').length;
    sch.metrics.retried = all.reduce((a, t) => a + Math.max(0, (t.attempts || 0) - 1), 0);
    sch.metrics.timed_out = all.filter((t) => t.last_error === 'timeout').length;
  }

  function nextRunnable() {
    return Object.values(tasks)
      .filter((t) => t.status === 'queued' && canRun(t, tasks))
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  }

  async function launchTask(task) {
    const taskBase = ensureTaskCtx(run.run_id, task.task_id);
    task.status = 'running';
    task.started_at = task.started_at || nowIso();
    task.attempts = (task.attempts || 0) + 1;
    task.last_attempt_at = nowIso();

    const ctxFile = path.join(taskBase, 'context.json');
    fs.writeFileSync(ctxFile, JSON.stringify({
      run_id: run.run_id,
      task_id: task.task_id,
      deps: task.deps,
      workdir: task.workdir,
      command: task.command,
      timeout_sec: task.timeout_sec,
      retries: task.retries,
      attempt: task.attempts,
      started_at: task.last_attempt_at,
    }, null, 2) + '\n');

    const logFile = path.join(taskBase, `attempt-${task.attempts}.log`);
    let result;
    if (simulate) {
      fs.writeFileSync(logFile, `[simulate] ${task.command}\n`, 'utf8');
      await new Promise((r) => setTimeout(r, 30));
      result = { code: 0, timedOut: false };
    } else {
      result = await shellCommand(task.command, task.workdir, task.timeout_sec * 1000, logFile);
    }

    if (result.timedOut) {
      task.last_error = 'timeout';
      if (task.attempts <= task.retries + 1) {
        task.status = 'queued';
      } else {
        task.status = 'failed';
        task.ended_at = nowIso();
      }
    } else if (result.code === 0) {
      task.status = 'success';
      task.exit_code = 0;
      task.ended_at = nowIso();
    } else {
      task.last_error = `exit_code_${result.code}`;
      task.exit_code = result.code;
      if (task.attempts <= task.retries + 1) {
        task.status = 'queued';
      } else {
        task.status = 'failed';
        task.ended_at = nowIso();
      }
    }
  }

  while (true) {
    const queued = nextRunnable();
    while (queued.length > 0 && active.size < sch.concurrency) {
      const t = queued.shift();
      const p = launchTask(t).then(() => active.delete(t.task_id));
      active.set(t.task_id, p);
    }

    refreshMetrics();
    saveRun(run);

    const all = Object.values(tasks);
    const done = all.length > 0 && all.every((t) => t.status === 'success' || t.status === 'failed');
    const deadlocked = active.size === 0 && nextRunnable().length === 0 && all.some((t) => t.status === 'queued');

    if (done || deadlocked) {
      if (active.size > 0) {
        await Promise.all(Array.from(active.values()));
        refreshMetrics();
      }
      sch.status = deadlocked ? 'blocked' : (all.every((t) => t.status === 'success') ? 'completed' : 'failed');
      sch.ended_at = nowIso();
      saveRun(run);
      break;
    }

    if (active.size > 0) {
      await Promise.race(Array.from(active.values()));
    } else {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

function printStatus(run) {
  const sch = run.scheduler;
  if (!sch) {
    console.log('Scheduler not initialized for this run.');
    return;
  }
  console.log(`Run ID: ${run.run_id}`);
  console.log(`Scheduler Status: ${sch.status}`);
  console.log(`Concurrency: ${sch.concurrency}`);
  console.log(`Metrics: total=${sch.metrics.total} queued=${sch.metrics.queued} running=${sch.metrics.running} success=${sch.metrics.success} failed=${sch.metrics.failed} retried=${sch.metrics.retried} timeout=${sch.metrics.timed_out}`);
  const rows = Object.values(sch.tasks).sort((a, b) => a.task_id.localeCompare(b.task_id));
  for (const t of rows) {
    console.log(`- ${t.task_id}  status=${t.status} attempts=${t.attempts || 0} deps=[${(t.deps || []).join(',')}]`);
  }
}

async function main() {
  const { cmd, opts } = parseArgs(process.argv);
  try {
    if (!cmd || cmd === 'help' || cmd === '--help') {
      console.log('Usage:');
      console.log('  node scripts/eoc-scheduler.js init --run-id <id> [--concurrency 2]');
      console.log('  node scripts/eoc-scheduler.js add-task --run-id <id> --task-id <id> --cmd "..." [--deps a,b] [--timeout 600] [--retries 1] [--workdir path]');
      console.log('  node scripts/eoc-scheduler.js run --run-id <id> [--simulate]');
      console.log('  node scripts/eoc-scheduler.js status --run-id <id>');
      process.exit(0);
    }

    const runId = opts['run-id'];
    if (!runId) throw new Error('Missing --run-id');
    const run = loadRun(runId);

    switch (cmd) {
      case 'init': {
        initScheduler(run, opts.concurrency || 2);
        saveRun(run);
        printStatus(run);
        break;
      }
      case 'add-task': {
        initScheduler(run, run.scheduler?.concurrency || 2);
        const taskId = opts['task-id'];
        const command = opts.cmd;
        if (!taskId || !command) throw new Error('add-task requires --task-id and --cmd');
        if (run.scheduler.tasks[taskId]) throw new Error(`Task exists: ${taskId}`);
        const task = {
          task_id: taskId,
          command,
          deps: depList(opts.deps),
          timeout_sec: Number(opts.timeout || 600),
          retries: Number(opts.retries || 0),
          workdir: opts.workdir || process.cwd(),
          status: 'queued',
          attempts: 0,
          created_at: nowIso(),
        };
        run.scheduler.tasks[taskId] = task;
        saveRun(run);
        printStatus(run);
        break;
      }
      case 'run': {
        initScheduler(run, run.scheduler?.concurrency || 2);
        await runScheduler(run, Boolean(opts.simulate));
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
    console.error(`[eoc-scheduler] ${err.message}`);
    process.exit(1);
  }
}

main();
