const { compareSupport, normalizeList, supportedRuntimes, allowCrossRuntime } = require('./skill-selection-shared.js');

/** @param {'runtime' | 'framework'} kind @param {{ status: string, actual: string | null, supported: string[] }} entry */
function buildConstraintOutcome(kind, entry) {
  const label = kind === 'runtime' ? 'runtime' : 'framework';
  if (entry.status === 'mismatch') {
    return {
      kind,
      status: 'failed',
      detail: `${label} mismatch: project=${entry.actual || 'unknown'} skill=${entry.supported.join('/') || 'unspecified'}`,
    };
  }
  if (entry.status === 'match') {
    return {
      kind,
      status: 'passed',
      detail: `${label} match: ${entry.actual || 'unknown'}`,
    };
  }
  if (entry.status === 'unspecified') {
    return {
      kind,
      status: 'informational',
      detail: `${label} unspecified by skill metadata`,
    };
  }
  return {
    kind,
    status: 'informational',
    detail: `${label} unknown in project profile`,
  };
}

/**
 * @param {{ frameworks?: string[], languages?: string[] }} skill
 * @param {{ runtime: string, language: string, framework: string }} profile
 */
function evaluateCompatibility(skill, profile) {
  const supportedFrameworks = normalizeList(skill.frameworks);
  const supportedLanguages = normalizeList(skill.languages);
  const runtimeComparison = compareSupport(supportedRuntimes(skill), profile.runtime);
  const frameworkComparison = compareSupport(supportedFrameworks, profile.framework);
  const languageComparison = compareSupport(supportedLanguages, profile.language);
  return {
    runtime: runtimeComparison,
    framework: frameworkComparison,
    language: languageComparison,
    supported_runtimes: runtimeComparison.supported,
    supported_frameworks: frameworkComparison.supported,
    supported_languages: languageComparison.supported,
  };
}

/**
 * @param {{ runtime: { status: string, actual: string|null, supported: string[] }, framework: { status: string, actual: string|null, supported: string[] } }} compatibility
 * @param {Record<string, any>} opts
 */
function applyConstraints(compatibility, opts = {}) {
  const constraints = [
    buildConstraintOutcome('runtime', compatibility.runtime),
    buildConstraintOutcome('framework', compatibility.framework),
  ];
  if (allowCrossRuntime(opts)) {
    for (const constraint of constraints) {
      if (constraint.status === 'failed') {
        constraint.status = 'waived';
        constraint.detail += ' (waived by --allow-cross-runtime)';
      }
    }
  }
  return {
    constraints,
    accepted: constraints.every((constraint) => constraint.status !== 'failed'),
  };
}

module.exports = {
  applyConstraints,
  buildConstraintOutcome,
  evaluateCompatibility,
};
