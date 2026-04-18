const { loadEcosystemState } = require('./state.js');

/** @param {unknown} value @returns {string[]} */
function normalizeBundles(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map((item) => String(item).trim()).filter(Boolean)));
}

/** @param {string} [rootDir] */
function readHookPolicy(rootDir = process.cwd()) {
  const state = loadEcosystemState(rootDir);
  const bundles = normalizeBundles([
    ...(Array.isArray(state.applied_bundles) ? state.applied_bundles : []),
    ...(Array.isArray(state.enabled_bundles) ? state.enabled_bundles : []),
  ]);
  const qualityMode = bundles.includes('release-governance') ? 'full' : 'fast';
  return {
    state,
    bundles,
    qualityMode,
  };
}

module.exports = {
  readHookPolicy,
};
