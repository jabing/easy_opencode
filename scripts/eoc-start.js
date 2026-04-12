#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RUN_DIR = path.join(process.cwd(), '.opencode', 'eoc-run');
const ACTIVE_FILE = path.join(RUN_DIR, 'active.json');

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

function ensureRunDir() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = args[0];
  const rest = args.slice(1);
  return { cmd, rest };
}

function parseOptions(tokens) {
  const opts = { _: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
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

function normalizeGate(input) {
  if (!input) return null;
  const cleaned = String(input).trim().toUpperCase();
  if (GATES.includes(cleaned)) return cleaned;
  if (/^\d+$/.test(cleaned)) {
    const n = Number(cleaned);
    if (n >= 0 && n < GATES.length) return GATES[n];
  }
  const alias = {
    PLAN_READY: 'GATE_0_PLAN_READY',
    SCOPE_LOCK: 'GATE_1_SCOPE_LOCK',
    IMPLEMENTATION: 'GATE_2_IMPLEMENTATION',
    QUALITY: 'GATE_3_QUALITY',
    REVIEW: 'GATE_4_REVIEW',
    DOCS_ARCHIVE: 'GATE_5_DOCS_ARCHIVE',
    RELEASE_READY: 'GATE_6_RELEASE_READY',
  };
  return alias[cleaned] || null;
}

function runPath(runId) {
  return path.join(RUN_DIR, `${runId}.json`);
}

function saveRun(run) {
  ensureRunDir();
  run.updated_at = new Date().toISOString();
  fs.writeFileSync(runPath(run.run_id), JSON.stringify(run, null, 2) + '\n');
}

function loadRun(runId) {
  const p = runPath(runId);
  if (!fs.existsSync(p)) {
    throw new Error(`Run not found: ${runId}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function setActive(runId) {
  ensureRunDir();
  fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ run_id: runId, updated_at: new Date().toISOString() }, null, 2) + '\n');
}

function getActiveRunId() {
  if (!fs.existsSync(ACTIVE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8')).run_id || null;
  } catch {
    return null;
  }
}

function getRunOrThrow(runId) {
  const id = runId || getActiveRunId();
  if (!id) throw new Error('No active run. Start one with `eoc-start start <objective>` or pass --run-id.');
  return loadRun(id);
}

function truthy(v) {
  return v === true || v === 'true' || v === '1' || v === 1;
}

function unmetForGate(run) {
  const s = run.state || {};
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

function nextGate(current) {
  const i = GATES.indexOf(current);
  if (i < 0 || i === GATES.length - 1) return null;
  return GATES[i + 1];
}

function parseValue(raw) {
  const v = String(raw);
  if (v.toLowerCase() === 'true') return true;
  if (v.toLowerCase() === 'false') return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  return raw;
}

function printRun(run) {
  console.log(`Run ID: ${run.run_id}`);
  console.log(`Objective: ${run.objective}`);
  console.log(`Plan ID: ${run.plan_id || '(none)'}`);
  console.log(`Current Gate: ${run.current_gate}`);
  console.log(`Status: ${run.status}`);
  console.log(`Created: ${run.created_at}`);
  console.log(`Updated: ${run.updated_at}`);
  if (run.pause_after_gate) {
    console.log(`Pause After Gate: ${run.pause_after_gate}`);
  }
  const unmet = unmetForGate(run);
  console.log(`Gate Check: ${unmet.length === 0 ? 'PASS' : 'BLOCKED'}`);
  if (unmet.length > 0) {
    console.log('Unmet Requirements:');
    unmet.forEach((u) => console.log(`- ${u}`));
  }
}

function usage() {
  console.log('Usage:');
  console.log('  node scripts/eoc-start.js start <objective> [--plan-id <id>] [--pause-after-gate <gate>]');
  console.log('  node scripts/eoc-start.js status [--run-id <id>]');
  console.log('  node scripts/eoc-start.js mark <field> <value> [--run-id <id>]');
  console.log('  node scripts/eoc-start.js advance [--run-id <id>]');
  console.log('  node scripts/eoc-start.js resume <run-id>');
  console.log('  node scripts/eoc-start.js list');
  console.log('');
  console.log('Common fields for `mark`:');
  console.log('  plan_confirmed, scope_locked, acceptance_criteria_locked');
  console.log('  implementation_completed, build_passed, test_passed, lint_passed, coverage_passed');
  console.log('  code_review_verdict, security_review_verdict');
  console.log('  docs_updated, archive_completed');
}

function cmdStart(rest) {
  const opts = parseOptions(rest);
  const objective = opts._.join(' ').trim();
  if (!objective) throw new Error('Missing objective.');
  const pauseAfterGate = normalizeGate(opts['pause-after-gate']);
  if (opts['pause-after-gate'] && !pauseAfterGate) {
    throw new Error(`Invalid --pause-after-gate: ${opts['pause-after-gate']}`);
  }

  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
  const run = {
    run_id: runId,
    objective,
    plan_id: opts['plan-id'] || null,
    current_gate: GATES[0],
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
      { at: new Date().toISOString(), event: 'run_started', gate: GATES[0], detail: `objective=${objective}` },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  saveRun(run);
  setActive(runId);
  printRun(run);
}

function cmdStatus(rest) {
  const opts = parseOptions(rest);
  const run = getRunOrThrow(opts['run-id']);
  printRun(run);
}

function cmdMark(rest) {
  const opts = parseOptions(rest);
  const field = opts._[0];
  const valueRaw = opts._[1];
  if (!field || valueRaw === undefined) {
    throw new Error('Usage: mark <field> <value> [--run-id <id>]');
  }
  const run = getRunOrThrow(opts['run-id']);
  run.state[field] = parseValue(valueRaw);
  run.history.push({ at: new Date().toISOString(), event: 'mark', gate: run.current_gate, detail: `${field}=${valueRaw}` });
  saveRun(run);
  printRun(run);
}

function markField(runId, field, value) {
  const run = getRunOrThrow(runId);
  run.state[field] = value;
  run.history.push({ at: new Date().toISOString(), event: 'mark', gate: run.current_gate, detail: `${field}=${value}` });
  saveRun(run);
  return run;
}

function cmdAdvance(rest) {
  const opts = parseOptions(rest);
  const run = getRunOrThrow(opts['run-id']);
  if (run.current_gate === 'GATE_6_RELEASE_READY') {
    console.log('Already at final gate.');
    printRun(run);
    return;
  }

  const unmet = unmetForGate(run);
  if (unmet.length > 0) {
    console.log('Gate blocked. Fix unmet requirements before advancing:');
    unmet.forEach((u) => console.log(`- ${u}`));
    return;
  }

  const prev = run.current_gate;
  const next = nextGate(prev);
  if (!next) {
    console.log('No next gate available.');
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

function advanceGate(runId) {
  const run = getRunOrThrow(runId);
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
    console.log('No runs found.');
    return;
  }
  const active = getActiveRunId();
  for (const file of files) {
    const run = JSON.parse(fs.readFileSync(path.join(RUN_DIR, file), 'utf8'));
    const tag = run.run_id === active ? '*' : ' ';
    console.log(`${tag} ${run.run_id}  ${run.status.padEnd(9)}  ${run.current_gate}  ${run.objective}`);
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
    console.error(`[eoc-start] ${err.message}`);
    usage();
    process.exit(1);
  }
}

module.exports = {
  GATES,
  loadRun,
  saveRun,
  setActive,
  getActiveRunId,
  getRunOrThrow,
  unmetForGate,
  markField,
  advanceGate,
  printRun,
};

if (require.main === module) {
  main();
}
