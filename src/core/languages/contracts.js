/**
 * @typedef {{ id: string, supports: (profile: any, target: string | null) => boolean, analyzeProject?: Function, summarizeTarget?: Function }} LanguageProvider
 * @typedef {{ provider_id: string, targets: string[] }} ProviderGroup
 */

/** @param {LanguageProvider} provider @returns {LanguageProvider} */
function assertProvider(provider) {
  if (!provider || typeof provider.id !== 'string' || typeof provider.supports !== 'function') {
    throw new Error('invalid language provider');
  }
  return provider;
}

/** @param {ProviderGroup[] | null | undefined} groups @returns {ProviderGroup[]} */
function sortGroups(groups) {
  return Array.isArray(groups) ? groups : [];
}

module.exports = {
  assertProvider,
  sortGroups,
};
