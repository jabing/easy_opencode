const {
  isRecord,
  assertString,
  assertNumber,
  assertBoolean,
  assertStringArray,
  assertArray,
  assertRecord,
  assertCounts,
  assertCheckEntries,
  assertIsoDateString,
} = require('./common.js');

/** @param {unknown} value */

function assertReleaseEvidenceContract(value) {
  assertRecord(value, 'release-evidence');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertRecord(record.summary, 'release-evidence.summary');
  const summary = /** @type {Record<string, unknown>} */ (record.summary);
  assertString(summary.release_decision, 'release-evidence.summary.release_decision');
  assertString(summary.release_policy, 'release-evidence.summary.release_policy');
  assertString(summary.final_decision_summary, 'release-evidence.summary.final_decision_summary');
  if (record.release_report !== undefined && record.release_report !== null) {
    assertRecord(record.release_report, 'release-evidence.release_report');
    const report = /** @type {Record<string, unknown>} */ (record.release_report);
    assertString(report.decision, 'release-evidence.release_report.decision');
  }
}

/** @param {unknown} value */

function assertReleaseRehearsalContract(value) {
  assertRecord(value, 'release-rehearsal');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.decision, 'release-rehearsal.decision');
  assertString(record.rehearsal_root, 'release-rehearsal.rehearsal_root');
  if (record.release_report !== undefined && record.release_report !== null) {
    assertRecord(record.release_report, 'release-rehearsal.release_report');
    const report = /** @type {Record<string, unknown>} */ (record.release_report);
    assertString(report.decision, 'release-rehearsal.release_report.decision');
  }
}

/** @param {unknown} value */

function assertTestStabilityContract(value) {
  assertRecord(value, 'test-stability');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.schema_name, 'test-stability.schema_name');
  assertBoolean(record.stable, 'test-stability.stable');
  assertNumber(record.repeat_count, 'test-stability.repeat_count');
  assertNumber(record.pass_count, 'test-stability.pass_count');
  assertNumber(record.fail_count, 'test-stability.fail_count');
  assertArray(record.iterations, 'test-stability.iterations');
}

/** @param {unknown} value */

function assertPreflightProductionContract(value) {
  assertRecord(value, 'preflight-production');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.decision, 'preflight-production.decision');
  assertArray(record.results, 'preflight-production.results');
  if (record.topline !== undefined && record.topline !== null) {
    assertRecord(record.topline, 'preflight-production.topline');
  }
}

/** @param {unknown} value */

function assertObservabilityReportContract(value) {
  assertRecord(value, 'observability-report');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.root_dir, 'observability-report.root_dir');
  assertRecord(record.events, 'observability-report.events');
  const events = /** @type {Record<string, unknown>} */ (record.events);
  assertNumber(events.event_count, 'observability-report.events.event_count');
  assertRecord(record.benchmarks, 'observability-report.benchmarks');
  const benchmarks = /** @type {Record<string, unknown>} */ (record.benchmarks);
  assertNumber(benchmarks.run_count, 'observability-report.benchmarks.run_count');
}

/** @param {unknown} value */

function assertPlatformSnapshotContract(value) {
  assertRecord(value, 'platform-report');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.schema_name, 'platform-report.schema_name');
  assertString(record.schema_version, 'platform-report.schema_version');
  assertIsoDateString(record.generated_at, 'platform-report.generated_at');
  assertString(record.root_dir, 'platform-report.root_dir');
}


/** @param {unknown} value */

function assertFeatureAcceptanceContract(value) {
  assertRecord(value, 'feature-acceptance');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.schema_version, 'feature-acceptance.schema_version');
  assertIsoDateString(record.generated_at, 'feature-acceptance.generated_at');
  assertNumber(record.feature_count, 'feature-acceptance.feature_count');
  assertNumber(record.ready_count, 'feature-acceptance.ready_count');
  assertNumber(record.incomplete_count, 'feature-acceptance.incomplete_count');
  assertString(record.summary, 'feature-acceptance.summary');
  assertArray(record.features, 'feature-acceptance.features');
}

/** @param {unknown} value */

function assertFailureStrategyContract(value) {
  assertRecord(value, 'failure-strategy');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.run_id, 'failure-strategy.run_id');
  assertString(record.status, 'failure-strategy.status');
  assertString(record.action, 'failure-strategy.action');
  assertString(record.confidence, 'failure-strategy.confidence');
  assertArray(record.reasons, 'failure-strategy.reasons');
  assertRecord(record.signals, 'failure-strategy.signals');
}

/** @param {unknown} value */

function assertDeliveryReportContract(value) {
  assertRecord(value, 'delivery-report');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.schema_version, 'delivery-report.schema_version');
  assertIsoDateString(record.generated_at, 'delivery-report.generated_at');
  assertString(record.root_dir, 'delivery-report.root_dir');
  assertString(record.objective, 'delivery-report.objective');
  assertRecord(record.profile, 'delivery-report.profile');
  assertRecord(record.git, 'delivery-report.git');
}

/** @param {unknown} value */

function assertReviewGateContract(value) {
  assertRecord(value, 'review-gate');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.schema_version, 'review-gate.schema_version');
  assertIsoDateString(record.generated_at, 'review-gate.generated_at');
  assertString(record.root_dir, 'review-gate.root_dir');
  assertString(record.verdict, 'review-gate.verdict');
  assertRecord(record.evidence_bundle, 'review-gate.evidence_bundle');
  assertRecord(record.scope_summary, 'review-gate.scope_summary');
  assertRecord(record.status_inputs, 'review-gate.status_inputs');
  assertRecord(record.findings, 'review-gate.findings');
  assertRecord(record.merge_risk_summary, 'review-gate.merge_risk_summary');
}

/** @param {unknown} value */
module.exports = {
  assertReleaseEvidenceContract,
  assertReleaseRehearsalContract,
  assertTestStabilityContract,
  assertPreflightProductionContract,
  assertObservabilityReportContract,
  assertPlatformSnapshotContract,
  assertFeatureAcceptanceContract,
  assertFailureStrategyContract,
  assertDeliveryReportContract,
  assertReviewGateContract
};
