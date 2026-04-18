/** @typedef {'internal' | 'standard' | 'production'} ReleasePolicyId */
/** @typedef {{ strict?: boolean }} ReleasePolicyOptions */

/** @type {Record<ReleasePolicyId, { id: ReleasePolicyId, label: string, block_on_warn: boolean, benchmark: { minimum_run_count: number, minimum_confidence: number, require_coverage: string, require_baseline: boolean, require_approval: boolean, freshness: { fresh_days: number, aging_days: number, stale_days: number } }, override: { require_reason: boolean, minimum_reason_length: number, require_expiry: boolean, max_duration_hours: number, max_usage_count: number, disallowed_checks: string[] } }>} */
const POLICY_PRESETS = {
  internal: {
    id: 'internal',
    label: 'Internal trial',
    block_on_warn: false,
    benchmark: {
      minimum_run_count: 3,
      minimum_confidence: 20,
      require_coverage: 'partial',
      require_baseline: false,
      require_approval: false,
      freshness: { fresh_days: 21, aging_days: 35, stale_days: 49 },
    },
    override: {
      require_reason: true,
      minimum_reason_length: 10,
      require_expiry: true,
      max_duration_hours: 72,
      max_usage_count: 5,
      disallowed_checks: ['snapshot.readiness'],
    },
  },
  standard: {
    id: 'standard',
    label: 'Standard release candidate',
    block_on_warn: false,
    benchmark: {
      minimum_run_count: 5,
      minimum_confidence: 30,
      require_coverage: 'sufficient',
      require_baseline: false,
      require_approval: false,
      freshness: { fresh_days: 14, aging_days: 21, stale_days: 35 },
    },
    override: {
      require_reason: true,
      minimum_reason_length: 12,
      require_expiry: true,
      max_duration_hours: 24,
      max_usage_count: 2,
      disallowed_checks: ['snapshot.readiness', 'benchmark.data_freshness'],
    },
  },
  production: {
    id: 'production',
    label: 'Production release',
    block_on_warn: true,
    benchmark: {
      minimum_run_count: 8,
      minimum_confidence: 40,
      require_coverage: 'sufficient',
      require_baseline: true,
      require_approval: true,
      freshness: { fresh_days: 7, aging_days: 14, stale_days: 21 },
    },
    override: {
      require_reason: true,
      minimum_reason_length: 15,
      require_expiry: true,
      max_duration_hours: 8,
      max_usage_count: 1,
      disallowed_checks: ['snapshot.readiness', 'benchmark.data_freshness', 'benchmark.scope_coverage', 'benchmark.baseline_approval'],
    },
  },
};

/** @param {unknown} value @returns {ReleasePolicyId} */
function normalizeReleasePolicy(value) {
  const raw = String(value || 'standard').trim().toLowerCase();
  if (!raw || raw === 'default' || raw === 'candidate' || raw === 'release-candidate' || raw === 'rc' || raw === 'standard') return 'standard';
  if (raw === 'internal' || raw === 'trial' || raw === 'dev') return 'internal';
  if (raw === 'production' || raw === 'prod' || raw === 'release') return 'production';
  throw new Error(`unsupported release policy: ${value}`);
}

/** @param {unknown} value @param {ReleasePolicyOptions} [options] */
function resolveReleasePolicy(value, options = {}) {
  const id = normalizeReleasePolicy(value);
  const preset = POLICY_PRESETS[id];
  return {
    ...preset,
    block_on_warn: Boolean(options.strict) || Boolean(preset.block_on_warn),
  };
}

module.exports = { POLICY_PRESETS, normalizeReleasePolicy, resolveReleasePolicy };
