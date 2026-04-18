const { readBenchmarkRuns } = require('../../control-plane/observability/index.js');
const { buildTrendReport } = require('./trends.js');
const { resolveTaskFamily } = require('../skills/taxonomy.js');
const { formatManagedInvocation } = require('../../cli/runtime-paths.js');
const { resolveReleasePolicy } = require('../release/policy.js');
const { buildBenchmarkFreshness } = require('./freshness.js');

/** @typedef {{ objective?: string | null, runtime?: string | null, framework?: string | null, skill?: string | null, task_family?: string | null }} FeedbackScope */
/** @typedef {{ label: string, weight: number, matched: boolean, score: number, confidence: number, reasons: string[], bucket: any }} BucketEvaluation */

/** @param {unknown} value @param {string | null} [fallback] @returns {string | null} */
function normalizeToken(value, fallback = null) {
  const token = String(value || '').trim();
  return token || fallback;
}
function nowIso() { return new Date().toISOString(); }
/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
/** @param {unknown} value @returns {string | Date | undefined} */
function normalizeNow(value) {
  return value instanceof Date || typeof value === 'string' ? value : undefined;
}
/** @param {string} groupBy @param {FeedbackScope} scope */
function buildKey(groupBy, scope) {
  if (groupBy === 'runtime-framework') return `${scope.runtime || 'unknown'}:${scope.framework || 'unknown'}`;
  if (groupBy === 'skill-family') return scope.task_family || 'other';
  if (groupBy === 'skill') return scope.skill || 'unknown';
  return null;
}
/** @param {any} report @param {string | null} key */
function pickBucket(report, key) {
  if (!report || !Array.isArray(report.buckets) || !key) return null;
  return report.buckets.find((/** @type {any} */ bucket) => bucket.bucket_key === key) || null;
}
/** @param {any} bucket @param {string} label @param {number} weight @returns {BucketEvaluation} */
function evaluateBucket(bucket, label, weight) {
  if (!bucket) return { label, weight, matched: false, score: 0, confidence: 0, reasons: [`no ${label} benchmark history`], bucket: null };
  const latest = bucket.latest || {};
  let score = 0;
  let confidence = Math.min(45, Number(bucket.point_count || 0) * 10);
  /** @type {string[]} */
  const reasons = [];
  if (bucket.direction === 'regressing') { score += 4; reasons.push(`${label} trend is regressing`); }
  else if (bucket.direction === 'mixed') { score += 2; reasons.push(`${label} trend is mixed`); }
  else if (bucket.direction === 'improving') { score -= 1; reasons.push(`${label} trend is improving`); }
  else if (bucket.direction === 'stable') { reasons.push(`${label} trend is stable`); }
  if (latest.pass_rate !== null && latest.pass_rate !== undefined) {
    if (Number(latest.pass_rate) < 70) { score += 3; reasons.push(`${label} pass rate is low (${latest.pass_rate}%)`); }
    else if (Number(latest.pass_rate) < 85) { score += 1; reasons.push(`${label} pass rate is middling (${latest.pass_rate}%)`); }
  }
  if (latest.task_success_rate !== null && latest.task_success_rate !== undefined) {
    if (Number(latest.task_success_rate) < 70) { score += 3; reasons.push(`${label} task success is low (${latest.task_success_rate}%)`); }
    else if (Number(latest.task_success_rate) < 85) { score += 1; reasons.push(`${label} task success is middling (${latest.task_success_rate}%)`); }
  }
  if (latest.avg_failed_count !== null && latest.avg_failed_count !== undefined && Number(latest.avg_failed_count) > 1) { score += 1; reasons.push(`${label} average failed count is elevated (${latest.avg_failed_count})`); }
  if (Number(bucket.point_count || 0) < 2) { confidence = Math.max(10, confidence - 10); reasons.push(`${label} benchmark history is shallow`); }
  if ((bucket.stability && Number(bucket.stability.pass_rate_range || 0) > 25) || (bucket.stability && Number(bucket.stability.avg_failed_count_range || 0) > 1.5)) { score += 1; reasons.push(`${label} results are volatile`); }
  return { label, weight, matched: true, score, confidence, reasons, bucket };
}
/** @param {number} score */
function scoreToLevel(score) { if (score >= 7) return 'high'; if (score >= 4) return 'medium'; return 'low'; }
/** @param {FeedbackScope} scope */
function requiredCoverageDimensions(scope) {
  const required = ['runtime_framework'];
  if (scope.task_family && scope.task_family !== 'other') required.push('task_family');
  if (scope.skill) required.push('skill');
  return required;
}
/** @param {FeedbackScope} scope @param {BucketEvaluation[]} evaluations */
function buildCoverage(scope, evaluations) {
  /** @type {Record<string, BucketEvaluation | null>} */
  const byDimension = { runtime_framework: evaluations[0] || null, task_family: evaluations[1] || null, skill: evaluations[2] || null };
  const requiredDimensions = requiredCoverageDimensions(scope);
  const matchedDimensions = requiredDimensions.filter((dimension) => Boolean(byDimension[dimension] && byDimension[dimension].matched));
  const missingDimensions = requiredDimensions.filter((dimension) => !matchedDimensions.includes(dimension));
  const status = matchedDimensions.length === 0 ? 'missing' : missingDimensions.length === 0 ? 'sufficient' : 'partial';
  return { status, required_dimensions: requiredDimensions, matched_dimensions: matchedDimensions, missing_dimensions: missingDimensions, required_count: requiredDimensions.length, matched_count: matchedDimensions.length, coverage_score: requiredDimensions.length === 0 ? 100 : Number(((matchedDimensions.length / requiredDimensions.length) * 100).toFixed(2)) };
}
/** @param {unknown[] | null | undefined} directions */
function computeOverallDirection(directions) {
  const normalized = Array.isArray(directions) ? directions.filter(Boolean).map((item) => String(item)) : [];
  if (normalized.length === 0) return 'unknown';
  if (normalized.includes('regressing')) return 'regressing';
  if (normalized.includes('mixed')) return 'mixed';
  if (normalized.every((item) => item === 'improving')) return 'improving';
  if (normalized.every((item) => item === 'stable')) return 'stable';
  if (normalized.every((item) => item === 'insufficient_data')) return 'insufficient_data';
  if (normalized.some((item) => item === 'improving')) return 'mixed';
  return normalized[0] || 'unknown';
}
/** @param {BucketEvaluation[]} evaluations */
function buildTrendEvidence(evaluations) {
  const matched = evaluations.filter((entry) => entry && entry.matched && entry.bucket).map((entry) => ({ label: entry.label, direction: entry.bucket.direction || 'unknown', point_count: Number(entry.bucket.point_count || 0), latest_pass_rate: entry.bucket.latest ? entry.bucket.latest.pass_rate : null, latest_task_success_rate: entry.bucket.latest ? entry.bucket.latest.task_success_rate : null, latest_completed_at: entry.bucket.latest ? entry.bucket.latest.completed_at || null : null }));
  return { matched_count: matched.length, overall_direction: computeOverallDirection(matched.map((entry) => entry.direction)), buckets: matched };
}
/** @param {any} coverage @param {any} policy */
function isCoverageSatisfied(coverage, policy) {
  const requirement = policy && policy.benchmark ? policy.benchmark.require_coverage : 'sufficient';
  if (!coverage) return false;
  if (requirement === 'partial') return coverage.status === 'partial' || coverage.status === 'sufficient';
  return coverage.status === 'sufficient';
}
/** @param {any} report @param {any} policy */
function buildReleaseReadiness(report, policy) {
  const runCount = report && report.data_window ? Number(report.data_window.run_count || 0) : 0;
  const confidence = Number((report && report.confidence) || 0);
  const riskLevel = report && report.risk_level ? report.risk_level : 'unknown';
  const coverage = report && report.coverage ? report.coverage : { status: 'missing', missing_dimensions: ['runtime_framework'], matched_count: 0, required_count: 1 };
  const trendEvidence = report && report.trend_evidence ? report.trend_evidence : { overall_direction: 'unknown', matched_count: 0 };
  const freshness = report && report.freshness ? report.freshness : { status: 'missing' };
  /** @type {string[]} */
  const reasons = [];
  let status = 'ready';
  const minimumRunCount = Number(policy && policy.benchmark ? policy.benchmark.minimum_run_count : 5);
  const minimumConfidence = Number(policy && policy.benchmark ? policy.benchmark.minimum_confidence : 30);
  if (riskLevel === 'high') { status = 'blocked'; reasons.push('benchmark risk is high for this release scope'); }
  else if (riskLevel === 'unknown') { status = 'caution'; reasons.push('benchmark history is unavailable'); }
  else if (riskLevel === 'medium') { status = 'caution'; reasons.push('benchmark risk is medium; use extra review before release'); }
  if (runCount < minimumRunCount) { if (status !== 'blocked') status = 'caution'; reasons.push(`benchmark sample size is shallow (${runCount}/${minimumRunCount} runs)`); }
  if (confidence < minimumConfidence) { if (status !== 'blocked') status = 'caution'; reasons.push(`benchmark confidence is low (${confidence}/${minimumConfidence})`); }
  if (!isCoverageSatisfied(coverage, policy)) { if (status !== 'blocked') status = 'caution'; if (coverage.status === 'missing') reasons.push('benchmark scope coverage is missing for the requested release scope'); else reasons.push(`benchmark scope coverage is partial (missing: ${coverage.missing_dimensions.join(', ')})`); }
  if (freshness.status === 'aging') { if (status !== 'blocked') status = 'caution'; reasons.push(`benchmark evidence is aging (${freshness.age_days} days old)`); }
  else if (freshness.status === 'stale') { if (status !== 'blocked') status = 'caution'; reasons.push(`benchmark evidence is stale (${freshness.age_days} days old)`); }
  else if (freshness.status === 'expired') { status = 'blocked'; reasons.push(`benchmark evidence is expired (${freshness.age_days} days old)`); }
  else if (freshness.status === 'missing') { if (status !== 'blocked') status = 'caution'; reasons.push('benchmark freshness cannot be established'); }
  if (trendEvidence.overall_direction === 'regressing') { if (status !== 'blocked') status = 'caution'; reasons.push('matched benchmark trends are regressing for this release scope'); }
  else if (trendEvidence.overall_direction === 'mixed') { if (status !== 'blocked') status = 'caution'; reasons.push('matched benchmark trends are mixed for this release scope'); }
  if (reasons.length === 0) reasons.push('benchmark history is sufficient for release gating');
  return { status, reasons, thresholds: { policy: policy ? { id: policy.id, label: policy.label } : null, minimum_run_count: minimumRunCount, minimum_confidence: minimumConfidence, minimum_coverage_dimensions: coverage.required_count, coverage_requirement: policy && policy.benchmark ? policy.benchmark.require_coverage : 'sufficient', freshness: freshness.thresholds || null, observed_run_count: runCount, observed_confidence: confidence, observed_coverage_status: coverage.status, observed_matched_dimensions: coverage.matched_count, observed_trend_direction: trendEvidence.overall_direction, observed_freshness_status: freshness.status, observed_freshness_age_days: freshness.age_days, risk_level: riskLevel } };
}
/** @param {FeedbackScope} scope @param {string} riskLevel @param {string} rootDir @param {{ id: string }} policy */
function buildCommands(scope, riskLevel, rootDir, policy) {
  const commands = [
    formatManagedInvocation('benchmark-feedback', ['report', '--root', rootDir, '--policy', policy.id, '--json'], { cwd: rootDir }),
    formatManagedInvocation('benchmark-suite', ['trend', '--group-by', 'runtime-framework', '--json'], { cwd: rootDir }),
    formatManagedInvocation('benchmark-suite', ['trend', '--group-by', 'skill-family', '--json'], { cwd: rootDir }),
    formatManagedInvocation('benchmark-suite', ['freshness', '--policy', policy.id, '--json'], { cwd: rootDir }),
  ];
  if (scope.skill) commands.push(formatManagedInvocation('benchmark-suite', ['trend', '--group-by', 'skill', '--json'], { cwd: rootDir }));
  if (riskLevel !== 'low') commands.push(formatManagedInvocation('review-gate', ['report', '--with-quality-gate', '--quality-mode', 'full', '--json'], { cwd: rootDir }));
  return commands;
}
/** @param {string} rootDir @param {{ policy?: string, release_policy?: string, strict?: boolean, objective?: unknown, runtime?: unknown, framework?: unknown, skill?: unknown, task_family?: unknown, limit?: unknown, now?: unknown }} [input] */
function assessBenchmarkFeedback(rootDir, input = {}) {
  const policy = resolveReleasePolicy(input.policy || input.release_policy || 'standard', { strict: Boolean(input.strict) });
  /** @type {FeedbackScope} */
  const scope = {
    objective: normalizeToken(input.objective, null),
    runtime: normalizeToken(input.runtime, 'unknown'),
    framework: normalizeToken(input.framework, 'unknown'),
    skill: normalizeToken(input.skill, null),
    task_family: normalizeToken(input.task_family || resolveTaskFamily(input.skill || input.task_family || input), 'other'),
  };
  const limit = Math.max(1, Number(input.limit || 10));
  const runs = readBenchmarkRuns(rootDir, { limit });
  const nowValue = normalizeNow(input.now);
  if (runs.length === 0) {
    const required = requiredCoverageDimensions(scope);
    const emptyReport = /** @type {any} */ ({ assessed_at: nowIso(), scope, policy: { id: policy.id, label: policy.label }, data_window: { run_count: 0, limit }, risk_score: 0, risk_level: 'unknown', confidence: 0, strategy_bias: 'balanced', recommended_validation_mode: 'standard', recommended_action: 'implementation_first', review_gate_required: false, reasons: ['no benchmark history available'], coverage: { status: 'missing', required_dimensions: required, matched_dimensions: [], missing_dimensions: required, required_count: required.length, matched_count: 0, coverage_score: 0 }, freshness: buildBenchmarkFreshness(nowValue !== undefined ? { runs, policy: policy.id, now: nowValue } : { runs, policy: policy.id }), trend_evidence: { matched_count: 0, overall_direction: 'unknown', buckets: [] }, matched_buckets: {}, commands: buildCommands(scope, 'low', rootDir, policy) });
    emptyReport.release_readiness = buildReleaseReadiness(emptyReport, policy);
    return emptyReport;
  }
  const runtimeFrameworkReport = buildTrendReport(runs, { groupBy: 'runtime-framework', limit });
  const skillFamilyReport = buildTrendReport(runs, { groupBy: 'skill-family', limit });
  const skillReport = scope.skill ? buildTrendReport(runs, { groupBy: 'skill', limit }) : null;
  /** @type {BucketEvaluation[]} */
  const evaluations = [evaluateBucket(pickBucket(runtimeFrameworkReport, buildKey('runtime-framework', scope)), 'runtime/framework', 1.0), evaluateBucket(pickBucket(skillFamilyReport, buildKey('skill-family', scope)), 'task family', 1.25)];
  if (scope.skill) evaluations.push(evaluateBucket(pickBucket(skillReport, buildKey('skill', scope)), 'selected skill', 1.5));
  const weightedScore = evaluations.reduce((sum, entry) => sum + (entry.score * entry.weight), 0);
  const rawConfidence = evaluations.filter((entry) => entry.matched).reduce((sum, entry) => sum + entry.confidence, 0);
  const riskScore = Number(clamp(weightedScore, 0, 10).toFixed(2));
  const riskLevel = scoreToLevel(riskScore);
  const confidence = Number(clamp(rawConfidence / Math.max(evaluations.length, 1), 0, 100).toFixed(2));
  const reasons = evaluations.flatMap((entry) => entry.reasons);
  const coverage = buildCoverage(scope, evaluations);
  const trendEvidence = buildTrendEvidence(evaluations);
  const freshness = buildBenchmarkFreshness(nowValue !== undefined ? { runs, evaluations, policy: policy.id, now: nowValue } : { runs, evaluations, policy: policy.id });
  let strategyBias = 'balanced';
  let recommendedValidationMode = 'standard';
  let recommendedAction = 'implementation_first';
  let reviewGateRequired = false;
  if (riskLevel === 'high') { strategyBias = 'conservative'; recommendedValidationMode = 'full'; recommendedAction = 'small_batches_with_review_gate'; reviewGateRequired = true; }
  else if (riskLevel === 'medium') { strategyBias = 'balanced'; recommendedValidationMode = 'standard'; recommendedAction = 'implementation_then_review_gate'; reviewGateRequired = true; }
  else if (riskLevel === 'low' && evaluations.some((entry) => entry.bucket && entry.bucket.direction === 'improving')) { strategyBias = 'accelerated'; recommendedValidationMode = 'fast'; recommendedAction = 'implementation_first'; }
  const runtimeEvaluation = evaluations[0] || evaluateBucket(null, 'runtime/framework', 1.0);
  const familyEvaluation = evaluations[1] || evaluateBucket(null, 'task family', 1.25);
  const skillEvaluation = evaluations[2] || null;
  const report = /** @type {any} */ ({ assessed_at: nowIso(), scope, policy: { id: policy.id, label: policy.label }, data_window: { run_count: runs.length, limit }, risk_score: riskScore, risk_level: riskLevel, confidence, strategy_bias: strategyBias, recommended_validation_mode: recommendedValidationMode, recommended_action: recommendedAction, review_gate_required: reviewGateRequired, reasons, coverage, freshness, trend_evidence: trendEvidence, matched_buckets: { runtime_framework: runtimeEvaluation.bucket, task_family: familyEvaluation.bucket, skill: scope.skill && skillEvaluation ? skillEvaluation.bucket : null }, commands: buildCommands(scope, riskLevel, rootDir, policy) });
  report.release_readiness = buildReleaseReadiness(report, policy);
  return report;
}
module.exports = { assessBenchmarkFeedback, buildCoverage, buildReleaseReadiness, buildTrendEvidence };
