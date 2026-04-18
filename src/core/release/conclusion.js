const RELEASE_CONCLUSION_SCHEMA_VERSION = '1.1';

/**
 * @typedef {object} ReleaseConclusionInput
 * @property {string} [schema_version]
 * @property {string} [release_decision]
 * @property {string} [decision]
 * @property {string} [ready_state]
 * @property {string} [release_reason]
 * @property {string} [reason]
 * @property {string} [release_policy]
 * @property {boolean} [override_used]
 * @property {boolean} [baseline_approved]
 * @property {boolean} [benchmark_fresh_enough]
 * @property {boolean} [rollback_ready]
 * @property {string | null} [canonical_baseline_name]
 * @property {string | null} [selected_baseline_name]
 * @property {string} [override_pressure_status]
 * @property {number} [override_pressure_last_30_days]
 */

/** @typedef {{ release_conclusion?: ReleaseConclusionInput | null }} ReleaseConclusionWrapper */
/** @typedef {ReleaseConclusionInput & { schema_version: string, release_decision: string, ready_state: string, reason: string, release_policy: string, override_used: boolean, baseline_approved: boolean, benchmark_fresh_enough: boolean, rollback_ready: boolean, canonical_baseline_name: string | null, selected_baseline_name: string | null, override_pressure_status: string, override_pressure_last_30_days: number }} NormalizedReleaseConclusion */

/** @param {unknown} value */
function normalizeDecision(value) {
  const decision = String(value || 'unknown').trim();
  return decision || 'unknown';
}

/** @param {ReleaseConclusionInput} [input] @returns {NormalizedReleaseConclusion} */
function buildReleaseConclusion(input = {}) {
  const releaseDecision = normalizeDecision(input.release_decision || input.decision);
  return {
    schema_version: input.schema_version || RELEASE_CONCLUSION_SCHEMA_VERSION,
    release_decision: releaseDecision,
    ready_state: input.ready_state || releaseDecision,
    reason: input.release_reason || input.reason || 'release conclusion unavailable',
    release_policy: input.release_policy || 'standard',
    override_used: Boolean(input.override_used),
    baseline_approved: Boolean(input.baseline_approved),
    benchmark_fresh_enough: Boolean(input.benchmark_fresh_enough),
    rollback_ready: Boolean(input.rollback_ready),
    canonical_baseline_name: input.canonical_baseline_name || null,
    selected_baseline_name: input.selected_baseline_name || null,
    override_pressure_status: input.override_pressure_status || 'unknown',
    override_pressure_last_30_days: Number(input.override_pressure_last_30_days || 0),
  };
}

/** @param {ReleaseConclusionInput | ReleaseConclusionWrapper | null | undefined} [input] @returns {NormalizedReleaseConclusion} */
function normalizeReleaseConclusion(input = {}) {
  if (input && typeof input === 'object' && 'release_conclusion' in input && input.release_conclusion && typeof input.release_conclusion === 'object') {
    return buildReleaseConclusion(input.release_conclusion);
  }
  return buildReleaseConclusion(/** @type {ReleaseConclusionInput} */ (input || {}));
}

/** @param {ReleaseConclusionInput | ReleaseConclusionWrapper | null | undefined} releaseConclusion @param {{ preflight_decision?: string }} [extra] */
function buildReleaseConclusionLegacySummary(releaseConclusion, extra = {}) {
  const normalized = normalizeReleaseConclusion(releaseConclusion);
  return {
    ...('preflight_decision' in extra ? { preflight_decision: extra.preflight_decision } : {}),
    release_decision: normalized.release_decision,
    release_reason: normalized.reason,
    release_policy: normalized.release_policy,
    override_used: normalized.override_used,
    override_pressure_status: normalized.override_pressure_status,
    override_pressure_last_30_days: normalized.override_pressure_last_30_days,
    baseline_approved: normalized.baseline_approved,
    benchmark_fresh_enough: normalized.benchmark_fresh_enough,
    rollback_ready: normalized.rollback_ready,
    canonical_baseline_name: normalized.canonical_baseline_name,
    selected_baseline_name: normalized.selected_baseline_name,
  };
}

/** @param {ReleaseConclusionInput | ReleaseConclusionWrapper | null | undefined} releaseConclusion @param {{ preflight_decision?: string }} [extra] */
function buildReleaseConclusionEnvelope(releaseConclusion, extra = {}) {
  const normalized = normalizeReleaseConclusion(releaseConclusion);
  return {
    schema_version: normalized.schema_version || RELEASE_CONCLUSION_SCHEMA_VERSION,
    primary_field: 'release_conclusion',
    compatibility_mode: 'legacy_flat_fields_supported',
    release_conclusion: normalized,
    legacy_summary: buildReleaseConclusionLegacySummary(normalized, extra),
  };
}

module.exports = {
  RELEASE_CONCLUSION_SCHEMA_VERSION,
  buildReleaseConclusion,
  buildReleaseConclusionEnvelope,
  buildReleaseConclusionLegacySummary,
  normalizeReleaseConclusion,
};
