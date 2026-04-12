#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const RUN_DIR = path.join(process.cwd(), '.opencode', 'eoc-run');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const cmd = argv[2];
  const args = argv.slice(3);
  const opts = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (!t.startsWith('--')) {
      opts._.push(t);
      continue;
    }
    const k = t.slice(2);
    const n = args[i + 1];
    if (!n || n.startsWith('--')) {
      opts[k] = true;
    } else {
      opts[k] = n;
      i += 1;
    }
  }
  return { cmd, opts };
}

function toBool(v) {
  return v === true || v === 'true' || v === '1' || v === 1;
}

function runPath(runId) {
  return path.join(RUN_DIR, `${runId}.json`);
}

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

function depList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function isTerminal(status) {
  return status === 'success' || status === 'failed' || status === 'skipped';
}

function initScheduler(run, concurrency, fastFail) {
  if (!run.scheduler) {
    run.scheduler = {
      concurrency: Number(concurrency) || 2,
      fast_fail: toBool(fastFail),
      tasks: {},
      started_at: null,
      ended_at: null,
      status: 'idle',
      errors: [],
      metrics: {
        total: 0,
        queued: 0,
        running: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        retried: 0,
        timed_out: 0,
      },
    };
    return;
  }
  if (concurrency !== undefined) run.scheduler.concurrency = Number(concurrency) || run.scheduler.concurrency || 2;
  if (fastFail !== undefined) run.scheduler.fast_fail = toBool(fastFail);
  if (!run.scheduler.metrics) {
    run.scheduler.metrics = {
      total: 0,
      queued: 0,
      running: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      retried: 0,
      timed_out: 0,
    };
  }
  if (!Array.isArray(run.scheduler.errors)) run.scheduler.errors = [];
}

function ensureTaskCtx(runId, taskId) {
  const base = path.join(RUN_DIR, runId, 'tasks', taskId);
  ensureDir(base);
  return base;
}

function shellCommand(command, workdir, timeoutMs, logFile) {
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd: workdir || process.cwd(),
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 16,
        shell: true,
      },
      (error, stdout, stderr) => {
        const content = `${stdout || ''}${stderr || ''}`;
        fs.appendFileSync(logFile, content, 'utf8');
        const timedOut = Boolean(error && error.killed && error.signal === 'SIGTERM');
        if (!error) {
          resolve({ code: 0, timedOut: false });
          return;
        }
        const code = typeof error.code === 'number' ? error.code : 1;
        resolve({ code, timedOut });
      }
    );
  });
}

function validateTasks(tasks) {
  const ids = new Set(Object.keys(tasks));
  const errors = [];
  for (const task of Object.values(tasks)) {
    if (!String(task.command || '').trim()) {
      errors.push(`task "${task.task_id}" missing command`);
    }
    if (!String(task.validation || '').trim()) {
      errors.push(`task "${task.task_id}" missing validation`);
    }
    for (const dep of task.deps || []) {
      if (!ids.has(dep)) {
        errors.push(`task "${task.task_id}" depends on missing task "${dep}"`);
      }
      if (dep === task.task_id) {
        errors.push(`task "${task.task_id}" cannot depend on itself`);
      }
    }
  }
  return errors;
}

function detectCycles(tasks) {
  const color = {};
  const parent = {};
  let cycle = null;

  function buildCycle(node, to) {
    const nodes = [to];
    let cur = node;
    while (cur && cur !== to) {
      nodes.push(cur);
      cur = parent[cur];
    }
    nodes.push(to);
    nodes.reverse();
    return nodes.join(' -> ');
  }

  function dfs(node) {
    color[node] = 1;
    const deps = tasks[node].deps || [];
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

  for (const id of Object.keys(tasks)) {
    color[id] = 0;
  }
  for (const id of Object.keys(tasks)) {
    if (color[id] === 0 && dfs(id)) return cycle;
  }
  return null;
}

function buildDescendants(tasks) {
  const byDep = {};
  for (const t of Object.values(tasks)) {
    for (const dep of t.deps || []) {
      if (!byDep[dep]) byDep[dep] = [];
      byDep[dep].push(t.task_id);
    }
  }
  const memo = {};

  function walk(id, seen) {
    if (memo[id] !== undefined) return memo[id];
    const children = byDep[id] || [];
    let count = 0;
    for (const c of children) {
      if (seen.has(c)) continue;
      const nextSeen = new Set(seen);
      nextSeen.add(c);
      count += 1 + walk(c, nextSeen);
    }
    memo[id] = count;
    return count;
  }

  for (const id of Object.keys(tasks)) {
    walk(id, new Set([id]));
  }
  return memo;
}

function canRun(task, tasks) {
  if (!task.deps || task.deps.length === 0) return true;
  return task.deps.every((d) => tasks[d] && tasks[d].status === 'success');
}

function failReasonFromDeps(task, tasks) {
  for (const dep of task.deps || []) {
    const d = tasks[dep];
    if (!d) return `missing_dependency:${dep}`;
    if (d.status === 'failed' || d.status === 'skipped') return `dependency_failed:${dep}`;
  }
  return null;
}

function refreshMetrics(sch, tasks) {
  const all = Object.values(tasks);
  sch.metrics.total = all.length;
  sch.metrics.queued = all.filter((t) => t.status === 'queued').length;
  sch.metrics.running = all.filter((t) => t.status === 'running').length;
  sch.metrics.success = all.filter((t) => t.status === 'success').length;
  sch.metrics.failed = all.filter((t) => t.status === 'failed').length;
  sch.metrics.skipped = all.filter((t) => t.status === 'skipped').length;
  sch.metrics.retried = all.reduce((a, t) => a + Math.max(0, (t.attempts || 0) - 1), 0);
  sch.metrics.timed_out = all.filter((t) => t.last_error === 'timeout').length;
}

function nextRunnable(tasks, descendants) {
  return Object.values(tasks)
    .filter((t) => t.status === 'queued' && canRun(t, tasks))
    .sort((a, b) => {
      const pa = Number(a.priority || 100);
      const pb = Number(b.priority || 100);
      if (pb !== pa) return pb - pa;
      const da = descendants[a.task_id] || 0;
      const db = descendants[b.task_id] || 0;
      if (db !== da) return db - da;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });
}

function propagateDependencySkips(tasks) {
  let changed = false;
  let loop = true;
  while (loop) {
    loop = false;
    for (const task of Object.values(tasks)) {
      if (task.status !== 'queued') continue;
      const reason = failReasonFromDeps(task, tasks);
      if (!reason) continue;
      task.status = 'skipped';
      task.last_error = reason;
      task.ended_at = nowIso();
      loop = true;
      changed = true;
    }
  }
  return changed;
}

async function runScheduler(run, simulate, fastFailOverride) {
  initScheduler(run, run.scheduler?.concurrency || 2, run.scheduler?.fast_fail);
  if (fastFailOverride !== undefined) run.scheduler.fast_fail = toBool(fastFailOverride);

  const sch = run.scheduler;
  const tasks = sch.tasks;
  sch.status = 'running';
  sch.started_at = sch.started_at || nowIso();

  const integrityErrors = validateTasks(tasks);
  const cycle = detectCycles(tasks);
  if (cycle) integrityErrors.push(`dependency cycle detected: ${cycle}`);
  if (integrityErrors.length > 0) {
    sch.status = 'blocked';
    sch.errors.push(...integrityErrors.map((e) => `${nowIso()} ${e}`));
    refreshMetrics(sch, tasks);
    sch.ended_at = nowIso();
    saveRun(run);
    return;
  }

  const descendants = buildDescendants(tasks);
  const active = new Map();

  async function launchTask(task) {
    const taskBase = ensureTaskCtx(run.run_id, task.task_id);
    task.status = 'running';
    task.started_at = task.started_at || nowIso();
    task.attempts = (task.attempts || 0) + 1;
    task.last_attempt_at = nowIso();

    const ctxFile = path.join(taskBase, 'context.json');
    fs.writeFileSync(
      ctxFile,
      JSON.stringify(
        {
          run_id: run.run_id,
          task_id: task.task_id,
          deps: task.deps,
          workdir: task.workdir,
          command: task.command,
          validation: task.validation,
          owner_hint: task.owner_hint || 'fullstack',
          timeout_sec: task.timeout_sec,
          retries: task.retries,
          priority: task.priority || 100,
          attempt: task.attempts,
          started_at: task.last_attempt_at,
        },
        null,
        2
      ) + '\n'
    );

    const logFile = path.join(taskBase, `attempt-${task.attempts}.log`);
    fs.writeFileSync(logFile, '', 'utf8');
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
      return;
    }

    if (result.code === 0) {
      let validationResult;
      if (simulate) {
        fs.appendFileSync(logFile, `[simulate:validation] ${task.validation}\n`, 'utf8');
        validationResult = { code: 0, timedOut: false };
      } else {
        validationResult = await shellCommand(task.validation, task.workdir, task.timeout_sec * 1000, logFile);
      }
      if (validationResult.timedOut) {
        task.last_error = 'validation_timeout';
        if (task.attempts <= task.retries + 1) {
          task.status = 'queued';
        } else {
          task.status = 'failed';
          task.ended_at = nowIso();
        }
        return;
      }
      if (validationResult.code !== 0) {
        task.last_error = `validation_exit_code_${validationResult.code}`;
        task.exit_code = validationResult.code;
        if (task.attempts <= task.retries + 1) {
          task.status = 'queued';
        } else {
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
    if (task.attempts <= task.retries + 1) {
      task.status = 'queued';
      return;
    }
    task.status = 'failed';
    task.ended_at = nowIso();
  }

  while (true) {
    propagateDependencySkips(tasks);
    refreshMetrics(sch, tasks);

    const hasFailed = Object.values(tasks).some((t) => t.status === 'failed');
    if (sch.fast_fail && hasFailed) {
      for (const t of Object.values(tasks)) {
        if (t.status === 'queued') {
          t.status = 'skipped';
          t.last_error = 'fast_fail';
          t.ended_at = nowIso();
        }
      }
    }

    const queued = nextRunnable(tasks, descendants);
    while (queued.length > 0 && active.size < sch.concurrency) {
      const t = queued.shift();
      const p = launchTask(t).then(() => active.delete(t.task_id));
      active.set(t.task_id, p);
    }

    refreshMetrics(sch, tasks);
    saveRun(run);

    const all = Object.values(tasks);
    const done = all.length > 0 && all.every((t) => isTerminal(t.status));
    const deadlocked =
      active.size === 0 &&
      nextRunnable(tasks, descendants).length === 0 &&
      all.some((t) => t.status === 'queued');

    if (done || deadlocked) {
      if (active.size > 0) {
        await Promise.all(Array.from(active.values()));
        propagateDependencySkips(tasks);
        refreshMetrics(sch, tasks);
      }
      const allSuccess = all.every((t) => t.status === 'success');
      sch.status = deadlocked ? 'blocked' : allSuccess ? 'completed' : 'failed';
      if (deadlocked) sch.errors.push(`${nowIso()} scheduler deadlocked: queued tasks cannot run`);
      sch.ended_at = nowIso();
      saveRun(run);
      break;
    }

    if (active.size > 0) {
      await Promise.race(Array.from(active.values()));
    } else {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

async function runSchedulerById(runId, options = {}) {
  const run = loadRun(runId);
  await runScheduler(run, Boolean(options.simulate), options.fastFail);
  return loadRun(runId);
}

function printStatus(run) {
  const sch = run.scheduler;
  if (!sch) {
    console.log('Scheduler not initialized for this run.');
    return;
  }
  refreshMetrics(sch, sch.tasks || {});
  console.log(`Run ID: ${run.run_id}`);
  console.log(`Scheduler Status: ${sch.status}`);
  console.log(`Concurrency: ${sch.concurrency}`);
  console.log(`Fast Fail: ${Boolean(sch.fast_fail)}`);
  console.log(
    `Metrics: total=${sch.metrics.total} queued=${sch.metrics.queued} running=${sch.metrics.running} success=${sch.metrics.success} failed=${sch.metrics.failed} skipped=${sch.metrics.skipped} retried=${sch.metrics.retried} timeout=${sch.metrics.timed_out}`
  );
  if (Array.isArray(sch.errors) && sch.errors.length > 0) {
    console.log('Errors:');
    for (const e of sch.errors) console.log(`- ${e}`);
  }
  const rows = Object.values(sch.tasks).sort((a, b) => a.task_id.localeCompare(b.task_id));
  for (const t of rows) {
    const err = t.last_error ? ` error=${t.last_error}` : '';
    console.log(
      `- ${t.task_id} status=${t.status} attempts=${t.attempts || 0} priority=${t.priority || 100} deps=[${(t.deps || []).join(',')}]${err}`
    );
  }
}

async function main() {
  const { cmd, opts } = parseArgs(process.argv);
  try {
    if (!cmd || cmd === 'help' || cmd === '--help') {
      console.log('Usage:');
      console.log('  node scripts/eoc-scheduler.js init --run-id <id> [--concurrency 2] [--fast-fail false]');
      console.log(
        '  node scripts/eoc-scheduler.js add-task --run-id <id> --task-id <id> --cmd "..." --validation "..." [--deps a,b] [--timeout 600] [--retries 1] [--priority 100] [--owner fullstack] [--workdir path]'
      );
      console.log('  node scripts/eoc-scheduler.js run --run-id <id> [--simulate] [--fast-fail true]');
      console.log('  node scripts/eoc-scheduler.js status --run-id <id>');
      process.exit(0);
    }

    const runId = opts['run-id'];
    if (!runId) throw new Error('Missing --run-id');
    const run = loadRun(runId);

    switch (cmd) {
      case 'init': {
        initScheduler(run, opts.concurrency || 2, opts['fast-fail']);
        saveRun(run);
        printStatus(run);
        break;
      }
      case 'add-task': {
        initScheduler(run, run.scheduler?.concurrency || 2, run.scheduler?.fast_fail);
        const taskId = opts['task-id'];
        const command = opts.cmd;
        const validation = opts.validation;
        if (!taskId || !command || !validation) throw new Error('add-task requires --task-id, --cmd, and --validation');
        if (run.scheduler.tasks[taskId]) throw new Error(`Task exists: ${taskId}`);
        const task = {
          task_id: taskId,
          command,
          validation,
          deps: depList(opts.deps),
          timeout_sec: Number(opts.timeout || 600),
          retries: Number(opts.retries || 0),
          priority: Number(opts.priority || 100),
          owner_hint: String(opts.owner || 'fullstack'),
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
        initScheduler(run, run.scheduler?.concurrency || 2, run.scheduler?.fast_fail);
        await runScheduler(run, Boolean(opts.simulate), opts['fast-fail']);
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

module.exports = {
  runPath,
  loadRun,
  saveRun,
  initScheduler,
  runScheduler,
  runSchedulerById,
  printStatus,
};

if (require.main === module) {
  main();
}
