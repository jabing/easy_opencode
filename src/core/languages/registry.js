const { assertProvider, sortGroups } = require('./contracts.js');

/** @typedef {import('./contracts.js').LanguageProvider} LanguageProvider */
/** @typedef {import('./contracts.js').ProviderGroup} ProviderGroup */

/** @param {LanguageProvider[]} [providers] */
function createRegistry(providers = []) {
  const list = providers.map(assertProvider);

  /** @param {unknown} profile */
  function resolveDefault(profile) {
    const hit = list.find((provider) => provider.supports(profile, null));
    if (!hit) {
      throw new Error('no default language provider');
    }
    return hit;
  }

  /** @param {unknown} profile @param {string} target */
  function resolveTarget(profile, target) {
    const targetMatches = list.filter((provider) => provider.supports(profile, target));
    if (targetMatches.length === 0) {
      throw new Error(`unsupported target: ${target}`);
    }
    const targetOnly = targetMatches.find((provider) => !provider.supports(profile, null));
    const resolved = targetOnly || targetMatches[0];
    if (!resolved) throw new Error(`unsupported target: ${target}`);
    return resolved;
  }

  /** @param {unknown} profile @param {string[]} [targets] @returns {ProviderGroup[]} */
  function resolveTargetGroups(profile, targets = []) {
    /** @type {Map<string, string[]>} */
    const grouped = new Map();
    for (const target of targets) {
      const provider = resolveTarget(profile, target);
      if (!provider) continue;
      const bucket = grouped.get(provider.id) || [];
      bucket.push(target);
      grouped.set(provider.id, bucket);
    }
    return sortGroups(Array.from(grouped.entries()).map(([provider_id, groupedTargets]) => ({
      provider_id,
      targets: groupedTargets,
    })));
  }

  return {
    providers: list,
    resolveDefault,
    resolveTarget,
    resolveTargetGroups,
  };
}

module.exports = {
  createRegistry,
};
