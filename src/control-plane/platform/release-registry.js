const crypto = require('crypto');
const { runReleaseCheck } = require('../../core/release/check.js');
const { generateReleaseEvidence, readLatestReleaseRehearsal } = require('../../core/release/evidence.js');
const { readBenchmarkBaseline } = require('../../core/benchmark/baselines.js');
const { resolveApprovalStatus } = require('../../core/benchmark/baseline-approvals.js');
const { listPolicyOverrides } = require('../../core/release/policy-overrides.js');
const { readEvents } = require('../observability/index.js');

/** @typedef {{ policy?: string, baselineName?: string | null, now?: string | Date | null, overrideId?: string | null, eventLimit?: number | string | null }} ReleaseRegistryOptions */

/** @param {string | null | undefined} input */
function hash(input) {
  return crypto.createHash('sha1').update(String(input || '')).digest('hex').slice(0, 12);
}

/** @param {string} rootDir @param {ReleaseRegistryOptions} [options] */
function buildReleaseRecord(rootDir, options = {}) {
  const policy = String(options.policy || 'production');
  const releaseCheck = runReleaseCheck(rootDir, { policy, baselineName: options.baselineName || null, now: options.now || null, overrideId: options.overrideId || null });
  const baselineName = releaseCheck && releaseCheck.benchmark_baseline_naming && releaseCheck.benchmark_baseline_naming.selected_name
    ? releaseCheck.benchmark_baseline_naming.selected_name
    : String(options.baselineName || 'release');
  const evidence = generateReleaseEvidence(rootDir, {
    policy,
    baselineName,
    eventLimit: Number(options.eventLimit || 100),
    now: options.now || null,
    overrideId: options.overrideId || null,
  });
  const rehearsal = readLatestReleaseRehearsal(rootDir);
  const baseline = readBenchmarkBaseline(rootDir, baselineName);
  const approval = resolveApprovalStatus(rootDir, baselineName);
  const overrides = listPolicyOverrides(rootDir);
  const auditTrail = readEvents(rootDir, { limit: Number(options.eventLimit || 100), reverse: false })
    .map((/** @type {any} */ event) => ({ at: event.at, type: event.type, objective: event.objective || null, flow: event.flow || null, status: event.status || null }))
    .slice(-50);
  const releaseConclusion = evidence && evidence.summary ? evidence.summary.release_conclusion : null;
  /** @type {any} */
  const decisionPackage = {
    schema_name: 'platform_release_decision_package',
    schema_version: '1.0',
    release_decision: releaseConclusion ? releaseConclusion.release_decision : (releaseCheck ? releaseCheck.decision : 'unknown'),
    release_policy: policy,
    baseline_name: baselineName,
    release_check: releaseCheck,
    release_evidence_summary: evidence ? evidence.summary : null,
    latest_rehearsal: rehearsal,
    baseline,
    approval,
    active_overrides: overrides,
  };
  return {
    schema_name: 'platform_release_record',
    schema_version: '1.0',
    release_id: `rel-${hash(JSON.stringify({ policy, baselineName, decision: decisionPackage.release_decision, summary: decisionPackage.release_evidence_summary && decisionPackage.release_evidence_summary.final_decision_summary }))}`,
    generated_at: new Date().toISOString(),
    release_policy: policy,
    baseline_name: baselineName,
    status: decisionPackage.release_decision,
    summary: decisionPackage.release_evidence_summary ? decisionPackage.release_evidence_summary.final_decision_summary : 'release summary unavailable',
    decision_package: decisionPackage,
    audit_trail: auditTrail,
    ui_card: {
      title: `Release ${decisionPackage.release_decision}`,
      subtitle: `${policy} · ${baselineName}`,
      status: decisionPackage.release_decision,
      badges: [
        `benchmark:${decisionPackage.release_evidence_summary ? decisionPackage.release_evidence_summary.benchmark_readiness : 'unknown'}`,
        `freshness:${decisionPackage.release_evidence_summary ? decisionPackage.release_evidence_summary.benchmark_freshness : 'unknown'}`,
        `baseline:${decisionPackage.release_evidence_summary ? decisionPackage.release_evidence_summary.approval_status : 'unknown'}`,
      ],
    },
  };
}

module.exports = {
  buildReleaseRecord,
};
