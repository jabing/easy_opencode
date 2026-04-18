/** @typedef {{
 *   id: string,
 *   summary: string,
 *   mode: string,
 *   bundles: string[],
 *   explanation: string[],
 * }} EcosystemPreset
 */

/** @type {EcosystemPreset[]} */
const BUILTIN_PRESETS = [
  {
    id: 'node-solo',
    summary: 'Node.js preset tuned for the fastest solo implementation loop.',
    mode: 'solo',
    bundles: ['node-service'],
    explanation: ['runtime=node', 'mode=solo'],
  },
  {
    id: 'node-team',
    summary: 'Node.js preset tuned for team workflows with review and refactor defaults.',
    mode: 'team',
    bundles: ['node-service', 'release-governance', 'lsp-refactor'],
    explanation: ['runtime=node', 'mode=team'],
  },
  {
    id: 'node-platform',
    summary: 'Node.js preset tuned for platform governance with broader tooling coverage.',
    mode: 'platform',
    bundles: ['node-service', 'release-governance', 'lsp-refactor', 'mcp-devtools'],
    explanation: ['runtime=node', 'mode=platform'],
  },
  {
    id: 'release-governance',
    summary: 'Governed release posture preset for repos that need stronger review and ship defaults.',
    mode: 'team',
    bundles: ['release-governance'],
    explanation: ['bundle=release-governance'],
  },
];

/** @param {unknown} values @returns {string[]} */
function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((item) => String(item).trim()).filter(Boolean)));
}

/** @param {EcosystemPreset} preset @returns {EcosystemPreset} */
function clonePreset(preset) {
  return {
    id: preset.id,
    summary: preset.summary,
    mode: preset.mode,
    bundles: [...preset.bundles],
    explanation: [...preset.explanation],
  };
}

/** @returns {EcosystemPreset[]} */
function listPresets() {
  return BUILTIN_PRESETS.map(clonePreset);
}

/** @param {string} id @returns {EcosystemPreset | null} */
function getPreset(id) {
  const normalized = String(id || '').trim().toLowerCase();
  const preset = BUILTIN_PRESETS.find((item) => item.id === normalized);
  return preset ? clonePreset(preset) : null;
}

/** @param {string[]} presetIds */
function resolvePresetBundles(presetIds) {
  /** @type {string[]} */
  const presets = [];
  /** @type {string[]} */
  const bundles = [];
  /** @type {string[]} */
  const unknownPresets = [];
  /** @type {string[]} */
  const explanation = [];

  for (const presetId of uniqueStrings(presetIds)) {
    const preset = getPreset(presetId);
    if (!preset) {
      unknownPresets.push(presetId);
      explanation.push(`unknown:${presetId}`);
      continue;
    }
    presets.push(preset.id);
    explanation.push(`preset:${preset.id}`);
    for (const bundleId of preset.bundles) {
      if (!bundles.includes(bundleId)) {
        bundles.push(bundleId);
      }
    }
  }

  return {
    presets,
    bundles,
    unknown_presets: unknownPresets,
    explanation,
  };
}

module.exports = {
  getPreset,
  listPresets,
  resolvePresetBundles,
};
