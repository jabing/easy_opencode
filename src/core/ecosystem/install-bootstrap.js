const { applyBundles, resolveEffectiveBundles } = require('./apply-bundles.js');
const { listBundles } = require('./bundle-registry.js');
const { resolvePresetBundles } = require('./presets.js');
const { loadEcosystemState } = require('./state.js');
const { buildWorkspaceProfile } = require('./workspace-profile.js');

/** @param {unknown} values */
function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean)));
}

/**
 * @param {string} rootDir
 * @param {{ bootstrap?: boolean, apply?: boolean, bundles?: string[], presets?: string[], mode?: string | null }} [options]
 */
function bootstrapEcosystem(rootDir, options = {}) {
  const ecosystemState = loadEcosystemState(rootDir);
  const workspaceProfile = buildWorkspaceProfile(rootDir, {
    mode: options.mode || null,
    ecosystemState,
  });
  const recommendedBundles = uniqueStrings(workspaceProfile.recommended_bundles);
  const recommendedPresets = uniqueStrings(workspaceProfile.recommended_presets);
  const explicitBundles = uniqueStrings(options.bundles);
  const selectedPresets = uniqueStrings(options.presets);
  const presetResolution = resolvePresetBundles(selectedPresets);
  if (presetResolution.unknown_presets.length > 0) {
    throw new Error(`unknown preset: ${presetResolution.unknown_presets[0]}`);
  }

  const knownBundleIds = new Set(listBundles().map((item) => item.id));
  const selectedBundles = uniqueStrings([...presetResolution.bundles, ...explicitBundles]);
  const unknownBundles = selectedBundles.filter((bundleId) => !knownBundleIds.has(bundleId));
  if (unknownBundles.length > 0) {
    throw new Error(`unknown bundle: ${unknownBundles[0]}`);
  }

  const apply = options.apply === true || options.bootstrap === true;
  const resolution = resolveEffectiveBundles({
    enabled_bundles: selectedBundles,
    disabled_bundles: ecosystemState.disabled_bundles,
    recommended_bundles: apply ? recommendedBundles : [],
  });

  if (!apply) {
    return {
      root_dir: rootDir,
      apply: false,
      changed: false,
      selected_presets: selectedPresets,
      selected_bundles: explicitBundles,
      recommended_presets: recommendedPresets,
      recommended_bundles: recommendedBundles,
      effective_bundles: resolution.effective_bundles,
      unknown_bundles: resolution.unknown_bundles,
      unknown_presets: presetResolution.unknown_presets,
      workspace_profile: workspaceProfile,
      verification: { ok: true, persisted: false },
    };
  }

  const result = applyBundles({
    rootDir,
    state: ecosystemState,
    enabled_bundles: selectedBundles,
    disabled_bundles: ecosystemState.disabled_bundles,
    recommended_bundles: recommendedBundles,
    bootstrap: {
      strategy: 'install-bootstrap',
      applied_at: new Date().toISOString(),
      recommended_presets: recommendedPresets,
      recommended_bundles: recommendedBundles,
      explicit_presets: selectedPresets,
      explicit_bundles: explicitBundles,
    },
  });

  return {
    root_dir: rootDir,
    apply: true,
    changed: true,
    selected_presets: selectedPresets,
    selected_bundles: explicitBundles,
    recommended_presets: recommendedPresets,
    recommended_bundles: recommendedBundles,
    effective_bundles: result.effective_bundles,
    unknown_bundles: result.unknown_bundles,
    unknown_presets: presetResolution.unknown_presets,
    workspace_profile: workspaceProfile,
    state: result.state,
    verification: {
      ok: true,
      persisted: true,
      applied_bundles: result.state.applied_bundles,
    },
  };
}

module.exports = {
  bootstrapEcosystem,
};
