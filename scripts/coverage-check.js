#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const RUN_DIR = path.join(ROOT, '.opencode', 'eoc-run');

function getRunId(input) {
  if (input) return String(input);
  const active = path.join(RUN_DIR, 'active.json');
  if (!fs.existsSync(active)) return '';
  const parsed = JSON.parse(fs.readFileSync(active, 'utf8'));
  return String(parsed.run_id || '');
}

function runCoverageCheck(options = {}) {
  const runId = getRunId(options.runId);
  if (!runId) return { ok: false, detail: 'no run id provided and no active run' };
  const runPath = path.join(RUN_DIR, `${runId}.json`);
  if (!fs.existsSync(runPath)) return { ok: false, detail: `run not found: ${runId}` };
  const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
  const tasks = Object.values((run.scheduler && run.scheduler.tasks) || {});
  if (tasks.length === 0) return { ok: false, detail: 'no scheduler tasks found' };

  const validated = tasks.filter((t) => t.status === 'success').length;
  const pct = (validated / tasks.length) * 100;
  const threshold = Number(options.threshold || 100);
  const ok = pct >= threshold;
  return {
    ok,
    detail: `validated=${validated}/${tasks.length} (${pct.toFixed(1)}%) threshold=${threshold}%`,
    metrics: { validated, total: tasks.length, pct, threshold },
  };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;
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

function main() {
  const opts = parseArgs(process.argv);
  const r = runCoverageCheck({ runId: opts['run-id'], threshold: opts.threshold });
  if (!r.ok) {
    console.error(`[coverage-check] FAIL ${r.detail}`);
    process.exit(1);
  }
  console.log(`[coverage-check] PASS ${r.detail}`);
}

module.exports = { runCoverageCheck };

if (require.main === module) {
  main();
}
