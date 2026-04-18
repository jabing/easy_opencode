const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readLatestPlanId: readLatestPlanPointerId } = require('../../control-plane/orchestrator/memory.js');

function nowIso() {
  return new Date().toISOString();
}

function newPlanId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `impl-${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

/** @param {string | undefined | null} rootDir */
function resolvePlanDir(rootDir) {
  return path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'implementation-plans');
}

/** @param {string} dir */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** @param {string} filePath @param {unknown} data */
function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** @param {string} filePath */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** @param {string | undefined | null} rootDir */
function loadLatestPlanId(rootDir) {
  return readLatestPlanPointerId(rootDir);
}

/** @param {string | undefined | null} planId @param {string | undefined | null} rootDir */
function loadPlan(planId, rootDir) {
  const resolvedPlanId = planId || loadLatestPlanId(rootDir);
  if (!resolvedPlanId) throw new Error('plan id is required and no latest plan exists');
  const planPath = path.join(resolvePlanDir(rootDir), resolvedPlanId, 'plan.json');
  if (!fs.existsSync(planPath)) throw new Error(`plan not found: ${resolvedPlanId}`);
  return readJson(planPath);
}

/** @param {{ root_dir: string, plan_id: string }} plan */
function savePlan(plan) {
  const planRoot = path.join(resolvePlanDir(plan.root_dir), plan.plan_id);
  ensureDir(planRoot);
  writeJson(path.join(planRoot, 'plan.json'), plan);
}

module.exports = {
  nowIso,
  newPlanId,
  resolvePlanDir,
  ensureDir,
  writeJson,
  readJson,
  loadLatestPlanId,
  loadPlan,
  savePlan,
};
