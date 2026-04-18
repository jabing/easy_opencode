const { createFinding, evaluateRules } = require('./engine.js');

/** @typedef {{ language?: string, framework?: string, runtime?: string, test_runner?: string | null, typecheck_tool?: string | null, validation_by_kind?: Record<string, string> }} ProjectProfileShape */

/** @type {Array<{ id: string, evaluate(profile: ProjectProfileShape): import('./engine.js').RuleFinding[] }>} */
const PROJECT_PROFILE_RULES = [
  {
    id: 'profile.validation.build',
    evaluate(profile) {
      return profile.validation_by_kind && profile.validation_by_kind.build
        ? []
        : [createFinding({ ruleId: 'profile.validation.build', severity: 'warn', message: 'Missing build validation command.', meta: { gap: 'build' } })];
    },
  },
  {
    id: 'profile.validation.test',
    evaluate(profile) {
      /** @type {import('./engine.js').RuleFinding[]} */
      const findings = [];
      if (!profile.validation_by_kind || !profile.validation_by_kind.test) {
        findings.push(createFinding({ ruleId: 'profile.validation.test', severity: 'warn', message: 'Missing test validation command.', meta: { gap: 'test' } }));
        findings.push(createFinding({ ruleId: 'profile.validation.test', severity: 'info', message: 'No test command was detected; changes should add or locate a runnable test entrypoint.' }));
      }
      return findings;
    },
  },
  {
    id: 'profile.validation.lint',
    evaluate(profile) {
      /** @type {import('./engine.js').RuleFinding[]} */
      const findings = [];
      if (!profile.validation_by_kind || !profile.validation_by_kind.lint) {
        findings.push(createFinding({ ruleId: 'profile.validation.lint', severity: 'warn', message: 'Missing lint validation command.', meta: { gap: 'lint' } }));
        findings.push(createFinding({ ruleId: 'profile.validation.lint', severity: 'info', message: 'No lint command was detected; style regressions may need manual review.' }));
      }
      return findings;
    },
  },
  {
    id: 'profile.validation.typecheck',
    evaluate(profile) {
      if (profile.language !== 'typescript') return [];
      return profile.validation_by_kind && profile.validation_by_kind.typecheck
        ? []
        : [createFinding({ ruleId: 'profile.validation.typecheck', severity: 'warn', message: 'Missing typecheck validation command.', meta: { gap: 'typecheck' } })];
    },
  },
  {
    id: 'profile.framework.notes',
    evaluate(profile) {
      /** @type {import('./engine.js').RuleFinding[]} */
      const findings = [];
      if (profile.framework && profile.framework !== 'unknown' && profile.framework !== profile.runtime) {
        findings.push(createFinding({ ruleId: 'profile.framework.notes', severity: 'info', message: `Framework-specific conventions matter here: ${profile.framework}.` }));
      }
      if (profile.test_runner) {
        findings.push(createFinding({ ruleId: 'profile.framework.notes', severity: 'info', message: `Primary test runner appears to be ${profile.test_runner}.` }));
      }
      if (profile.typecheck_tool) {
        findings.push(createFinding({ ruleId: 'profile.framework.notes', severity: 'info', message: `Type or compile validation should prefer ${profile.typecheck_tool}.` }));
      }
      return findings;
    },
  },
];

/** @param {ProjectProfileShape} profile */
function evaluateProjectProfileRules(profile) {
  return evaluateRules(profile, PROJECT_PROFILE_RULES);
}

/** @param {ProjectProfileShape} profile */
function buildValidationGaps(profile) {
  return evaluateProjectProfileRules(profile).findings
    .filter((item) => item.severity === 'warn' && item.meta && typeof item.meta.gap === 'string')
    .map((item) => /** @type {{ gap: string }} */ (item.meta).gap);
}

/** @param {ProjectProfileShape} profile */
function buildProfileNotes(profile) {
  return evaluateProjectProfileRules(profile).findings
    .filter((item) => item.severity === 'info')
    .map((item) => item.message);
}

module.exports = {
  PROJECT_PROFILE_RULES,
  buildProfileNotes,
  buildValidationGaps,
  evaluateProjectProfileRules,
};
