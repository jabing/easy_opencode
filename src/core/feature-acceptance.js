const fs = require('fs');
const path = require('path');
const { buildFeatureDeliverySummary } = require('./feature-delivery.js');

/** @typedef {{ ok: boolean, check: string, detail: string }} AcceptanceCheck */
/** @typedef {{ feature_name?: string, status?: string }} GenerationHistoryItem */
/** @typedef {{ feature_name?: string }} LastFeatureGeneration */
/** @typedef {{ generation_history?: GenerationHistoryItem[], last_feature_generation?: LastFeatureGeneration }} ProjectMemory */
/** @typedef {{ verify_commands?: string[] }} FeaturePlan */

/** @param {string} filePath @returns {any | null} */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {string} root @param {string} filePath @returns {string} */
function normalizeRel(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

/** @param {string} root @returns {string[]} */
function listFeatureNames(root) {
  const names = new Set();
  const planDir = path.join(root, '.opencode', 'feature-plans');
  const bundleDir = path.join(root, '.opencode', 'feature-bundles');
  if (fs.existsSync(planDir)) {
    for (const name of fs.readdirSync(planDir)) {
      const m = String(name).match(/^(.*)\.json$/);
      if (m && m[1]) names.add(m[1]);
    }
  }
  if (fs.existsSync(bundleDir)) {
    for (const name of fs.readdirSync(bundleDir)) {
      const m = String(name).match(/^(.*)\.integration\.(json|md)$/);
      if (m && m[1]) names.add(m[1]);
    }
  }
  /** @type {ProjectMemory} */
  const memory = readJsonSafe(path.join(root, '.opencode', 'project-memory.json')) || {};
  const last = String((memory.last_feature_generation && memory.last_feature_generation.feature_name) || '').trim();
  if (last) names.add(last);
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/** @param {string} root @param {string} featureName */
function summarizeFeature(root, featureName) {
  const delivery = buildFeatureDeliverySummary(root, featureName);
  /** @type {ProjectMemory} */
  const memory = readJsonSafe(path.join(root, '.opencode', 'project-memory.json')) || {};
  const history = Array.isArray(memory.generation_history) ? memory.generation_history : [];
  const related = history.filter((item) => String((item && item.feature_name) || '').trim() === featureName);
  const lastRun = related.length > 0 ? related[related.length - 1] : null;
  /** @type {FeaturePlan} */
  const plan = readJsonSafe(path.join(root, '.opencode', 'feature-plans', `${featureName}.json`)) || {};
  const verify = Array.isArray(plan.verify_commands) ? plan.verify_commands.filter((item) => typeof item === 'string') : [];
  /** @type {AcceptanceCheck[]} */
  const acceptanceChecks = [
    { ok: delivery.validation ? delivery.validation.ok : false, check: 'feature.bundle', detail: delivery.validation ? delivery.validation.summary : 'validation unavailable' },
    { ok: Boolean(delivery.ready), check: 'feature.delivery', detail: String(delivery.summary || '') },
    { ok: verify.length > 0, check: 'feature.verify_plan', detail: verify.length > 0 ? verify.join(' | ') : 'no verify commands recorded' },
  ];
  if (lastRun) {
    acceptanceChecks.push({
      ok: String(lastRun.status || '') !== 'failure',
      check: 'feature.last_generation',
      detail: `last status=${lastRun.status || 'unknown'}`,
    });
  }
  const failed = acceptanceChecks.filter((item) => !item.ok);
  return {
    feature_name: featureName,
    status: failed.length === 0 ? 'ready' : 'needs_attention',
    ok: failed.length === 0,
    checks: acceptanceChecks,
    verify_commands: verify,
    delivery,
    last_generation: lastRun,
    artifact_paths: delivery.artifact_paths,
    normalized_plan_path: normalizeRel(root, path.join(root, '.opencode', 'feature-plans', `${featureName}.json`)),
  };
}

/** @param {string} root @param {string | null | undefined} featureNameInput */
function buildFeatureAcceptanceSummary(root, featureNameInput) {
  const explicit = String(featureNameInput || '').trim();
  const featureNames = explicit ? [explicit] : listFeatureNames(root);
  const features = featureNames.map((name) => summarizeFeature(root, name));
  const readyCount = features.filter((item) => item.ok).length;
  /** @type {ProjectMemory} */
  const memory = readJsonSafe(path.join(root, '.opencode', 'project-memory.json')) || {};
  const lastFeature = String((memory.last_feature_generation && memory.last_feature_generation.feature_name) || '').trim() || null;
  return {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    feature_count: features.length,
    ready_count: readyCount,
    incomplete_count: features.length - readyCount,
    last_feature_generation: lastFeature,
    features,
    summary: features.length === 0
      ? 'no feature artifacts found'
      : (features.length === 1 && features[0]
        ? `${features[0].status}: ${features[0].feature_name}`
        : `ready=${readyCount} incomplete=${features.length - readyCount}`),
  };
}

module.exports = {
  buildFeatureAcceptanceSummary,
  listFeatureNames,
};
