const { getMode } = require('../../control-plane/product/modes.js');
const { loadEcosystemState } = require('./state.js');
const { detectTooling } = require('./detectors/tooling.js');
const { detectLsp } = require('./detectors/lsp.js');
const { detectMcp } = require('./detectors/mcp.js');

const FALLBACK_BUNDLE_IDS = ['node-service', 'release-governance', 'lsp-refactor', 'mcp-devtools'];

/** @param {unknown} values */
function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value).trim()).filter(Boolean)));
}

function loadKnownBundleIds() {
  try {
    const registry = require('./bundle-registry.js');
    /** @type {{ id?: unknown }[]} */
    const candidates = typeof registry.listBundles === 'function' ? registry.listBundles() : [];
    const ids = uniqueStrings(candidates.map((entry) => entry && typeof entry === 'object' ? entry.id : null));
    return ids.length > 0 ? ids : FALLBACK_BUNDLE_IDS;
  } catch {
    return FALLBACK_BUNDLE_IDS;
  }
}

/** @param {string[]} explanation @param {string} entry */
function pushExplanation(explanation, entry) {
  if (!explanation.includes(entry)) {
    explanation.push(entry);
  }
}

/** @param {string[]} disabledBundles @param {Array<{ bundle: string, source: string, reason: string }>} recommendations @param {{ bundle: string, source: string, reason: string }} entry */
function pushRecommendation(disabledBundles, recommendations, entry) {
  if (disabledBundles.includes(entry.bundle)) {
    return;
  }
  if (!recommendations.some((item) => item.bundle === entry.bundle)) {
    recommendations.push(entry);
  }
}

/**
 * @param {string} [rootDir]
 * @param {{ mode?: string | null, ecosystemState?: import('./state.js').EcosystemState }} [options]
 */
function buildWorkspaceProfile(rootDir = process.cwd(), options = {}) {
  const state = options.ecosystemState || loadEcosystemState(rootDir);
  const mode = getMode(rootDir, options.mode || null);
  const tooling = detectTooling(rootDir);
  const lsp = detectLsp(rootDir);
  const mcp = detectMcp(rootDir);
  const knownBundleIds = loadKnownBundleIds();
  const disabledBundles = uniqueStrings(state.disabled_bundles);
  /** @type {Array<{ bundle: string, source: string, reason: string }>} */
  const recommendations = [];
  const explanation = [`mode=${mode.id}`, `state_source=${state.source}`];

  if (tooling.package_manager) {
    pushExplanation(explanation, `tooling:package_manager=${tooling.package_manager}`);
  }
  for (const provider of tooling.ci_providers) {
    pushExplanation(explanation, `tooling:ci=${provider}`);
  }
  for (const signal of lsp.signals) {
    pushExplanation(explanation, `lsp:signal=${signal}`);
  }
  for (const signal of mcp.signals) {
    pushExplanation(explanation, `mcp:signal=${signal}`);
  }

  for (const bundle of uniqueStrings(state.enabled_bundles)) {
    pushRecommendation(disabledBundles, recommendations, {
      bundle,
      source: 'enabled',
      reason: 'enabled_bundle',
    });
  }
  for (const bundle of uniqueStrings(state.applied_bundles)) {
    pushRecommendation(disabledBundles, recommendations, {
      bundle,
      source: 'applied',
      reason: 'applied_bundle',
    });
  }

  if (knownBundleIds.includes('release-governance') && tooling.ci_providers.length > 0 && mode.id !== 'solo') {
    pushRecommendation(disabledBundles, recommendations, {
      bundle: 'release-governance',
      source: 'detector',
      reason: `ci=${tooling.ci_providers[0]}`,
    });
  }
  if (knownBundleIds.includes('node-service') && tooling.package_manager) {
    pushRecommendation(disabledBundles, recommendations, {
      bundle: 'node-service',
      source: 'detector',
      reason: `package_manager=${tooling.package_manager}`,
    });
  }
  if (knownBundleIds.includes('lsp-refactor') && lsp.available) {
    pushRecommendation(disabledBundles, recommendations, {
      bundle: 'lsp-refactor',
      source: 'detector',
      reason: `lsp_signal=${lsp.signals[0]}`,
    });
  }
  if (knownBundleIds.includes('mcp-devtools') && mcp.available) {
    pushRecommendation(disabledBundles, recommendations, {
      bundle: 'mcp-devtools',
      source: 'detector',
      reason: `mcp_signal=${mcp.signals[0]}`,
    });
  }

  for (const entry of recommendations) {
    pushExplanation(explanation, `recommend:${entry.bundle}:${entry.reason}`);
  }

  const detectorSummaries = {
    tooling: {
      ...tooling,
      summary: [
        tooling.package_manager ? `package_manager=${tooling.package_manager}` : null,
        tooling.ci_providers.length > 0 ? `ci=${tooling.ci_providers.join(',')}` : null,
        tooling.runtimes.length > 0 ? `runtimes=${tooling.runtimes.join(',')}` : null,
      ].filter(Boolean).join(' '),
    },
    lsp: {
      ...lsp,
      summary: lsp.signals.length > 0 ? `signals=${lsp.signals.join(',')}` : 'signals=none',
    },
    mcp: {
      ...mcp,
      summary: mcp.signals.length > 0 ? `signals=${mcp.signals.join(',')}` : 'signals=none',
    },
  };

  return {
    root_dir: rootDir,
    mode,
    state,
    detected_runtimes: tooling.runtimes,
    detectors: detectorSummaries,
    tooling,
    lsp,
    mcp,
    known_bundles: knownBundleIds,
    recommendations,
    recommended_bundles: recommendations.map((entry) => entry.bundle),
    effective_bundles: uniqueStrings([
      ...state.applied_bundles,
      ...state.enabled_bundles,
      ...recommendations.map((entry) => entry.bundle),
    ]).filter((bundle) => !disabledBundles.includes(bundle)),
    explanation,
  };
}

module.exports = {
  buildWorkspaceProfile,
};
