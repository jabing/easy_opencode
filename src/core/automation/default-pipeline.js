/**
 * @typedef {{ id?: string } | string | null | undefined} ModeInput
 * @typedef {{ enabled_bundles?: string[], automation_policy_overrides?: Record<string, unknown> } | null | undefined} EcosystemStateInput
 * @typedef {{ recommended_bundles?: string[] } | null | undefined} WorkspaceProfileInput
 * @typedef {{
 *   command: string,
 *   scheduler: { enabled: boolean },
 *   verification: { level: string },
 *   review_gate: { enabled: boolean },
 *   explanation: string[],
 * }} AutomationPolicy
 */

/** @param {ModeInput} mode */
function normalizeModeId(mode) {
  if (!mode) return 'solo';
  if (typeof mode === 'string') return String(mode).trim().toLowerCase() || 'solo';
  if (typeof mode === 'object' && mode.id) return String(mode.id).trim().toLowerCase() || 'solo';
  return 'solo';
}

/** @param {unknown} values @returns {string[]} */
function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((item) => String(item).trim()).filter(Boolean)));
}

/**
 * @param {{ command?: string, mode?: ModeInput, ecosystemState?: EcosystemStateInput, workspaceProfile?: WorkspaceProfileInput }} input
 * @returns {AutomationPolicy}
 */
function buildAutomationPolicy({ command, mode, ecosystemState, workspaceProfile }) {
  const modeId = normalizeModeId(mode);
  const enabledBundles = uniqueStrings(ecosystemState && ecosystemState.enabled_bundles);
  const recommendedBundles = uniqueStrings(workspaceProfile && workspaceProfile.recommended_bundles);
  const explanation = [`mode=${modeId}`];
  for (const bundle of uniqueStrings([...recommendedBundles, ...enabledBundles])) {
    explanation.push(`bundle=${bundle}`);
  }

  const policy = {
    command: String(command || '').trim() || 'implement',
    scheduler: { enabled: String(command || '').trim() === 'implement' },
    verification: { level: modeId === 'solo' ? 'fast' : 'standard' },
    review_gate: { enabled: modeId === 'team' || modeId === 'platform' },
    explanation,
  };

  const overrides = ecosystemState && ecosystemState.automation_policy_overrides && typeof ecosystemState.automation_policy_overrides === 'object'
    ? ecosystemState.automation_policy_overrides
    : {};
  if (Object.prototype.hasOwnProperty.call(overrides, 'review_gate')) {
    policy.review_gate.enabled = Boolean(overrides.review_gate);
    policy.explanation.push('override=review_gate');
  }
  if (Object.prototype.hasOwnProperty.call(overrides, 'verification')) {
    policy.verification.level = String(overrides.verification || policy.verification.level).trim() || policy.verification.level;
    policy.explanation.push('override=verification');
  }
  if (Object.prototype.hasOwnProperty.call(overrides, 'scheduler')) {
    policy.scheduler.enabled = Boolean(overrides.scheduler);
    policy.explanation.push('override=scheduler');
  }

  return policy;
}

module.exports = {
  buildAutomationPolicy,
};
