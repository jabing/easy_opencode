const { allowCrossRuntime, normalizeList } = require('./skill-selection-shared.js');
const { applyConstraints, evaluateCompatibility } = require('./skill-selection-constraints.js');

/** @param {string} query */
function tokenizeQuery(query) {
  return String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * @param {{ name: string, dir: string, description?: string, triggers?: string[], languages?: string[], frameworks?: string[], executable?: boolean, task_family?: string|null }} skill
 * @param {string[]} tokens
 * @param {{ runtime: string, language: string, framework: string }} profile
 * @param {Record<string, any>} [opts]
 */
function evaluateSkillCandidate(skill, tokens, profile, opts = {}) {
  const haystack = [skill.name, skill.dir, skill.description, ...(skill.triggers || []), ...(skill.languages || []), ...(skill.frameworks || [])]
    .join(' ')
    .toLowerCase();
  const compatibility = evaluateCompatibility(skill, profile);
  const { constraints, accepted } = applyConstraints(compatibility, opts);
  const crossRuntimeAllowed = allowCrossRuntime(opts);

  let score = 0;
  const scoreBreakdown = [];
  const positiveSignals = [];
  for (const token of tokens) {
    if (skill.name.toLowerCase().includes(token)) {
      score += 8;
      scoreBreakdown.push({ reason: `name includes "${token}"`, points: 8 });
    }
    if (skill.dir.toLowerCase().includes(token)) {
      score += 7;
      scoreBreakdown.push({ reason: `dir includes "${token}"`, points: 7 });
    }
    if (haystack.includes(token)) {
      score += 2;
      scoreBreakdown.push({ reason: `metadata mentions "${token}"`, points: 2 });
    }
  }
  for (const trigger of normalizeList(skill.triggers)) {
    if (trigger && haystack.includes(trigger) && String(tokens.join(' ')).includes(trigger)) {
      score += 5;
      scoreBreakdown.push({ reason: `query matches trigger "${trigger}"`, points: 5 });
    }
  }
  if (skill.executable) {
    score += 1;
    scoreBreakdown.push({ reason: 'skill is executable', points: 1 });
  }
  if (compatibility.runtime.status === 'match') {
    score += 6;
    scoreBreakdown.push({ reason: `runtime matches ${compatibility.runtime.actual}`, points: 6 });
    positiveSignals.push(`runtime match: ${compatibility.runtime.actual}`);
  }
  if (compatibility.framework.status === 'match') {
    score += 5;
    scoreBreakdown.push({ reason: `framework matches ${compatibility.framework.actual}`, points: 5 });
    positiveSignals.push(`framework match: ${compatibility.framework.actual}`);
  }
  if (compatibility.language.status === 'match') {
    score += 2;
    scoreBreakdown.push({ reason: `language matches ${compatibility.language.actual}`, points: 2 });
    positiveSignals.push(`language match: ${compatibility.language.actual}`);
  }
  if (crossRuntimeAllowed && compatibility.runtime.status === 'mismatch') {
    score -= 12;
    scoreBreakdown.push({ reason: `runtime mismatch penalized under cross-runtime mode (${compatibility.runtime.actual} vs ${compatibility.supported_runtimes.join('/') || 'unspecified'})`, points: -12 });
  }
  if (crossRuntimeAllowed && compatibility.framework.status === 'mismatch') {
    score -= 8;
    scoreBreakdown.push({ reason: `framework mismatch penalized under cross-runtime mode (${compatibility.framework.actual} vs ${compatibility.supported_frameworks.join('/') || 'unspecified'})`, points: -8 });
  }
  if (!skill.executable && score > 0) {
    score -= 2;
    scoreBreakdown.push({ reason: 'non-executable skills are deprioritized', points: -2 });
  }

  const negatives = constraints
    .filter((constraint) => constraint.status === 'failed' || constraint.status === 'waived')
    .map((constraint) => constraint.detail);
  if (compatibility.language.status === 'mismatch') negatives.push(`language mismatch: project=${compatibility.language.actual || 'unknown'} skill=${compatibility.supported_languages.join('/')}`);
  if (compatibility.runtime.status === 'unspecified') negatives.push('runtime unspecified by skill metadata');
  if (compatibility.framework.status === 'unspecified') negatives.push('framework unspecified by skill metadata');

  const summary = accepted
    ? `accepted: ${positiveSignals[0] || 'lexical match'}${negatives[0] ? `; note ${negatives[0]}` : ''}`
    : `rejected: ${constraints.filter((constraint) => constraint.status === 'failed').map((constraint) => constraint.detail).join('; ')}`;

  return {
    skill,
    score,
    accepted,
    compatibility,
    decision: {
      accepted,
      allow_cross_runtime: crossRuntimeAllowed,
      constraints,
      positive_signals: positiveSignals,
      negative_signals: negatives,
      score_breakdown: scoreBreakdown,
      summary,
    },
  };
}

/** @param {Array<{ skill: any, score: number, accepted: boolean }>} items */
function rankAcceptedCandidates(items) {
  return items
    .filter((item) => item.accepted && item.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
}

module.exports = {
  evaluateSkillCandidate,
  rankAcceptedCandidates,
  tokenizeQuery,
};
