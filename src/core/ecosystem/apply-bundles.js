const { getBundle, listBundles } = require('./bundle-registry.js');
const { loadEcosystemState, writeEcosystemState } = require('./state.js');

/** @param {unknown} values @returns {string[]} */
function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((item) => String(item).trim()).filter(Boolean)));
}

/**
 * @param {string[]} bundleIds
 * @param {Set<string>} disabled
 * @param {Set<string>} seen
 * @returns {string[]}
 */
function expandBundleIds(bundleIds, disabled, seen = new Set()) {
  const expanded = [];
  for (const bundleId of bundleIds) {
    if (seen.has(bundleId) || disabled.has(bundleId)) {
      continue;
    }
    const bundle = getBundle(bundleId);
    if (!bundle) {
      continue;
    }
    seen.add(bundleId);
    expanded.push(bundleId);
    expanded.push(...expandBundleIds(bundle.requires, disabled, seen));
  }
  return expanded;
}

/**
 * @param {{
 *   enabled_bundles?: string[] | undefined,
 *   disabled_bundles?: string[] | undefined,
 *   recommended_bundles?: string[] | undefined,
 * }} input
 */
function resolveEffectiveBundles(input = {}) {
  const knownIds = new Set(listBundles().map((item) => item.id));
  const enabledBundles = uniqueStrings(input.enabled_bundles);
  const disabledBundles = uniqueStrings(input.disabled_bundles);
  const recommendedBundles = uniqueStrings(input.recommended_bundles);
  const disabledSet = new Set(disabledBundles.filter((item) => knownIds.has(item)));

  const explanation = [];
  for (const bundleId of recommendedBundles) {
    if (knownIds.has(bundleId)) explanation.push(`recommended:${bundleId}`);
    else explanation.push(`ignored:${bundleId}`);
  }
  for (const bundleId of enabledBundles) {
    if (knownIds.has(bundleId)) explanation.push(`enabled:${bundleId}`);
    else explanation.push(`ignored:${bundleId}`);
  }
  for (const bundleId of disabledBundles) {
    if (knownIds.has(bundleId)) explanation.push(`disabled:${bundleId}`);
    else explanation.push(`ignored:${bundleId}`);
  }

  const requestedBundles = uniqueStrings([...recommendedBundles, ...enabledBundles]).filter((item) => knownIds.has(item));
  const expandedBundleIds = uniqueStrings(expandBundleIds(requestedBundles, disabledSet));
  const effectiveBundles = listBundles()
    .map((item) => item.id)
    .filter((item) => expandedBundleIds.includes(item) && !disabledSet.has(item));
  const unknownBundles = uniqueStrings([...recommendedBundles, ...enabledBundles, ...disabledBundles]).filter((item) => !knownIds.has(item));

  return {
    effective_bundles: effectiveBundles,
    bundles: effectiveBundles.map((bundleId) => getBundle(bundleId)).filter(Boolean),
    unknown_bundles: unknownBundles,
    explanation,
  };
}

/**
 * @param {{
 *   rootDir?: string,
 *   state?: import('./state.js').EcosystemState,
 *   enabled_bundles?: string[] | undefined,
 *   disabled_bundles?: string[] | undefined,
 *   recommended_bundles?: string[] | undefined,
 *   bootstrap?: Record<string, unknown> | null,
 * }} input
 */
function applyBundles(input = {}) {
  const rootDir = input.rootDir || process.cwd();
  const currentState = input.state || loadEcosystemState(rootDir);
  const enabledBundles = input.enabled_bundles !== undefined ? input.enabled_bundles : currentState.enabled_bundles;
  const disabledBundles = input.disabled_bundles !== undefined ? input.disabled_bundles : currentState.disabled_bundles;
  const bootstrap = input.bootstrap !== undefined ? input.bootstrap : currentState.bootstrap;
  const resolution = resolveEffectiveBundles({
    enabled_bundles: enabledBundles,
    disabled_bundles: disabledBundles,
    recommended_bundles: input.recommended_bundles,
  });

  const state = writeEcosystemState(rootDir, {
    schema_version: currentState.schema_version,
    applied_bundles: resolution.effective_bundles,
    enabled_bundles: enabledBundles,
    disabled_bundles: disabledBundles,
    mode_overrides: currentState.mode_overrides,
    automation_policy_overrides: currentState.automation_policy_overrides,
    bootstrap,
  });

  return {
    state,
    effective_bundles: resolution.effective_bundles,
    bundles: resolution.bundles,
    unknown_bundles: resolution.unknown_bundles,
    explanation: [...resolution.explanation, `wrote:${state.file_path}`],
  };
}

module.exports = {
  applyBundles,
  resolveEffectiveBundles,
};
