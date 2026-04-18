const { normalizeReleaseConclusion } = require('./conclusion.js');

const RELEASE_AUDIT_SUMMARY_SCHEMA_VERSION = '1.0';

/**
 * @typedef {object} ReleaseAuditSummaryInput
 * @property {string} [schema_version]
 * @property {string} [title]
 * @property {string | null} [generated_at]
 * @property {string | null} [generatedAt]
 * @property {string} [policy]
 * @property {string | null} [baseline_name]
 * @property {string | null} [baselineName]
 * @property {string | null} [preflight_decision]
 * @property {string | null} [preflightDecision]
 * @property {import('./conclusion.js').NormalizedReleaseConclusion | null} [release_conclusion]
 * @property {import('./conclusion.js').NormalizedReleaseConclusion | null} [releaseConclusion]
 * @property {string | null} [final_decision_summary]
 * @property {string | null} [finalDecisionSummary]
 * @property {string[] | string | null} [why_blocked_or_caution]
 * @property {string[] | string | null} [whyBlockedOrCaution]
 * @property {string} [benchmark_readiness]
 * @property {string} [benchmarkReadiness]
 * @property {string} [benchmark_freshness]
 * @property {string} [benchmarkFreshness]
 * @property {string} [baseline_status]
 * @property {string} [baselineStatus]
 * @property {string} [approval_status]
 * @property {string} [approvalStatus]
 * @property {string} [latest_rehearsal_decision]
 * @property {string} [latestRehearsalDecision]
 * @property {boolean} [rollback_ready]
 * @property {{ status?: string, last_30_days_count?: number }} [override_pressure]
 * @property {Record<string, unknown> | null} [entrypoints]
 */

/** @param {unknown} value @param {unknown} fallback */
function normalizeReasons(value, fallback) {
  const reasons = Array.isArray(value) ? value.filter((item) => String(item || '').trim()) : [];
  if (reasons.length > 0) return reasons;
  const text = String(fallback || '').trim();
  return text ? [text] : ['release conclusion unavailable'];
}

/** @param {ReleaseAuditSummaryInput} [input] */
function buildReleaseAuditSummary(input = {}) {
  const releaseConclusion = normalizeReleaseConclusion(input.release_conclusion || input.releaseConclusion || {});
  const entrypoints = input.entrypoints && typeof input.entrypoints === 'object' ? input.entrypoints : null;
  const finalDecisionSummary = input.final_decision_summary || input.finalDecisionSummary || releaseConclusion.reason || 'release conclusion unavailable';
  /** @type {Record<string, unknown>} */
  const summary = {
    schema_version: input.schema_version || RELEASE_AUDIT_SUMMARY_SCHEMA_VERSION,
    schema_name: 'release_audit_summary',
    title: input.title || 'Release audit summary',
    generated_at: input.generated_at || input.generatedAt || null,
    policy: input.policy || releaseConclusion.release_policy || 'unknown',
    baseline_name: input.baseline_name || input.baselineName || releaseConclusion.selected_baseline_name || null,
    preflight_decision: input.preflight_decision || input.preflightDecision || null,
    release_conclusion: releaseConclusion,
    final_decision_summary: finalDecisionSummary,
    why_blocked_or_caution: normalizeReasons(input.why_blocked_or_caution || input.whyBlockedOrCaution, finalDecisionSummary),
    benchmark_readiness: input.benchmark_readiness || input.benchmarkReadiness || 'unknown',
    benchmark_freshness: input.benchmark_freshness || input.benchmarkFreshness || 'unknown',
    baseline_status: input.baseline_status || input.baselineStatus || 'unknown',
    approval_status: input.approval_status || input.approvalStatus || 'unknown',
    latest_rehearsal_decision: input.latest_rehearsal_decision || input.latestRehearsalDecision || 'unknown',
    rollback_ready: typeof input.rollback_ready === 'boolean' ? input.rollback_ready : releaseConclusion.rollback_ready,
    override_pressure: {
      status: input.override_pressure && input.override_pressure.status ? input.override_pressure.status : releaseConclusion.override_pressure_status,
      last_30_days_count: Number(input.override_pressure && typeof input.override_pressure.last_30_days_count !== 'undefined'
        ? input.override_pressure.last_30_days_count
        : releaseConclusion.override_pressure_last_30_days || 0),
    },
  };
  if (entrypoints) summary.entrypoints = entrypoints;
  return summary;
}

module.exports = {
  RELEASE_AUDIT_SUMMARY_SCHEMA_VERSION,
  buildReleaseAuditSummary,
};
