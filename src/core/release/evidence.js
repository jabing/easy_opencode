const fs = require('fs');
const path = require('path');
const { runReleaseCheck } = require('./check.js');
const { readBenchmarkBaseline } = require('../benchmark/baselines.js');
const { resolveApprovalStatus } = require('../benchmark/baseline-approvals.js');
const { listPolicyOverrides } = require('./policy-overrides.js');
const { readEvents, summarizeEvents, resolveObservabilityDir } = require('../../control-plane/observability/index.js');
const {
  buildReleaseConclusion,
  buildReleaseConclusionEnvelope,
  buildReleaseConclusionLegacySummary,
} = require('./conclusion.js');
const { buildReleaseAuditSummary } = require('./audit-summary.js');
const { createEvidence, summarizeEvidence } = require('../gates/evidence-store.js');
const { evaluateGate } = require('../gates/engine.js');

/** @typedef {import('../gates/evidence-store.js').EvidenceRecord} EvidenceRecord */
/** @typedef {Record<string, any>} LooseRecord */

/** @param {string} filePath @returns {LooseRecord | null} */
function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return /** @type {LooseRecord} */ (JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

/** @param {string} rootDir @returns {string} */
function resolveRehearsalDir(rootDir) {
  return path.join(resolveObservabilityDir(rootDir), 'release-rehearsals');
}

/** @param {string} rootDir @returns {LooseRecord | null} */
function readLatestReleaseRehearsal(rootDir) {
  return tryReadJson(path.join(resolveRehearsalDir(rootDir), 'latest.json'));
}

/** @param {LooseRecord | null | undefined} report */
function findBlockingChecks(report) {
  const checks = report && Array.isArray(report.checks) ? report.checks : [];
  return checks
    .filter((item) => item && (item.status === 'fail' || item.status === 'warn'))
    .map((item) => ({ check: item.check, status: item.status, detail: item.detail }));
}

/** @param {LooseRecord[]} items @param {number} days @param {number} nowMs */
function trailingFilter(items, days, nowMs) {
  const windowMs = days * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const stamp = new Date(item.updated_at || item.approved_at || item.created_at || 0).getTime();
    return Number.isFinite(stamp) && (nowMs - stamp) <= windowMs;
  });
}

/** @param {LooseRecord[] | null | undefined} overrides */
function buildOverridePressure(overrides) {
  const approved = (overrides || []).filter((item) => item && item.status === 'approved');
  const nowMs = Date.now();
  const trailing7 = trailingFilter(approved, 7, nowMs);
  const trailing30 = trailingFilter(approved, 30, nowMs);
  /** @type {Record<string, number>} */
  const repeatedChecks = {};
  /** @type {Record<string, number>} */
  const repeatedChecks30 = {};
  /** @type {Record<string, number>} */
  const repeatedPolicies30 = {};
  for (const item of approved) {
    for (const check of item.allowed_checks || []) repeatedChecks[String(check)] = (repeatedChecks[String(check)] || 0) + 1;
  }
  for (const item of trailing30) {
    const policy = item.policy && item.policy.id ? String(item.policy.id) : 'unknown';
    repeatedPolicies30[policy] = (repeatedPolicies30[policy] || 0) + 1;
    for (const check of item.allowed_checks || []) repeatedChecks30[String(check)] = (repeatedChecks30[String(check)] || 0) + 1;
  }
  const hotspots = Object.entries(repeatedChecks).filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).map(([check, count]) => ({ check, count }));
  const recentHotspots = Object.entries(repeatedChecks30).filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).map(([check, count]) => ({ check, count }));
  const highFrequency = trailing30.length >= 3 || trailing7.length >= 2;
  const score = trailing30.length + (recentHotspots.length * 2) + (highFrequency ? 2 : 0);
  return {
    approved_total: approved.length,
    last_7_days_count: trailing7.length,
    last_30_days_count: trailing30.length,
    high_frequency: highFrequency,
    repeated_checks: hotspots,
    repeated_checks_last_30_days: recentHotspots,
    by_policy_last_30_days: Object.entries(repeatedPolicies30).sort((a, b) => b[1] - a[1]).map(([policy, count]) => ({ policy, count })),
    score,
    status: score >= 6 ? 'high' : score >= 3 ? 'elevated' : approved.length > 0 ? 'present' : 'none',
  };
}

/** @param {LooseRecord | null | undefined} report @param {LooseRecord | null | undefined} rehearsal @param {LooseRecord | null | undefined} baseline @param {LooseRecord | null | undefined} approval @param {LooseRecord[] | null | undefined} overrides */
function buildEvidenceSummary(report, rehearsal, baseline, approval, overrides) {
  const activeOverrides = (overrides || []).filter((item) => item && item.status === 'approved');
  const constrainedOverrides = activeOverrides.filter((item) => item.constraints && Number(item.constraints.max_usage_count || 0) > 0);
  const blockingChecks = report ? findBlockingChecks(report) : [];
  const benchmarkReadiness = report?.benchmark_feedback?.release_readiness?.status || 'unknown';
  const benchmarkFreshness = report?.benchmark_feedback?.freshness?.status || 'unknown';
  const baselineStatus = baseline ? 'present' : 'missing';
  const approvalStatus = approval ? String(approval.status || 'missing') : 'missing';
  const latestRehearsalDecision = rehearsal?.decision ? String(rehearsal.decision) : 'missing';
  const overridePressure = buildOverridePressure(overrides);
  const baselineNaming = report?.benchmark_baseline_naming || null;
  /** @type {string[]} */
  const finalSummary = [];
  finalSummary.push(`decision=${report ? report.decision : 'unknown'}`);
  if (blockingChecks.length > 0) finalSummary.push(`checks=${blockingChecks.map((item) => item.check).join(',')}`);
  finalSummary.push(`benchmark=${benchmarkReadiness}/${benchmarkFreshness}`);
  finalSummary.push(`baseline=${baselineStatus}/${approvalStatus}`);
  finalSummary.push(`rehearsal=${latestRehearsalDecision}`);
  if (baselineNaming && baselineNaming.selected_name) finalSummary.push(`baseline_name=${baselineNaming.selected_name}`);
  if (activeOverrides.length > 0) finalSummary.push(`override=${report?.policy_override?.applied ? 'applied' : 'active'}`);
  const releaseConclusion = buildReleaseConclusion({
    release_decision: report ? report.decision : 'unknown',
    ready_state: report ? report.decision : 'unknown',
    reason: blockingChecks.length > 0 ? blockingChecks.map((item) => `${item.check}: ${item.detail}`).join(' | ') : 'all required checks satisfied',
    release_policy: report?.selected_policy?.id || 'standard',
    override_used: Boolean(report?.policy_override?.applied),
    baseline_approved: approvalStatus === 'approved',
    benchmark_fresh_enough: benchmarkFreshness === 'fresh' || benchmarkFreshness === 'aging',
    rollback_ready: Boolean(report?.snapshot_readiness?.ready),
    canonical_baseline_name: baselineNaming ? baselineNaming.recommended_name : null,
    selected_baseline_name: baselineNaming ? baselineNaming.selected_name : null,
    override_pressure_status: overridePressure.status,
    override_pressure_last_30_days: overridePressure.last_30_days_count,
  });
  const finalDecisionSummary = finalSummary.join(' | ');
  const whyBlockedOrCaution = blockingChecks.map((item) => `${item.check}: ${item.detail}`);
  const legacySummary = buildReleaseConclusionLegacySummary(releaseConclusion);
  const auditSummary = buildReleaseAuditSummary({
    policy: releaseConclusion.release_policy,
    baseline_name: releaseConclusion.selected_baseline_name,
    release_conclusion: releaseConclusion,
    final_decision_summary: finalDecisionSummary,
    why_blocked_or_caution: whyBlockedOrCaution,
    benchmark_readiness: benchmarkReadiness,
    benchmark_freshness: benchmarkFreshness,
    baseline_status: baselineStatus,
    approval_status: approvalStatus,
    latest_rehearsal_decision: latestRehearsalDecision,
    rollback_ready: releaseConclusion.rollback_ready,
    override_pressure: {
      status: releaseConclusion.override_pressure_status,
      last_30_days_count: releaseConclusion.override_pressure_last_30_days,
    },
  });
  return {
    topline: legacySummary,
    audit_summary: auditSummary,
    release_conclusion: releaseConclusion,
    release_conclusion_schema: buildReleaseConclusionEnvelope(releaseConclusion),
    ...legacySummary,
    final_decision_summary: finalDecisionSummary,
    why_blocked_or_caution: whyBlockedOrCaution,
    blocking_or_warning_checks: blockingChecks,
    benchmark_readiness: benchmarkReadiness,
    benchmark_freshness: benchmarkFreshness,
    baseline_status: baselineStatus,
    approval_status: approvalStatus,
    latest_rehearsal_decision: latestRehearsalDecision,
    rollback_ready: Boolean(report?.snapshot_readiness?.ready),
    active_override_count: activeOverrides.length,
    constrained_override_count: constrainedOverrides.length,
    override_release: Boolean(report?.policy_override?.applied),
    override_pressure: overridePressure,
  };
}

/** @param {string} rootDir @param {LooseRecord} [options] */
function generateReleaseEvidence(rootDir, options = {}) {
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const policy = String(options.policy || 'standard');
  const rehearsal = readLatestReleaseRehearsal(resolvedRoot);
  const releaseReport = rehearsal?.release_report?.selected_policy?.id === policy
    ? rehearsal.release_report
    : runReleaseCheck(resolvedRoot, {
        policy,
        ...(options.strict !== undefined ? { strict: Boolean(options.strict) } : {}),
        ...(options.now ? { now: options.now } : {}),
        ...(options.overrideId ? { overrideId: options.overrideId } : {}),
        ...(options.baselineName ? { baselineName: options.baselineName } : {}),
      });
  const effectiveBaselineName = releaseReport?.benchmark_baseline_naming?.selected_name
    ? String(releaseReport.benchmark_baseline_naming.selected_name)
    : String(options.baselineName || 'release');
  const baseline = readBenchmarkBaseline(resolvedRoot, effectiveBaselineName);
  const approval = resolveApprovalStatus(resolvedRoot, effectiveBaselineName);
  const overrides = listPolicyOverrides(resolvedRoot);
  const events = readEvents(resolvedRoot, { limit: Number(options.eventLimit || 50) });
  const eventSummary = summarizeEvents(events);
  const summary = buildEvidenceSummary(releaseReport, rehearsal, baseline, approval, overrides);

  /** @type {EvidenceRecord[]} */
  const evidence = [
    createEvidence('release-report', 'release-evidence', {
      decision: releaseReport ? releaseReport.decision : 'unknown',
      policy: releaseReport?.selected_policy?.id || policy,
      checks: releaseReport && Array.isArray(releaseReport.checks) ? releaseReport.checks : [],
    }, { tags: ['release'] }),
    createEvidence('benchmark-baseline', 'release-evidence', baseline ? {
      status: 'present',
      name: baseline.name,
      created_at: baseline.created_at || null,
      baseline_summary: baseline.baseline_summary || null,
    } : {
      status: 'missing',
      name: effectiveBaselineName,
    }, { tags: ['release', 'baseline'] }),
    createEvidence('baseline-approval', 'release-evidence', approval || { status: 'missing' }, { tags: ['release', 'baseline'] }),
    createEvidence('latest-rehearsal', 'release-evidence', rehearsal ? {
      decision: rehearsal.decision || null,
      generated_at: rehearsal.generated_at || null,
    } : {
      status: 'missing',
    }, { tags: ['release', 'rehearsal'] }),
    createEvidence('policy-overrides', 'release-evidence', {
      total: overrides.length,
      active_count: overrides.filter((item) => item.status === 'approved').length,
      recent: overrides.slice(0, 5),
    }, { tags: ['release', 'override'] }),
    createEvidence('observability-summary', 'release-evidence', eventSummary, { tags: ['release', 'observability'] }),
  ];

  const gate = evaluateGate({
    gateId: 'release-evidence-gate',
    strict: Boolean(options.strict),
    evidence,
    rules: [
      {
        id: 'release.decision',
        title: 'Release decision is not blocked',
        /** @param {unknown[]} items */
        evaluate(items) {
          const match = /** @type {EvidenceRecord | undefined} */ (items.find((item) => item && typeof item === 'object' && /** @type {LooseRecord} */ (item).type === 'release-report'));
          if (!match) return { status: 'skip', detail: 'release report missing' };
          const c = /** @type {LooseRecord} */ (match.content || {});
          if (c.decision === 'blocked') return { status: 'fail', detail: 'release decision is blocked', matched_evidence_ids: [match.id] };
          if (c.decision === 'ready_with_override' || c.decision === 'caution') return { status: 'warn', detail: `release decision is ${c.decision}`, matched_evidence_ids: [match.id] };
          return { status: 'pass', detail: `release decision is ${c.decision}`, matched_evidence_ids: [match.id] };
        },
      },
      {
        id: 'release.baseline-approval',
        title: 'Baseline approval status',
        /** @param {unknown[]} items */
        evaluate(items) {
          const match = /** @type {EvidenceRecord | undefined} */ (items.find((item) => item && typeof item === 'object' && /** @type {LooseRecord} */ (item).type === 'baseline-approval'));
          if (!match) return { status: 'skip', detail: 'approval evidence missing' };
          const c = /** @type {LooseRecord} */ (match.content || {});
          if (c.status === 'approved' || c.ready) return { status: 'pass', detail: 'baseline approved', matched_evidence_ids: [match.id] };
          if (c.status === 'missing') return { status: 'warn', detail: 'baseline approval missing', matched_evidence_ids: [match.id] };
          return { status: 'warn', detail: `baseline approval status=${c.status || 'unknown'}`, matched_evidence_ids: [match.id] };
        },
      },
      {
        id: 'release.rehearsal',
        title: 'Latest rehearsal is healthy',
        /** @param {unknown[]} items */
        evaluate(items) {
          const match = /** @type {EvidenceRecord | undefined} */ (items.find((item) => item && typeof item === 'object' && /** @type {LooseRecord} */ (item).type === 'latest-rehearsal'));
          if (!match) return { status: 'skip', detail: 'rehearsal evidence missing' };
          const c = /** @type {LooseRecord} */ (match.content || {});
          if (!c.decision) return { status: 'warn', detail: 'latest rehearsal missing', matched_evidence_ids: [match.id] };
          if (c.decision === 'ready') return { status: 'pass', detail: 'latest rehearsal ready', matched_evidence_ids: [match.id] };
          return { status: 'warn', detail: `latest rehearsal decision=${c.decision}`, matched_evidence_ids: [match.id] };
        },
      },
    ],
  });

  return {
    schema_version: '1.4',
    generated_at: new Date().toISOString(),
    root_dir: resolvedRoot,
    summary,
    evidence_bundle: {
      schema_version: '1.0',
      gate,
      summary: summarizeEvidence(evidence),
      evidence,
    },
    release_report: releaseReport,
    benchmark_baseline: baseline ? { name: baseline.name, created_at: baseline.created_at || null, baseline_summary: baseline.baseline_summary || null } : null,
    baseline_approval: approval,
    latest_rehearsal: rehearsal,
    policy_overrides: {
      total: overrides.length,
      active: overrides.filter((item) => item.status === 'approved').map((item) => ({
        override_id: item.override_id,
        policy: item.policy && item.policy.id,
        expires_at: item.expires_at || null,
        allowed_checks: item.allowed_checks || [],
        constraints: item.constraints || null,
        usage_count: Array.isArray(item.usage) ? item.usage.length : 0,
        updated_at: item.updated_at || item.created_at || null,
      })),
      recent: overrides.slice(0, 5),
    },
    observability: { event_summary: eventSummary, recent_events: events.slice(0, 10) },
  };
}

module.exports = { buildOverridePressure, buildEvidenceSummary, generateReleaseEvidence, readLatestReleaseRehearsal, resolveRehearsalDir };
