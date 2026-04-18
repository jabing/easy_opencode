/**
 * @typedef {'info' | 'warn' | 'error'} RuleSeverity
 * @typedef {{
 *   ruleId: string,
 *   severity: RuleSeverity,
 *   message: string,
 *   location?: string,
 *   meta?: Record<string, unknown>,
 * }} RuleFinding
 * @typedef {{ id: string, title?: string, evaluate(input: unknown, context?: Record<string, unknown>): RuleFinding[] }} Rule
 * @typedef {{ findings: RuleFinding[], counts: { info: number, warn: number, error: number } }} RuleEvaluationResult
 */

/** @param {Partial<RuleFinding> & { ruleId: string, severity: RuleSeverity, message: string }} finding @returns {RuleFinding} */
function createFinding(finding) {
  return {
    ruleId: String(finding.ruleId),
    severity: finding.severity,
    message: String(finding.message),
    ...(finding.location ? { location: String(finding.location) } : {}),
    ...(finding.meta && typeof finding.meta === 'object' ? { meta: finding.meta } : {}),
  };
}

/** @param {unknown} input @param {Rule[]} rules @param {Record<string, unknown>} [context] @returns {RuleEvaluationResult} */
function evaluateRules(input, rules, context = {}) {
  /** @type {RuleFinding[]} */
  const findings = [];
  for (const rule of rules) {
    const result = rule.evaluate(input, context) || [];
    for (const finding of result) findings.push(createFinding(finding));
  }
  return {
    findings,
    counts: {
      info: findings.filter((item) => item.severity === 'info').length,
      warn: findings.filter((item) => item.severity === 'warn').length,
      error: findings.filter((item) => item.severity === 'error').length,
    },
  };
}

module.exports = {
  createFinding,
  evaluateRules,
};
