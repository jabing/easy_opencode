const fs = require('fs');
const path = require('path');

/** @param {string} filePath */
function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/** @param {unknown} value @returns {unknown} */
function stableClone(value) {
  if (Array.isArray(value)) return value.map((item) => stableClone(item));
  if (value && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const source = /** @type {Record<string, unknown>} */ (value);
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const key of Object.keys(source).sort((a, b) => a.localeCompare(b))) out[key] = stableClone(source[key]);
    return out;
  }
  return value;
}

/** @param {string} root @param {string} featureName */
function featurePlanPath(root, featureName) {
  return path.join(root, '.opencode', 'feature-plans', `${featureName}.json`);
}

/** @param {string} root @param {string} featureName */
function featureIntegrationJsonPath(root, featureName) {
  return path.join(root, '.opencode', 'feature-bundles', `${featureName}.integration.json`);
}

/** @param {string} root @param {string} featureName @param {unknown} payload */
function writeFeaturePlan(root, featureName, payload) {
  const filePath = featurePlanPath(root, featureName);
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(stableClone(payload), null, 2)}\n`, 'utf8');
  return filePath;
}

/** @param {string} root @param {string} featureName @param {unknown} payload */
function writeFeatureIntegrationJson(root, featureName, payload) {
  const filePath = featureIntegrationJsonPath(root, featureName);
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(stableClone(payload), null, 2)}\n`, 'utf8');
  return filePath;
}

module.exports = {
  featurePlanPath,
  featureIntegrationJsonPath,
  writeFeaturePlan,
  writeFeatureIntegrationJson,
};
