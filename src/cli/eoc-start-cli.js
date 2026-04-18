#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { formatManagedInvocation } = require('../cli/runtime-paths.js');
const { rememberGateRun } = require('../control-plane/orchestrator/memory.js');

/**
 * @typedef {{ _: string[], [key: string]: string | boolean | string[] | undefined }} CliOptions
 * @typedef {'GATE_0_PLAN_READY'|'GATE_1_SCOPE_LOCK'|'GATE_2_IMPLEMENTATION'|'GATE_3_QUALITY'|'GATE_4_REVIEW'|'GATE_5_DOCS_ARCHIVE'|'GATE_6_RELEASE_READY'} GateName
 * @typedef {{ at: string, event: string, gate: GateName, detail: string }} RunHistoryEvent
 * @typedef {{ plan_confirmed: boolean, scope_locked: boolean, acceptance_criteria_locked: boolean, implementation_completed: boolean, build_passed: boolean, test_passed: boolean, lint_passed: boolean, coverage_passed: boolean, code_review_verdict: string, security_review_verdict: string, docs_updated: boolean, archive_completed: boolean, [key: string]: boolean | string | number }} RunState
 * @typedef {{ run_id: string, objective: string, root_dir: string, plan_id: string | null, current_gate: GateName, status: string, pause_after_gate: GateName | null, state: RunState, history: RunHistoryEvent[], created_at: string, updated_at: string }} GateRun
 */

const RUN_DIR = path.join(process.cwd(), '.opencode', 'eoc-run');
const ACTIVE_FILE = path.join(RUN_DIR, 'active.json');

/** @type {GateName[]} */
const GATES = [
  'GATE_0_PLAN_READY',
  'GATE_1_SCOPE_LOCK',
  'GATE_2_IMPLEMENTATION',
  'GATE_3_QUALITY',
  'GATE_4_REVIEW',
  'GATE_5_DOCS_ARCHIVE',
  'GATE_6_RELEASE_READY',
];

const VERDICT_OK = new Set(['APPROVE', 'APPROVE_WITH_WARNINGS']);
/** @type {Record<GateName, Set<string>>} */
const GATE_FIELD_RULES = {
  GATE_0_PLAN_READY: new Set(['plan_confirmed']),
  GATE_1_SCOPE_LOCK: new Set(['scope_locked', 'acceptance_criteria_locked']),
  GATE_2_IMPLEMENTATION: new Set(['implementation_completed']),
  GATE_3_QUALITY: new Set(['build_passed', 'test_passed', 'lint_passed', 'coverage_passed']),
  GATE_4_REVIEW: new Set(['code_review_verdict', 'security_review_verdict']),
  GATE_5_DOCS_ARCHIVE: new Set(['docs_updated', 'archive_completed']),
  GATE_6_RELEASE_READY: new Set([]),
};

/** @type {Record<string, GateName>} */
const GATE_ALIASES = {
  PLAN_READY: 'GATE_0_PLAN_READY',
  SCOPE_LOCK: 'GATE_1_SCOPE_LOCK',
  IMPLEMENTATION: 'GATE_2_IMPLEMENTATION',
  QUALITY: 'GATE_3_QUALITY',
  REVIEW: 'GATE_4_REVIEW',
  DOCS_ARCHIVE: 'GATE_5_DOCS_ARCHIVE',
  RELEASE_READY: 'GATE_6_RELEASE_READY',
};

function printLine(line = '') {
  process.stdout.write(String(line) + '\n');
}

function ensureRunDir() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = args[0];
  const rest = args.slice(1);
  return { cmd, rest };
}

/** @param {string[]} tokens @returns {CliOptions} */
function parseOptions(tokens) {
  /** @type {CliOptions} */
  const opts = { _: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (typeof t !== 'string') continue;
    if (!t.startsWith('--')) {
      opts._.push(t);
      continue;
    }
    const key = t.slice(2);
    const next = tokens[i + 1];
    if (!next || next.startsWith('--')) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i += 1;
    }
  }
  return opts;
}

/** @param {string | number | boolean | undefined} input @returns {GateName | null} */
function normalizeGate(input) {
  if (!input) return null;
  const cleaned = String(input).trim().toUpperCase();
  if (GATES.includes(/** @type {GateName} */ (cleaned))) return /** @type {GateName} */ (cleaned);
  if (/^\d+$/.test(cleaned)) {
    const n = Number(cleaned);
    if (n >= 0 && n < GATES.length) return GATES[n] || null;
  }
  return GATE_ALIASES[cleaned] || null;
}

/** @param {string} runId */
function runPath(runId) {
  return path.join(RUN_DIR, `${runId}.json`);
}

/** @param {GateRun} run */
function saveRun(run) {
  ensureRunDir();
  run.updated_at = new Date().toISOString();
  fs.writeFileSync(runPath(run.run_id), JSON.stringify(run, null, 2) + '\n');
  rememberGateRun(run);
}

/** @param {string} runId @returns {GateRun} */
function loadRun(runId) {
  const p = runPath(runId);
  if (!fs.existsSync(p)) {
    throw new Error(`Run not found: ${runId}`);
  }
  return /** @type {GateRun} */ (JSON.parse(fs.readFileSync(p, 'utf8')));
}

/** @param {string} runId */
function setActive(runId) {
  ensureRunDir();
  fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ run_id: runId, updated_at: new Date().toISOString() }, null, 2) + '\n');
}

function getActiveRunId() {
  if (!fs.existsSync(ACTIVE_FILE)) return null;
  try {
    const raw = /** @type {{ run_id?: string }} */ (JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8')));
    return raw.run_id || null;
  } catch {
    return null;
  }
}

/** @param {string | null | undefined} runId */
function getRunOrThrow(runId) {
  const id = runId || getActiveRunId();
  if (!id) throw new Error('No active run. Start one with `eoc-start start <objective>` or pass --run-id.');
  return loadRun(id);
}

/** @param {string | number | boolean | undefined} v */
function truthy(v) {
  return v === true || v === 'true' || v === '1' || v === 1;
}

/** @param {GateRun} run */
function unmetForGate(run) {
  const s = run.state || /** @type {RunState} */ ({ });
  switch (run.current_gate) {
    case 'GATE_0_PLAN_READY':
      return truthy(s.plan_confirmed) ? [] : ['plan_confirmed=true'];
    case 'GATE_1_SCOPE_LOCK':
      return [
        truthy(s.scope_locked) ? null : 'scope_locked=true',
        truthy(s.acceptance_criteria_locked) ? null : 'acceptance_criteria_locked=true',
      ].filter(Boolean);
    case 'GATE_2_IMPLEMENTATION':
      return truthy(s.implementation_completed) ? [] : ['implementation_completed=true'];
    case 'GATE_3_QUALITY':
      return [
        truthy(s.build_passed) ? null : 'build_passed=true',
        truthy(s.test_passed) ? null : 'test_passed=true',
        truthy(s.lint_passed) ? null : 'lint_passed=true',
        truthy(s.coverage_passed) ? null : 'coverage_passed=true',
      ].filter(Boolean);
    case 'GATE_4_REVIEW':
      return [
        VERDICT_OK.has(String(s.code_review_verdict || '').toUpperCase()) ? null : 'code_review_verdict=APPROVE|APPROVE_WITH_WARNINGS',
        VERDICT_OK.has(String(s.security_review_verdict || '').toUpperCase()) ? null : 'security_review_verdict=APPROVE|APPROVE_WITH_WARNINGS',
      ].filter(Boolean);
    case 'GATE_5_DOCS_ARCHIVE':
      return [
        truthy(s.docs_updated) ? null : 'docs_updated=true',
        truthy(s.archive_completed) ? null : 'archive_completed=true',
      ].filter(Boolean);
    case 'GATE_6_RELEASE_READY':
      return [];
    default:
      return ['unknown gate'];
  }
}

/** @param {GateName} current */
function nextGate(current) {
  const i = GATES.indexOf(current);
  if (i < 0 || i === GATES.length - 1) return null;
  return GATES[i + 1] || null;
}

/** @param {string | number | boolean} raw @returns {string | number | boolean} */
function parseValue(raw) {
  const v = String(raw);
  if (v.toLowerCase() === 'true') return true;
  if (v.toLowerCase() === 'false') return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  return raw;
}

/** @param {GateRun} run @param {string} field */
function assertFieldWritable(run, field) {
  if (!Object.values(GATE_FIELD_RULES).some((fields) => fields.has(field))) {
    throw new Error(`Unknown or restricted state field: ${field}`);
  }
  const gateFields = GATE_FIELD_RULES[run.current_gate] || new Set();
  if (!gateFields.has(field)) {
    throw new Error(`Field "${field}" cannot be changed at ${run.current_gate}`);
  }
}

/** @param {GateRun} run */
function printRun(run) {
  printLine(`Run ID: ${run.run_id}`);
  printLine(`Objective: ${run.objective}`);
  printLine(`Plan ID: ${run.plan_id || '(none)'}`);
  printLine(`Current Gate: ${run.current_gate}`);
  printLine(`Status: ${run.status}`);
  printLine(`Created: ${run.created_at}`);
  printLine(`Updated: ${run.updated_at}`);
  if (run.pause_after_gate) {
    printLine(`Pause After Gate: ${run.pause_after_gate}`);
  }
  const unmet = unmetForGate(run);
  printLine(`Gate Check: ${unmet.length === 0 ? 'PASS' : 'BLOCKED'}`);
  if (unmet.length > 0) {
    printLine('Unmet Requirements:');
    unmet.forEach((u) => printLine(`- ${u}`));
  }
}

function usage() {
  printLine('Usage:');
  printLine(`  ${formatManagedInvocation('eoc-start', ['start', '<objective>', '[--plan-id', '<id>]', '[--pause-after-gate', '<gate>]'])}`);
  printLine(`  ${formatManagedInvocation('eoc-start', ['status', '[--run-id', '<id>]'])}`);
  printLine(`  ${formatManagedInvocation('eoc-start', ['mark', '<field>', '<value>', '[--run-id', '<id>]'])}`);
  printLine(`  ${formatManagedInvocation('eoc-start', ['advance', '[--run-id', '<id>]'])}`);
  printLine(`  ${formatManagedInvocation('eoc-start', ['resume', '<run-id>'])}`);
  printLine(`  ${formatManagedInvocation('eoc-start', ['list'])}`);
  printLine('');
  printLine('Common fields for `mark`:');
  printLine('  plan_confirmed, scope_locked, acceptance_criteria_locked');
  printLine('  implementation_completed, build_passed, test_passed, lint_passed, coverage_passed');
  printLine('  code_review_verdict, security_review_verdict');
  printLine('  docs_updated, archive_completed');
}

/** @param {string[]} rest */
function cmdStart(rest) {
  const opts = parseOptions(rest);
  const objective = opts._.join(' ').trim();
  if (!objective) throw new Error('Missing objective.');
  const pauseAfterGate = normalizeGate(typeof opts['pause-after-gate'] === 'string' || typeof opts['pause-after-gate'] === 'number' || typeof opts['pause-after-gate'] === 'boolean' ? opts['pause-after-gate'] : undefined);
  if (opts['pause-after-gate'] && !pauseAfterGate) {
    throw new Error(`Invalid --pause-after-gate: ${opts['pause-after-gate']}`);
  }

  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
  /** @type {GateRun} */
  const run = {
    run_id: runId,
    objective,
    root_dir: process.cwd(),
    plan_id: typeof opts['plan-id'] === 'string' ? opts['plan-id'] : null,
    current_gate: /** @type {GateName} */ (GATES[0]),
    status: 'active',
    pause_after_gate: pauseAfterGate || null,
    state: {
      plan_confirmed: false,
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
    history: [
      { at: new Date().toISOString(), event: 'run_started', gate: /** @type {GateName} */ (GATES[0]), detail: `objective=${objective}` },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  saveRun(run);
  setActive(runId);
  printRun(run);
}

/** @param {string[]} rest */
function cmdStatus(rest) {
  const opts = parseOptions(rest);
  const run = getRunOrThrow(typeof opts['run-id'] === 'string' ? opts['run-id'] : undefined);
  printRun(run);
}

/** @param {string[]} rest */
function cmdMark(rest) {
  const opts = parseOptions(rest);
  const field = opts._[0];
  const valueRaw = opts._[1];
  if (!field || valueRaw === undefined) {
    throw new Error('Usage: mark <field> <value> [--run-id <id>]');
  }
  const run = getRunOrThrow(typeof opts['run-id'] === 'string' ? opts['run-id'] : undefined);
  assertFieldWritable(run, field);
  run.state[field] = parseValue(valueRaw);
  run.history.push({ at: new Date().toISOString(), event: 'mark', gate: run.current_gate, detail: `${field}=${valueRaw}` });
  saveRun(run);
  printRun(run);
}

/** @param {string | null | undefined} runId @param {string} field @param {string | number | boolean} value */
function markField(runId, field, value) {
  const run = getRunOrThrow(runId || undefined);
  assertFieldWritable(run, field);
  run.state[field] = value;
  run.history.push({ at: new Date().toISOString(), event: 'mark', gate: run.current_gate, detail: `${field}=${value}` });
  saveRun(run);
  return run;
}

/** @param {string[]} rest */
function cmdAdvance(rest) {
  const opts = parseOptions(rest);
  const run = getRunOrThrow(typeof opts['run-id'] === 'string' ? opts['run-id'] : undefined);
  if (run.current_gate === 'GATE_6_RELEASE_READY') {
    printLine('Already at final gate.');
    printRun(run);
    return;
  }

  const unmet = unmetForGate(run);
  if (unmet.length > 0) {
    printLine('Gate blocked. Fix unmet requirements before advancing:');
    unmet.forEach((u) => printLine(`- ${u}`));
    return;
  }

  const prev = run.current_gate;
  const next = nextGate(prev);
  if (!next) {
    printLine('No next gate available.');
    return;
  }

  run.current_gate = next;
  run.history.push({ at: new Date().toISOString(), event: 'advance', gate: next, detail: `from=${prev}` });

  if (run.pause_after_gate && run.pause_after_gate === next) {
    run.status = 'paused';
    run.history.push({ at: new Date().toISOString(), event: 'paused', gate: next, detail: 'pause-after-gate reached' });
  } else {
    run.status = next === 'GATE_6_RELEASE_READY' ? 'completed' : 'active';
  }

  saveRun(run);
  printRun(run);
}

/** @param {string | null | undefined} runId */
function advanceGate(runId) {
  const run = getRunOrThrow(runId || undefined);
  if (run.current_gate === 'GATE_6_RELEASE_READY') return { advanced: false, reason: 'final', run };
  const unmet = unmetForGate(run);
  if (unmet.length > 0) return { advanced: false, reason: 'blocked', unmet, run };
  const prev = run.current_gate;
  const next = nextGate(prev);
  if (!next) return { advanced: false, reason: 'no_next', run };
  run.current_gate = next;
  run.history.push({ at: new Date().toISOString(), event: 'advance', gate: next, detail: `from=${prev}` });
  if (run.pause_after_gate && run.pause_after_gate === next) {
    run.status = 'paused';
    run.history.push({ at: new Date().toISOString(), event: 'paused', gate: next, detail: 'pause-after-gate reached' });
  } else {
    run.status = next === 'GATE_6_RELEASE_READY' ? 'completed' : 'active';
  }
  saveRun(run);
  return { advanced: true, run };
}

/** @param {string[]} rest */
function cmdResume(rest) {
  const runId = rest[0];
  if (!runId) throw new Error('Usage: resume <run-id>');
  const run = loadRun(runId);
  run.status = run.current_gate === 'GATE_6_RELEASE_READY' ? 'completed' : 'active';
  run.history.push({ at: new Date().toISOString(), event: 'resumed', gate: run.current_gate, detail: 'manual resume' });
  saveRun(run);
  setActive(runId);
  printRun(run);
}

function cmdList() {
  ensureRunDir();
  const files = fs.readdirSync(RUN_DIR).filter((f) => f.endsWith('.json') && f !== 'active.json').sort();
  if (files.length === 0) {
    printLine('No runs found.');
    return;
  }
  const active = getActiveRunId();
  for (const file of files) {
    const run = /** @type {GateRun} */ (JSON.parse(fs.readFileSync(path.join(RUN_DIR, file), 'utf8')));
    const tag = run.run_id === active ? '*' : ' ';
    printLine(`${tag} ${run.run_id}  ${run.status.padEnd(9)}  ${run.current_gate}  ${run.objective}`);
  }
}

function main() {
  try {
    ensureRunDir();
    const { cmd, rest } = parseArgs(process.argv);
    if (!cmd || cmd === 'help' || cmd === '--help') {
      usage();
      process.exit(0);
    }
    switch (cmd) {
      case 'start':
        cmdStart(rest);
        break;
      case 'status':
        cmdStatus(rest);
        break;
      case 'mark':
        cmdMark(rest);
        break;
      case 'advance':
        cmdAdvance(rest);
        break;
      case 'resume':
        cmdResume(rest);
        break;
      case 'list':
        cmdList();
        break;
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  } catch (err) {
    console.error(`[eoc-start] ${err instanceof Error ? err.message : String(err)}`);
    usage();
    process.exit(1);
  }
}

module.exports = {
  main,
  GATES,
  loadRun,
  saveRun,
  setActive,
  getActiveRunId,
  getRunOrThrow,
  unmetForGate,
  assertFieldWritable,
  markField,
  advanceGate,
  printRun,
};

if (require.main === module) {
  main();
}
