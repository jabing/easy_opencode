#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const RUN_DIR = path.join(process.cwd(), '.opencode', 'eoc-run');

function runPath(runId) { return path.join(RUN_DIR, `${runId}.json`); }
function getRun(runId) {
  const p = runPath(runId);
  if (!fs.existsSync(p)) throw new Error(`Run not found: ${runId}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function durationMs(start, end) {
  if (!start || !end) return null;
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime());
}

function main() {
  try {
    const runId = process.argv[2];
    if (!runId) throw new Error('Usage: node scripts/eoc-metrics.js <run-id>');
    const run = getRun(runId);
    const sch = run.scheduler;
    if (!sch) {
      console.log('No scheduler metrics for this run.');
      process.exit(0);
    }

    const totalDuration = durationMs(sch.started_at, sch.ended_at);
    console.log(`Run ID: ${run.run_id}`);
    console.log(`Scheduler: ${sch.status}`);
    console.log(`Concurrency: ${sch.concurrency}`);
    console.log(`Started: ${sch.started_at || '(not started)'}`);
    console.log(`Ended: ${sch.ended_at || '(not ended)'}`);
    console.log(`DurationMs: ${totalDuration === null ? '(running)' : totalDuration}`);
    console.log(`Metrics: total=${sch.metrics.total} success=${sch.metrics.success} failed=${sch.metrics.failed} skipped=${sch.metrics.skipped || 0} retried=${sch.metrics.retried} timeout=${sch.metrics.timed_out}`);

    const tasks = Object.values(sch.tasks || {});
    for (const t of tasks) {
      const d = durationMs(t.started_at, t.ended_at);
      console.log(`- ${t.task_id} status=${t.status} attempts=${t.attempts || 0} durationMs=${d === null ? '(running)' : d}`);
    }
  } catch (err) {
    console.error(`[eoc-metrics] ${err.message}`);
    process.exit(1);
  }
}

main();
