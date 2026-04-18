const fs = require('fs');
const path = require('path');
const { ensureDir } = require('../../shared/fs.js');
const { nowIso } = require('../../shared/time.js');

/** @typedef {{ run_id: string, updated_at?: string } & Record<string, unknown>} SchedulerRun */

/** @param {string} runDir @param {string} runId */
function runPath(runDir, runId) {
  return path.join(runDir, `${runId}.json`);
}

/** @param {string} runDir @param {string} runId @returns {SchedulerRun} */
function loadRun(runDir, runId) {
  const p = runPath(runDir, runId);
  if (!fs.existsSync(p)) throw new Error(`Run not found: ${runId}`);
  return /** @type {SchedulerRun} */ (JSON.parse(fs.readFileSync(p, 'utf8')));
}

/** @param {string} runDir @param {SchedulerRun} run */
function saveRun(runDir, run) {
  ensureDir(runDir);
  run.updated_at = nowIso();
  fs.writeFileSync(runPath(runDir, run.run_id), JSON.stringify(run, null, 2) + '\n');
}

/** @param {string} runDir @param {string} runId @param {string} taskId */
function ensureTaskCtx(runDir, runId, taskId) {
  const base = path.join(runDir, runId, 'tasks', taskId);
  ensureDir(base);
  return base;
}

module.exports = {
  runPath,
  loadRun,
  saveRun,
  ensureTaskCtx,
};
