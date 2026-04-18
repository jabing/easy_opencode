const { normalizeList } = require('./manifest.js');

/** @type {Readonly<Record<string, string>>} */
const FRAMEWORK_RUNTIME_HINTS = Object.freeze({
  express: 'node',
  fastapi: 'python',
  django: 'python',
  springboot: 'java',
  jpa: 'java',
  gin: 'go',
  fiber: 'go',
  react: 'node',
  vue: 'node',
});

/** @param {unknown} value */
function normalizeValue(value) {
  return String(value || '').trim().toLowerCase();
}

/** @param {string[] | undefined | null} frameworks */
function inferRuntimesFromFrameworks(frameworks) {
  /** @type {string[]} */
  const runtimes = [];
  /** @type {string[]} */
  const unknownFrameworks = [];
  for (const framework of normalizeList(frameworks)) {
    const runtime = Object.prototype.hasOwnProperty.call(FRAMEWORK_RUNTIME_HINTS, framework)
      ? FRAMEWORK_RUNTIME_HINTS[framework]
      : null;
    if (runtime) {
      if (!runtimes.includes(runtime)) runtimes.push(runtime);
      continue;
    }
    unknownFrameworks.push(framework);
  }
  return { runtimes, unknown_frameworks: unknownFrameworks };
}

/** @param {{ runtimes?: string[], actions?: Array<{ when?: { runtime?: string|string[] } }>, frameworks?: string[] }} skill */
function deriveRuntimeSupport(skill) {
  const direct = normalizeList(skill && skill.runtimes);
  if (direct.length > 0) {
    return { runtimes: direct, source: 'manifest', unknown_frameworks: [] };
  }

  /** @type {string[]} */
  const actionRuntimes = [];
  for (const action of (skill && Array.isArray(skill.actions) ? skill.actions : [])) {
    const raw = action && action.when ? action.when.runtime : null;
    const values = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    for (const value of values.map(normalizeValue).filter(Boolean)) {
      if (!actionRuntimes.includes(value)) actionRuntimes.push(value);
    }
  }
  if (actionRuntimes.length > 0) {
    return { runtimes: actionRuntimes, source: 'actions', unknown_frameworks: [] };
  }

  const inferred = inferRuntimesFromFrameworks(skill && skill.frameworks);
  if (inferred.runtimes.length > 0) {
    return { runtimes: inferred.runtimes, source: 'framework_inference', unknown_frameworks: inferred.unknown_frameworks };
  }

  return { runtimes: [], source: 'unspecified', unknown_frameworks: inferred.unknown_frameworks };
}

module.exports = {
  FRAMEWORK_RUNTIME_HINTS,
  deriveRuntimeSupport,
  inferRuntimesFromFrameworks,
  normalizeValue,
};
