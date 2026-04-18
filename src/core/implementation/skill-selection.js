const { readAllSkills, resolveSkill } = require('../skills/manifest.js');
const { buildVerifySuggestions } = require('../verification/suggestions.js');
const {
  appendUnique,
  toVarMap,
  actionSupportsRuntime,
  allowCrossRuntime,
  supportedRuntimes,
} = require('./skill-selection-shared.js');
const { evaluateSkillCandidate, rankAcceptedCandidates, tokenizeQuery } = require('./skill-selection-ranking.js');
const { buildSelectionReport, summarizeSkillSelection, toPublicCandidate } = require('./skill-selection-reporting.js');

/** @typedef {{ runtime: string, language: string, framework: string }} SkillProfile */
/** @typedef {Record<string, any> & { skill?: string, query?: string, objective?: string, limit?: number|string, _?: unknown[] }} SkillSelectionOptions */
/** @typedef {NonNullable<ReturnType<typeof readAllSkills>[number]>} SkillRecord */
/** @typedef {ReturnType<typeof evaluateSkillCandidate>} EvaluatedSkill */

/** @param {SkillRecord | null | undefined} skill @returns {skill is SkillRecord} */
function isSkillRecord(skill) {
  return Boolean(skill && typeof skill.dir === 'string' && typeof skill.name === 'string');
}

/** @param {EvaluatedSkill[]} items */
function rankEvaluatedCandidates(items) {
  return /** @type {EvaluatedSkill[]} */ (rankAcceptedCandidates(items));
}

/**
 * @param {string} root
 * @param {string} query
 * @param {SkillProfile} profile
 * @param {number} [limit]
 * @param {SkillSelectionOptions} [opts]
 */
function matchSkills(root, query, profile, limit = 5, opts = {}) {
  const tokens = tokenizeQuery(query);
  const skills = readAllSkills(root).filter(isSkillRecord);
  return rankEvaluatedCandidates(
    skills.map((skill) => evaluateSkillCandidate(skill, tokens, profile, opts)),
  )
    .slice(0, limit)
    .map(toPublicCandidate);
}

/** @param {string} root @param {SkillSelectionOptions} opts @param {SkillProfile} profile */
function selectSkill(root, opts, profile) {
  if (opts.skill) {
    const exact = resolveSkill(root, String(opts.skill));
    if (!exact) throw new Error(`Unknown skill: ${opts.skill}`);
    const evaluated = evaluateSkillCandidate(exact, [], profile, { ...opts, allowCrossRuntime: true, 'allow-cross-runtime': true });
    const selected = {
      ...toPublicCandidate(evaluated),
      verify: buildVerifySuggestions(exact.verify, profile, profile.runtime),
    };
    return {
      selected,
      candidates: [],
      report: {
        report_version: '2.0',
        selection_basis: 'explicit_override',
        mode: 'explicit',
        objective: String(opts.query || opts.objective || '').trim(),
        allow_cross_runtime: true,
        profile: { runtime: profile.runtime, language: profile.language, framework: profile.framework },
        selected,
        accepted_candidates: [{ rank: 1, ...selected }],
        rejected_candidates: [],
        totals: { evaluated: 1, accepted: 1, rejected: 0 },
        rejected_by_reason: { runtime_mismatch: 0, framework_mismatch: 0, other: 0 },
      },
    };
  }

  const query = String(opts.query || opts.objective || (Array.isArray(opts._) ? opts._[0] : '') || '').trim();
  if (!query) return { selected: null, candidates: [], report: null };

  const tokens = tokenizeQuery(query);
  const skills = readAllSkills(root).filter(isSkillRecord);
  const evaluated = skills.map((skill) => evaluateSkillCandidate(skill, tokens, profile, opts));
  const candidates = rankEvaluatedCandidates(evaluated)
    .slice(0, Number(opts.limit || 5))
    .map(toPublicCandidate);

  const selected = candidates[0]
    ? (() => {
      const exact = resolveSkill(root, String(candidates[0].dir || candidates[0].name || ''));
      return exact
        ? {
          ...candidates[0],
          verify: buildVerifySuggestions(exact.verify, profile, profile.runtime),
        }
        : candidates[0];
    })()
    : null;

  const report = /** @type {ReturnType<typeof buildSelectionReport> & { selected?: any }} */ (buildSelectionReport(query, profile, opts, evaluated));
  if (selected) report.selected = selected;
  return { selected, candidates, report };
}

module.exports = {
  appendUnique,
  toVarMap,
  actionSupportsRuntime,
  allowCrossRuntime,
  evaluateSkillCandidate,
  matchSkills,
  selectSkill,
  summarizeSkillSelection,
  supportedRuntimes,
};
