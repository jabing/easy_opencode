/** @typedef {'general' | 'planner' | 'reviewer' | 'verifier' | 'releaser' | 'transformer' | 'implementer'} CapabilityKind */
/** @typedef {'recommended' | 'extended' | 'internal'} CapabilitySurface */
/** @typedef {'stable' | 'beta' | 'experimental'} CapabilityMaturity */

/** @typedef {{ kind?: CapabilityKind, surface?: CapabilitySurface, maturity?: CapabilityMaturity, recommended?: boolean }} CapabilityPolicy */

/** @type {Record<string, CapabilityPolicy>} */
const AGENT_CAPABILITY_POLICY = {
  'eoc_orchestrator': { kind: 'general', surface: 'recommended', maturity: 'stable', recommended: true },
  'eoc_code_reviewer': { kind: 'reviewer', surface: 'recommended', maturity: 'stable', recommended: true },
  'eoc_planner': { kind: 'planner', surface: 'internal', maturity: 'stable', recommended: false },
  'tdd-guide': { kind: 'verifier', surface: 'extended', maturity: 'stable', recommended: false },
  'security-reviewer': { kind: 'reviewer', surface: 'extended', maturity: 'stable', recommended: false },
  'build-error-resolver': { kind: 'transformer', surface: 'extended', maturity: 'stable', recommended: false },
  'go-build-resolver': { kind: 'transformer', surface: 'extended', maturity: 'beta', recommended: false },
  'go-reviewer': { kind: 'reviewer', surface: 'extended', maturity: 'beta', recommended: false },
  'python-reviewer': { kind: 'reviewer', surface: 'extended', maturity: 'beta', recommended: false },
  'database-reviewer': { kind: 'reviewer', surface: 'extended', maturity: 'beta', recommended: false },
  'architect': { kind: 'reviewer', surface: 'extended', maturity: 'beta', recommended: false },
  'e2e-runner': { kind: 'verifier', surface: 'extended', maturity: 'beta', recommended: false },
  'refactor-cleaner': { kind: 'transformer', surface: 'extended', maturity: 'beta', recommended: false },
  'doc-updater': { kind: 'general', surface: 'internal', maturity: 'beta', recommended: false },
  'repo-aware-coder': { kind: 'implementer', surface: 'extended', maturity: 'stable', recommended: false },
  'ts-coder': { kind: 'implementer', surface: 'extended', maturity: 'stable', recommended: false },
};

/** @type {Record<string, CapabilityPolicy>} */
const SCRIPT_CAPABILITY_POLICY = {
  'project-profile': { kind: 'planner', surface: 'recommended', maturity: 'stable', recommended: true },
  'implement-task': { kind: 'implementer', surface: 'recommended', maturity: 'stable', recommended: true },
  'bootstrap': { kind: 'planner', surface: 'recommended', maturity: 'stable', recommended: true },
  'run-tests': { kind: 'verifier', surface: 'recommended', maturity: 'stable', recommended: true },
  'review-gate': { kind: 'reviewer', surface: 'recommended', maturity: 'stable', recommended: true },
  'quality-gate': { kind: 'verifier', surface: 'recommended', maturity: 'stable', recommended: true },
  'release-check': { kind: 'releaser', surface: 'recommended', maturity: 'stable', recommended: true },
  'release-evidence': { kind: 'releaser', surface: 'recommended', maturity: 'stable', recommended: true },
  'delivery-report': { kind: 'releaser', surface: 'recommended', maturity: 'stable', recommended: true },
};

/** @param {string} agentId */
function getAgentCapabilityPolicy(agentId) {
  return AGENT_CAPABILITY_POLICY[String(agentId || '').trim()] || null;
}

/** @param {string} scriptId */
function getScriptCapabilityPolicy(scriptId) {
  return SCRIPT_CAPABILITY_POLICY[String(scriptId || '').trim()] || null;
}

/** @param {string} scriptId */
function isRecommendedScript(scriptId) {
  const policy = getScriptCapabilityPolicy(scriptId);
  return Boolean(policy && policy.recommended === true);
}

module.exports = {
  AGENT_CAPABILITY_POLICY,
  SCRIPT_CAPABILITY_POLICY,
  getAgentCapabilityPolicy,
  getScriptCapabilityPolicy,
  isRecommendedScript,
};
