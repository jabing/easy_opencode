#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  loadCommandPolicy,
  assertSafeTaskId,
  validateRunnableCommand,
  normalizeWorkdir,
  normalizeTimeout,
  normalizeRetries,
  validateSchedulerLimits,
} = require('../control-plane/policy/execution-policy.js');
const { runManagedScript, formatManagedInvocation } = require('./runtime-paths.js');

/**
 * @typedef {{ _: string[], [key: string]: string | boolean | string[] | undefined }} CliOptions
 * @typedef {{ id?: string, task_id?: string, command?: string, cmd?: string, validation?: string, priority?: number | string, deps?: string[] | string, timeout_sec?: number | string, timeout?: number | string, retries?: number | string, owner_hint?: string, workdir?: string }} PacketTask
 * @typedef {{ tasks?: PacketTask[], objective?: string, plan_id?: string | null, recommended_concurrency?: number | string, fast_fail?: boolean | string }} ExecutionPacket
 * @typedef {{ task_id: string, command: string, validation: string, deps: string[], timeout_sec: number, retries: number, priority: number, owner_hint: string, workdir: string, status: string, attempts: number, created_at: string }} SchedulerTask
 * @typedef {{ concurrency: number }} SchedulerLimits
 * @typedef {{ run_id: string, objective: string, plan_id: string | null, current_gate: string, status: string, pause_after_gate: string | null, state: Record<string, boolean | string>, scheduler: { concurrency: number, fast_fail: boolean, tasks: Record<string, SchedulerTask>, started_at: string | null, ended_at: string | null, status: string, errors: string[], metrics: Record<string, number> }, history: { at: string, event: string, gate: string, detail: string }[], created_at: string, updated_at: string }} BridgeRun
 */

function printLine(line = '') { process.stdout.write(String(line) + '\n'); }
function printError(line = '') { process.stderr.write(String(line) + '\n'); }

const RUN_DIR = path.join(process.cwd(), '.opencode', 'eoc-run');
const ACTIVE_FILE = path.join(RUN_DIR, 'active.json');
const OWNER_HINTS = new Set(['backend', 'frontend', 'fullstack', 'qa', 'docs']);

/** @param {string} p */
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

/** @param {string[]} argv @returns {CliOptions} */
function parseArgs(argv) {
  /** @type {CliOptions} */
  const opts = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (typeof t !== 'string') continue;
    if (!t.startsWith('--')) {
      opts._.push(t);
      continue;
    }
    const k = t.slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith('--')) opts[k] = true;
    else {
      opts[k] = n;
      i += 1;
    }
  }
  return opts;
}

/** @param {string | boolean | number | undefined} v @param {boolean} [fallback=false] */
function toBool(v, fallback = false) {
  if (v === undefined) return fallback;
  return v === true || v === 'true' || v === '1' || v === 1;
}

/** @param {string | boolean | number | undefined} v @param {number} fallback */
function toNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** @param {string} raw @returns {ExecutionPacket} */
function extractPacket(raw) {
  const clean = String(raw).replace(/^\uFEFF/, '');
  try {
    return /** @type {ExecutionPacket} */ (JSON.parse(clean));
  } catch {
    const re = /```json\s*([\s\S]*?)```/g;
    /** @type {RegExpExecArray | null} */
    let m = null;
    while ((m = re.exec(clean)) !== null) {
      const candidate = m[1] || '';
      try {
        const parsed = /** @type {ExecutionPacket} */ (JSON.parse(candidate));
        if (parsed && Array.isArray(parsed.tasks)) return parsed;
      } catch {
        // keep scanning
      }
    }
    throw new Error('Failed to parse packet JSON. Provide a JSON file or markdown containing a valid ```json block.');
  }
}

/** @param {CliOptions} opts @returns {ExecutionPacket} */
function readPacket(opts) {
  if (typeof opts.packet === 'string' && opts.packet) {
    const p = path.resolve(process.cwd(), opts.packet);
    if (!fs.existsSync(p)) throw new Error(`Packet file not found: ${p}`);
    return extractPacket(fs.readFileSync(p, 'utf8'));
  }
  if (toBool(typeof opts.stdin === 'string' || typeof opts.stdin === 'boolean' ? opts.stdin : undefined, false)) {
    const raw = fs.readFileSync(0, 'utf8');
    return extractPacket(raw);
  }
  throw new Error('Missing packet input. Use --packet <file> or --stdin.');
}

/** @param {string[] | string | undefined} deps */
function normalizeDeps(deps) {
  if (!deps) return [];
  if (Array.isArray(deps)) return deps.map(String).map((x) => x.trim()).filter(Boolean);
  return String(deps)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** @param {string | undefined} raw @param {string} taskId */
function normalizeOwnerHint(raw, taskId) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return 'fullstack';
  if (!OWNER_HINTS.has(value)) {
    throw new Error(`Task "${taskId}" owner_hint must be one of: backend|frontend|fullstack|qa|docs`);
  }
  return value;
}

/** @param {PacketTask} t @param {any} policy @returns {SchedulerTask} */
function normalizeTask(t, policy) {
  const id = assertSafeTaskId(t.id || t.task_id || '', policy);
  const command = validateRunnableCommand(t.command || t.cmd || '', 'command (command/cmd)', id, policy);
  const validation = validateRunnableCommand(t.validation || '', 'validation', id, policy);
  const priority = toNum(t.priority, 100);
  if (!Number.isFinite(priority) || priority < 1 || priority > 200) {
    throw new Error(`Task "${id}" priority must be between 1 and 200`);
  }
  return {
    task_id: id,
    command,
    validation,
    deps: normalizeDeps(t.deps),
    timeout_sec: normalizeTimeout(t.timeout_sec ?? t.timeout ?? 600, policy, id),
    retries: normalizeRetries(t.retries ?? 0, policy, id),
    priority,
    owner_hint: normalizeOwnerHint(t.owner_hint, id),
    workdir: normalizeWorkdir(t.workdir || process.cwd(), process.cwd(), id),
    status: 'queued',
    attempts: 0,
    created_at: nowIso(),
  };
}

/** @param {SchedulerTask[]} tasks */
function validateTasks(tasks) {
  const ids = new Set();
  for (const t of tasks) {
    if (ids.has(t.task_id)) throw new Error(`Duplicate task id: ${t.task_id}`);
    ids.add(t.task_id);
  }
  for (const t of tasks) {
    for (const dep of t.deps) {
      if (!ids.has(dep)) throw new Error(`Task "${t.task_id}" depends on missing "${dep}"`);
      if (dep === t.task_id) throw new Error(`Task "${t.task_id}" cannot depend on itself`);
    }
  }
}

/** @param {string} runId */
function runPath(runId) {
  return path.join(RUN_DIR, `${runId}.json`);
}

/** @param {BridgeRun} run */
function saveRun(run) {
  ensureDir(RUN_DIR);
  run.updated_at = nowIso();
  fs.writeFileSync(runPath(run.run_id), JSON.stringify(run, null, 2) + '\n', 'utf8');
}

/** @param {string} runId */
function setActive(runId) {
  ensureDir(RUN_DIR);
  fs.writeFileSync(
    ACTIVE_FILE,
    JSON.stringify({ run_id: runId, updated_at: nowIso(), source: 'eoc-bridge' }, null, 2) + '\n',
    'utf8'
  );
}

/** @param {ExecutionPacket} packet @param {CliOptions} opts @returns {BridgeRun} */
function buildRun(packet, opts) {
  const policy = loadCommandPolicy({ rootDir: process.cwd(), runDir: RUN_DIR });
  const runId = typeof opts['run-id'] === 'string' && opts['run-id']
    ? opts['run-id']
    : `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
  const tasks = (packet.tasks || []).map((task) => normalizeTask(task, policy));
  validateTasks(tasks);
  /** @type {SchedulerLimits} */
  const schedulerLimits = validateSchedulerLimits(tasks.length, toNum(packet.recommended_concurrency ?? (typeof opts.concurrency === 'string' || typeof opts.concurrency === 'number' ? opts.concurrency : undefined), 2), policy);

  const objective = String((typeof opts.objective === 'string' ? opts.objective : undefined) || packet.objective || 'bridged-plan').trim();
  /** @type {Record<string, SchedulerTask>} */
  const schedulerTasks = {};
  for (const t of tasks) schedulerTasks[t.task_id] = t;

  return {
    run_id: runId,
    objective,
    plan_id: typeof opts['plan-id'] === 'string' ? opts['plan-id'] : packet.plan_id || null,
    current_gate: 'GATE_0_PLAN_READY',
    status: 'active',
    pause_after_gate: null,
    state: {
      plan_confirmed: toBool(typeof opts['plan-confirmed'] === 'string' || typeof opts['plan-confirmed'] === 'boolean' ? opts['plan-confirmed'] : undefined, true),
      scope_locked: false,
      acceptance_criteria_locked: false,
      implementation_completed: false,
      build_passed: false,
      test_passed: false,
      lint_passed: false,
      coverage_passed: false,
      code_review_verdict: '',
      security_review_verdict: '',
      docs_updated: false,
      archive_completed: false,
    },
    scheduler: {
      concurrency: schedulerLimits.concurrency,
      fast_fail: toBool((typeof opts['fast-fail'] === 'string' || typeof opts['fast-fail'] === 'boolean') ? opts['fast-fail'] : packet.fast_fail, false),
      tasks: schedulerTasks,
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
    },
    history: [
      { at: nowIso(), event: 'bridge_imported', gate: 'GATE_0_PLAN_READY', detail: `tasks=${tasks.length}` },
    ],
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

/** @param {string} runId @param {CliOptions} opts */
function executeScheduler(runId, opts) {
  /** @type {string[]} */
  const args = ['run', '--run-id', runId];
  if (toBool(typeof opts.simulate === 'string' || typeof opts.simulate === 'boolean' ? opts.simulate : undefined, false)) args.push('--simulate');
  if (opts['fast-fail'] !== undefined) {
    args.push('--fast-fail', String(opts['fast-fail']));
  }
  const r = runManagedScript('eoc-scheduler', args, { cwd: process.cwd(), stdio: 'inherit' });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`Scheduler execution failed with code ${r.status}`);
  }
}

function usage() {
  printLine('Usage:');
  printLine(`  ${formatManagedInvocation('eoc-bridge', ['--packet', '<execution-packet.json>', '--objective', '...', '--plan-id', 'PLAN-1'])}`);
  printLine(`  ${formatManagedInvocation('eoc-bridge', ['--stdin', '--execute', '--simulate'])}`);
  printLine('Options:');
  printLine('  --concurrency <n>      Override packet recommended_concurrency');
  printLine('  --fast-fail true|false Override packet fast_fail');
  printLine('  --execute              Run scheduler immediately after import');
  printLine('  --plan-confirmed true|false  Defaults to true');
  printLine('Packet requirements per task: id, command, validation, deps, priority(1-200), owner_hint(optional)');
}

function main() {
  try {
    const opts = parseArgs(process.argv);
    if (opts.help || opts.h || process.argv.length <= 2) {
      usage();
      process.exit(0);
    }
    const packet = readPacket(opts);
    if (!Array.isArray(packet.tasks) || packet.tasks.length === 0) {
      throw new Error('Execution packet must include non-empty tasks array.');
    }
    const run = buildRun(packet, opts);
    saveRun(run);
    setActive(run.run_id);

    printLine(`Bridge import complete. Run ID: ${run.run_id}`);
    printLine(`Objective: ${run.objective}`);
    printLine(`Tasks: ${Object.keys(run.scheduler.tasks).length}`);
    printLine(`Concurrency: ${run.scheduler.concurrency}`);
    printLine(`Fast Fail: ${run.scheduler.fast_fail}`);
    printLine('Next: ' + formatManagedInvocation('eoc-scheduler', ['run', '--run-id', run.run_id]));

    if (toBool(typeof opts.execute === 'string' || typeof opts.execute === 'boolean' ? opts.execute : undefined, false)) {
      executeScheduler(run.run_id, opts);
    }
  } catch (err) {
    printError(`[eoc-bridge] ${err instanceof Error ? err.message : String(err)}`);
    usage();
    process.exit(1);
  }
}

/** @param {ExecutionPacket} packet @param {CliOptions} [opts={}] */
function bridgeFromPacket(packet, opts = { _: [] }) {
  if (!Array.isArray(packet.tasks) || packet.tasks.length === 0) {
    throw new Error('Execution packet must include non-empty tasks array.');
  }
  const run = buildRun(packet, opts);
  saveRun(run);
  setActive(run.run_id);
  if (toBool(typeof opts.execute === 'string' || typeof opts.execute === 'boolean' ? opts.execute : undefined, false)) executeScheduler(run.run_id, opts);
  return run;
}

/** @param {CliOptions} [opts={_: []}] @param {string} [stdinRaw] */
function bridgeFromOptions(opts = { _: [] }, stdinRaw) {
  /** @type {ExecutionPacket} */
  let packet;
  if (stdinRaw !== undefined) packet = extractPacket(stdinRaw);
  else packet = readPacket(opts);
  return bridgeFromPacket(packet, opts);
}

module.exports = {
  bridgeFromOptions,
  bridgeFromPacket,
  buildRun,
  extractPacket,
  main,
  normalizeTask,
  readPacket,
  saveRun,
  setActive,
  validateTasks,
};

if (require.main === module) {
  main();
}
