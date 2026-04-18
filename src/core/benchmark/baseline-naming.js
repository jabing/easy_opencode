const { detectProjectProfile } = require('../project-profile.js');

/** @typedef {{ profile?: string, projectProfile?: any, packageName?: string, packageJson?: { name?: string } }} BaselineNamingOptions */

/** @param {string | null | undefined} value */
function sanitizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

/** @param {string | null | undefined} value @returns {string | null} */
function normalizeProfileHint(value) {
  const raw = sanitizeToken(value);
  if (!raw || raw === 'unknown') return null;
  if (raw === 'plugin' || raw === 'self-release') return 'plugin-self-release';
  if (raw === 'spring' || raw === 'java' || raw === 'java-spring') return 'java-service';
  if (raw === 'go' || raw === 'golang') return 'go-service';
  if (raw === 'python') return 'python-service';
  if (raw === 'node') return 'node-api';
  return raw;
}

/** @param {string} rootDir @param {BaselineNamingOptions} [options] @returns {string | null} */
function inferProfileHint(rootDir, options = {}) {
  if (options.profile) return normalizeProfileHint(options.profile);
  const profile = options.projectProfile || detectProjectProfile(rootDir);
  if (!profile) return null;
  const runtime = sanitizeToken(profile.runtime);
  const framework = sanitizeToken(profile.framework);
  const appType = sanitizeToken(profile.app_type);
  const packageName = sanitizeToken(options.packageName || (options.packageJson && options.packageJson.name));
  if (packageName === 'easy-opencode' || packageName === 'easy_opencode') return 'plugin-self-release';
  if (runtime === 'node' && (framework === 'express' || appType === 'api' || appType === 'service')) return 'node-api';
  if (runtime === 'python' && (framework === 'fastapi' || framework === 'flask' || framework === 'django' || appType === 'service' || appType === 'api')) return 'python-service';
  if (runtime === 'go') return 'go-service';
  if (runtime === 'java' || framework === 'spring' || framework === 'springboot') return 'java-service';
  if (runtime && runtime !== 'unknown') return runtime;
  return null;
}

/** @param {string} rootDir @param {BaselineNamingOptions & { policy?: string }} [options] */
function buildCanonicalBaselineName(rootDir, options = {}) {
  const policy = sanitizeToken(options.policy || 'standard');
  const hint = inferProfileHint(rootDir, options);
  return hint ? `release.${hint}.${policy}` : `release.${policy}`;
}

/** @param {string} rootDir @param {BaselineNamingOptions & { policy?: string }} [options] */
function buildBaselineNameCandidates(rootDir, options = {}) {
  const policy = sanitizeToken(options.policy || 'standard');
  const hint = inferProfileHint(rootDir, options);
  /** @type {string[]} */
  const out = [];
  /** @param {string | null | undefined} value */
  const push = (value) => { if (value && !out.includes(value)) out.push(value); };
  if (hint) {
    push(`release.${hint}.${policy}`);
    push(`release.${hint}`);
  }
  push(`release.${policy}`);
  push('release');
  return out;
}

module.exports = { buildCanonicalBaselineName, buildBaselineNameCandidates, inferProfileHint, normalizeProfileHint };
