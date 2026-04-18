const { readAllSkills } = require('../skills/manifest.js');

/**
 * @typedef {{
 *   generation: boolean,
 *   integration: boolean,
 *   verify: boolean,
 *   dry_run: boolean,
 * }} ProviderCoverage
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   runtime: string,
 *   frameworks: string[],
 *   languages: string[],
 *   skill: string,
 *   support_tier: string,
 *   delivery: string,
 *   coverage: ProviderCoverage,
 * }} FeatureProvider
 */

/** @typedef {{ runtime?: string, language?: string, framework?: string }} FeatureProfile */
/** @typedef {ReturnType<typeof readAllSkills>[number]} SkillRecord */

/** @type {FeatureProvider[]} */
const BUILTIN_FEATURE_PROVIDERS = [
  {
    id: 'node-feature-bundle',
    label: 'Node/TypeScript feature bundle',
    runtime: 'node',
    frameworks: ['express', 'nest', 'fastify', 'koa', 'hono', 'next', 'react', 'vue', 'svelte'],
    languages: ['javascript', 'typescript'],
    skill: 'generate-node-feature',
    support_tier: 'tier1',
    delivery: 'primary-feature-flow',
    coverage: {
      generation: true,
      integration: true,
      verify: true,
      dry_run: true,
    },
  },
  {
    id: 'fastapi-feature-bundle',
    label: 'FastAPI feature bundle',
    runtime: 'python',
    frameworks: ['fastapi'],
    languages: ['python'],
    skill: 'generate-fastapi-feature',
    support_tier: 'tier1',
    delivery: 'primary-feature-flow',
    coverage: {
      generation: true,
      integration: true,
      verify: true,
      dry_run: true,
    },
  },
  {
    id: 'go-feature-bundle',
    label: 'Go feature bundle',
    runtime: 'go',
    frameworks: ['go', 'net/http', 'gin', 'chi', 'fiber', 'echo'],
    languages: ['go'],
    skill: 'generate-go-feature',
    support_tier: 'tier1',
    delivery: 'primary-feature-flow',
    coverage: {
      generation: true,
      integration: true,
      verify: true,
      dry_run: true,
    },
  },
];

/** @param {unknown[] | null | undefined} values */
function unique(values) {
  return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)));
}

/** @param {string | null | undefined} tier */
function supportTierRank(tier) {
  const normalized = String(tier || '').trim().toLowerCase();
  if (normalized === 'tier1') return 1;
  if (normalized === 'tier2') return 2;
  if (normalized === 'tier3') return 3;
  return 4;
}

/** @param {FeatureProvider} provider @param {string | null | undefined} framework */
function isFrameworkMatch(provider, framework) {
  const actual = String(framework || '').trim().toLowerCase();
  if (!actual) return false;
  return provider.frameworks.some((candidate) => String(candidate).trim().toLowerCase() === actual);
}

/** @param {FeatureProvider} provider @param {FeatureProfile} profile */
function scoreProvider(provider, profile) {
  let score = 0;
  if (provider.runtime === String(profile.runtime || '')) score += 10;
  if (isFrameworkMatch(provider, profile.framework)) score += 8;
  if (provider.languages.includes(String(profile.language || ''))) score += 3;
  return score;
}

/** @returns {FeatureProvider[]} */
function listFeatureProviders() {
  return BUILTIN_FEATURE_PROVIDERS.map((provider) => ({
    ...provider,
    frameworks: [...provider.frameworks],
    languages: [...provider.languages],
    coverage: { ...provider.coverage },
  }));
}

/** @param {FeatureProfile | null | undefined} profile @returns {FeatureProvider | null} */
function selectFeatureProvider(profile) {
  const resolvedProfile = profile || {};
  const providers = listFeatureProviders();
  const scored = providers
    .map((provider) => ({ provider, score: scoreProvider(provider, resolvedProfile) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || supportTierRank(a.provider.support_tier) - supportTierRank(b.provider.support_tier) || a.provider.id.localeCompare(b.provider.id));
  const best = scored[0];
  return best ? best.provider : null;
}

/** @param {string} root @param {FeatureProfile} profile */
function buildFeatureSupportSummary(root, profile) {
  const providers = listFeatureProviders();
  const selected = selectFeatureProvider(profile);
  const skills = readAllSkills(root);
  const featureSkills = /** @type {Exclude<SkillRecord, null>[]} */ (skills.filter((skill) => skill !== null && String(skill.task_family || '') === 'feature'));
  const skillBacked = featureSkills.map((skill) => {
    const record = skill;
    return {
      dir: record.dir,
      name: record.name,
      support_tier: record.support_tier,
      runtimes: record.runtimes,
      frameworks: record.frameworks,
      languages: record.languages,
    };
  });
  return {
    detected: {
      runtime: profile.runtime || 'unknown',
      language: profile.language || 'unknown',
      framework: profile.framework || 'unknown',
    },
    selected_provider: selected ? {
      id: selected.id,
      skill: selected.skill,
      support_tier: selected.support_tier,
      runtime: selected.runtime,
      frameworks: [...selected.frameworks],
      delivery: selected.delivery,
    } : null,
    supported_runtimes: unique(providers.map((provider) => provider.runtime)),
    provider_count: providers.length,
    providers,
    feature_skills: skillBacked,
  };
}

/** @param {FeatureProfile | null | undefined} profile */
function explainUnsupportedFeatureProfile(profile) {
  const resolvedProfile = profile || {};
  const support = buildFeatureSupportSummary(process.cwd(), resolvedProfile);
  const providerSummary = support.providers
    .map((provider) => `${provider.runtime}${provider.frameworks.length ? ` (${provider.frameworks.join(', ')})` : ''}`)
    .join('; ');
  return `No tier1 feature provider matched runtime=${resolvedProfile.runtime || 'unknown'} framework=${resolvedProfile.framework || 'unknown'}. Primary feature generation currently supports ${providerSummary}.`;
}

module.exports = {
  BUILTIN_FEATURE_PROVIDERS,
  buildFeatureSupportSummary,
  explainUnsupportedFeatureProfile,
  listFeatureProviders,
  scoreProvider,
  selectFeatureProvider,
  supportTierRank,
};
