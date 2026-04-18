const { createFinding, evaluateRules } = require('./engine.js');
const { checkPackageHygiene } = require('../package-hygiene.js');

/** @typedef {{ root: string, metadataCheck: () => { ok: boolean, detail: string }, skillRegistryCheck?: () => { ok: boolean, detail: string }, skillMetadataCheck?: () => { ok: boolean, detail: string } }} QualityInput */

/** @type {Array<{ id: string, evaluate(input: QualityInput): import('./engine.js').RuleFinding[] }>} */
const QUALITY_RULES = [
  {
    id: 'quality.package-hygiene',
    evaluate(input) {
      const result = checkPackageHygiene(input.root);
      /** @type {import('./engine.js').RuleFinding[]} */
      const findings = [];
      for (const message of result.errors) findings.push(createFinding({ ruleId: 'quality.package-hygiene', severity: 'error', message }));
      for (const message of result.warnings) findings.push(createFinding({ ruleId: 'quality.package-hygiene', severity: 'warn', message }));
      return findings;
    },
  },
  {
    id: 'quality.metadata-consistency',
    evaluate(input) {
      const result = input.metadataCheck();
      return result.ok ? [] : [createFinding({ ruleId: 'quality.metadata-consistency', severity: 'error', message: result.detail })];
    },
  },
  {
    id: 'quality.skill-metadata',
    evaluate(input) {
      if (typeof input.skillMetadataCheck !== 'function') return [];
      const result = input.skillMetadataCheck();
      return result.ok ? [] : [createFinding({ ruleId: 'quality.skill-metadata', severity: 'error', message: result.detail })];
    },
  },
  {
    id: 'quality.skill-registry',
    evaluate(input) {
      if (typeof input.skillRegistryCheck !== 'function') return [];
      const result = input.skillRegistryCheck();
      return result.ok ? [] : [createFinding({ ruleId: 'quality.skill-registry', severity: 'error', message: result.detail })];
    },
  },
];

/** @param {QualityInput} input */
function evaluateQualityRules(input) {
  return evaluateRules(input, QUALITY_RULES);
}

module.exports = {
  QUALITY_RULES,
  evaluateQualityRules,
};
