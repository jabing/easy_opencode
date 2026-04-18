/** @typedef {'pass' | 'fail' | 'warn' | 'skip'} GateStatus */
/** @typedef {'blocked' | 'caution' | 'ready'} GateDecision */
/** @typedef {{ strict?: boolean }} GateOptions */
/** @typedef {{ status?: GateStatus, detail?: string, blocking?: boolean, matched_evidence_ids?: string[], meta?: Record<string, unknown> }} RuleDecision */
/** @typedef {{ id: string, title?: string, evaluate: (evidence: unknown[], options: { strict: boolean }) => (RuleDecision | null | undefined) }} GateRule */
/** @typedef {{ gateId: string, evidence?: unknown[], rules?: GateRule[], strict?: boolean }} EvaluateGateInput */

/** @param {GateStatus[]} [statuses] @param {GateOptions} [options] @returns {GateDecision} */
function buildDecision(statuses = [], options = {}) {
  const strict = Boolean(options.strict);
  if (statuses.includes('fail')) return 'blocked';
  if (strict && statuses.includes('warn')) return 'blocked';
  if (statuses.includes('warn')) return 'caution';
  return 'ready';
}

/** @param {GateRule} rule @param {RuleDecision | null | undefined} decision */
function normalizeDecision(rule, decision) {
  const next = decision || {};
  return {
    rule_id: rule.id,
    title: rule.title || rule.id,
    status: next.status || 'skip',
    detail: next.detail || '',
    blocking: Boolean(next.blocking),
    matched_evidence_ids: Array.isArray(next.matched_evidence_ids) ? next.matched_evidence_ids : [],
    meta: next.meta || {},
  };
}

/** @param {EvaluateGateInput} input */
function evaluateGate({ gateId, evidence = [], rules = [], strict = false }) {
  const decisions = rules.map((rule) => normalizeDecision(rule, rule.evaluate(evidence, { strict: Boolean(strict) })));
  const statuses = decisions.map((item) => item.status);
  const summary = {
    pass: decisions.filter((item) => item.status === 'pass').length,
    fail: decisions.filter((item) => item.status === 'fail').length,
    warn: decisions.filter((item) => item.status === 'warn').length,
    skip: decisions.filter((item) => item.status === 'skip').length,
  };
  return {
    gate_id: gateId,
    strict: Boolean(strict),
    decision: buildDecision(statuses, { strict }),
    rules: decisions,
    counts: summary,
    blockers: decisions.filter((item) => item.status === 'fail' || (Boolean(strict) && item.status === 'warn')),
    warnings: decisions.filter((item) => item.status === 'warn'),
  };
}

module.exports = {
  buildDecision,
  evaluateGate,
};
