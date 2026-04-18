// @ts-nocheck
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { assessBenchmarkFeedback } = require('../benchmark/feedback.js');
const { assessSnapshotReadiness } = require('../project/git-state.js');
const { compareRuns } = require('../benchmark/analysis.js');
const { readBenchmarkRuns } = require('../../control-plane/observability/index.js');
const { readBenchmarkBaseline, compareBaselineToRun } = require('../benchmark/baselines.js');
const { resolveApprovalStatus } = require('../benchmark/baseline-approvals.js');
const { buildBaselineNameCandidates, buildCanonicalBaselineName, inferProfileHint } = require('../benchmark/baseline-naming.js');
const { detectProjectProfile } = require('../project-profile.js');
const { resolveReleasePolicy } = require('./policy.js');
const { matchOverrideToChecks, recordOverrideUsage, resolvePolicyOverride } = require('./policy-overrides.js');
const { buildReleaseConclusion, buildReleaseConclusionEnvelope } = require('./conclusion.js');

function readJsonFile(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }

function readPackageJson(rootDir) {
  const filePath = path.join(path.resolve(rootDir || process.cwd()), 'package.json');
  if (!fs.existsSync(filePath)) return null;
  try { return readJsonFile(filePath); } catch { return null; }
}

function hasPackageScript(rootDir, name) {
  const pkg = readPackageJson(rootDir);
  return Boolean(pkg && pkg.scripts && typeof pkg.scripts[name] === 'string' && pkg.scripts[name].trim());
}

function runNodeScript(scriptPath, args, rootDir) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd: rootDir, shell: false, windowsHide: true, encoding: 'utf8' });
  return { code: typeof result.status === 'number' ? result.status : 1, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
}

function runPackageScript(rootDir, scriptName) {
  const result = spawnSync('npm', ['run', scriptName, '--silent'], { cwd: rootDir, shell: false, windowsHide: true, encoding: 'utf8' });
  return { code: typeof result.status === 'number' ? result.status : 1, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
}

function summarizeOutput(output) {
  const text = String(output || '').trim();
  if (!text) return '';
  const line = text.split(/\r?\n/).find(Boolean) || '';
  return line.slice(0, 160);
}

function addCheck(checks, status, check, detail, extra = {}) { checks.push({ status, check, detail, ...extra }); }
function counts(checks) { const out = { pass: 0, fail: 0, warn: 0, skip: 0 }; for (const item of checks) out[item.status] = (out[item.status] || 0) + 1; return out; }
function computeDecision(checks, options = {}) {
  if (checks.some((item) => item.status === 'fail')) return 'blocked';
  if (checks.some((item) => item.status === 'warn')) return options.strict ? 'blocked' : 'caution';
  return 'ready';
}

function buildBenchmarkSummary(report) {
  if (!report) return null;
  return {
    policy: report.policy || null,
    risk_level: report.risk_level,
    risk_score: report.risk_score,
    confidence: report.confidence,
    run_count: report.data_window ? report.data_window.run_count : 0,
    coverage: report.coverage || null,
    freshness: report.freshness || null,
    trend_evidence: report.trend_evidence || null,
    release_readiness: report.release_readiness || null,
  };
}

function buildLatestBenchmarkComparison(rootDir) {
  const runs = readBenchmarkRuns(rootDir, { limit: 2 });
  if (runs.length < 2) return null;
  const comparison = compareRuns(runs[1], runs[0]);
  return { baseline_run_id: comparison.baseline_run_id, current_run_id: comparison.current_run_id, summary: comparison.summary };
}

function buildPolicy(options, benchmark, baseline, selectedPolicy) {
  const thresholds = benchmark && benchmark.release_readiness && benchmark.release_readiness.thresholds ? benchmark.release_readiness.thresholds : {};
  return {
    selected_policy: selectedPolicy ? { id: selectedPolicy.id, label: selectedPolicy.label } : null,
    strict_blocks_on_warn: Boolean(selectedPolicy && selectedPolicy.block_on_warn),
    require_release_readiness_ready: Boolean(selectedPolicy && selectedPolicy.block_on_warn),
    require_scope_coverage: selectedPolicy && selectedPolicy.benchmark ? selectedPolicy.benchmark.require_coverage : 'sufficient',
    require_latest_benchmark_non_regressing: true,
    require_benchmark_baseline_when_present: true,
    require_benchmark_baseline: Boolean(selectedPolicy && selectedPolicy.benchmark && selectedPolicy.benchmark.require_baseline),
    require_benchmark_approval: Boolean(selectedPolicy && selectedPolicy.benchmark && selectedPolicy.benchmark.require_approval),
    benchmark_baseline: baseline ? { name: baseline.name || null, run_id: baseline.baseline_summary ? baseline.baseline_summary.run_id : null } : null,
    benchmark_thresholds: {
      minimum_run_count: thresholds.minimum_run_count || (selectedPolicy && selectedPolicy.benchmark ? selectedPolicy.benchmark.minimum_run_count : 5),
      minimum_confidence: thresholds.minimum_confidence || (selectedPolicy && selectedPolicy.benchmark ? selectedPolicy.benchmark.minimum_confidence : 30),
      minimum_coverage_dimensions: thresholds.minimum_coverage_dimensions || 1,
      freshness: thresholds.freshness || (selectedPolicy && selectedPolicy.benchmark ? selectedPolicy.benchmark.freshness : null),
    },
  };
}

function inferLatestBenchmarkScope(rootDir) {
  const runs = readBenchmarkRuns(rootDir, { limit: 1 });
  const latest = runs[0];
  const first = latest && Array.isArray(latest.results) ? latest.results.find(Boolean) : null;
  return {
    runtime: first && first.detected ? first.detected.runtime || null : null,
    framework: first && first.detected ? first.detected.framework || null : null,
    task_family: first && first.task ? first.task.task_family || null : null,
    skill: first && first.task ? first.task.selected_skill || null : null,
  };
}

function resolveBenchmarkInput(rootDir, input = {}) {
  const profile = detectProjectProfile(rootDir);
  const inferred = inferLatestBenchmarkScope(rootDir);
  return {
    runtime: input.runtime || inferred.runtime || profile.runtime || 'unknown',
    framework: input.framework || inferred.framework || profile.framework || 'unknown',
    task_family: input.task_family || input.taskFamily || inferred.task_family || 'other',
    skill: input.skill || inferred.skill || null,
    objective: input.objective || null,
    profile,
  };
}

function isCoverageSatisfied(coverage, policy) {
  if (!coverage) return false;
  const requirement = policy && policy.benchmark ? policy.benchmark.require_coverage : 'sufficient';
  if (requirement === 'partial') return coverage.status === 'partial' || coverage.status === 'sufficient';
  return coverage.status === 'sufficient';
}

function runReleaseCheck(rootDir, options = {}) {
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const ownScriptsDir = path.resolve(__dirname, '../../../scripts');
  const qualityGateScript = path.join(ownScriptsDir, 'quality-gate.js');
  const reviewGateScript = path.join(ownScriptsDir, 'review-gate.js');
  const packageHygieneScript = path.join(ownScriptsDir, 'package-hygiene.js');
  const selectedPolicy = resolveReleasePolicy(options.policy || 'standard', { strict: Boolean(options.strict) });
  const checks = [];

  const quality = runNodeScript(qualityGateScript, ['--full', '--strict', '--json'], resolvedRoot);
  if (quality.code !== 0) addCheck(checks, 'fail', 'quality-gate', summarizeOutput(`${quality.stdout}\n${quality.stderr}`) || 'quality gate failed');
  else {
    const parsed = JSON.parse(quality.stdout || '{}');
    addCheck(checks, parsed.gate === 'PASS' ? 'pass' : 'fail', 'quality-gate', `gate=${parsed.gate} pass=${parsed.counts ? parsed.counts.pass : 0} fail=${parsed.counts ? parsed.counts.fail : 0} warn=${parsed.counts ? parsed.counts.warn : 0}`);
  }

  for (const scriptName of ['test']) {
    if (!hasPackageScript(resolvedRoot, scriptName)) { addCheck(checks, 'skip', `npm:${scriptName}`, 'script missing'); continue; }
    const result = runPackageScript(resolvedRoot, scriptName);
    addCheck(checks, result.code === 0 ? 'pass' : 'fail', `npm:${scriptName}`, result.code === 0 ? 'ok' : (summarizeOutput(`${result.stdout}\n${result.stderr}`) || 'script failed'));
  }

  const packageJsonPath = path.join(resolvedRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pack = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: resolvedRoot, shell: false, windowsHide: true, encoding: 'utf8' });
    addCheck(checks, (typeof pack.status === 'number' ? pack.status : 1) === 0 ? 'pass' : 'fail', 'npm:pack-dry-run', (typeof pack.status === 'number' ? pack.status : 1) === 0 ? 'ok' : (summarizeOutput(`${pack.stdout}\n${pack.stderr}`) || 'npm pack --dry-run failed'));
  } else addCheck(checks, 'skip', 'npm:pack-dry-run', 'package.json missing');

  if (fs.existsSync(path.join(resolvedRoot, 'commands')) && fs.existsSync(path.join(resolvedRoot, 'skills'))) {
    const hygiene = runNodeScript(packageHygieneScript, [], resolvedRoot);
    addCheck(checks, hygiene.code === 0 ? 'pass' : 'fail', 'package:hygiene', hygiene.code === 0 ? 'ok' : (summarizeOutput(`${hygiene.stdout}\n${hygiene.stderr}`) || 'package hygiene failed'));
  } else addCheck(checks, 'skip', 'package:hygiene', 'not applicable outside plugin workspace');

  const review = runNodeScript(reviewGateScript, ['report', '--with-quality-gate', '--quality-mode', 'full', '--no-plan', '--json'], resolvedRoot);
  if (review.code !== 0) addCheck(checks, 'fail', 'review-gate', summarizeOutput(`${review.stdout}\n${review.stderr}`) || 'review gate failed');
  else {
    const parsed = JSON.parse(review.stdout || '{}');
    const status = parsed.verdict === 'BLOCK' ? 'fail' : parsed.verdict === 'ACCEPT' ? 'pass' : 'warn';
    addCheck(checks, status, 'review-gate', `verdict=${parsed.verdict}`);
  }

  const benchmarkInput = resolveBenchmarkInput(resolvedRoot, options.benchmarkInput || {});
  const packageJson = readPackageJson(resolvedRoot);
  const baselineCandidates = options.baselineName
    ? [String(options.baselineName)]
    : buildBaselineNameCandidates(resolvedRoot, { policy: selectedPolicy.id, projectProfile: benchmarkInput.profile, packageJson });
  const benchmark = assessBenchmarkFeedback(resolvedRoot, { ...benchmarkInput, policy: selectedPolicy.id, now: options.now || null });
  const releaseReadiness = benchmark.release_readiness || { status: 'caution', reasons: ['release readiness unavailable'] };
  addCheck(checks, releaseReadiness.status === 'blocked' ? 'fail' : releaseReadiness.status === 'ready' ? 'pass' : 'warn', 'benchmark.release_readiness', `${releaseReadiness.status} (${(releaseReadiness.reasons || ['no details']).join('; ')})`);

  if (benchmark.coverage) addCheck(checks, isCoverageSatisfied(benchmark.coverage, selectedPolicy) ? 'pass' : 'warn', 'benchmark.scope_coverage', `${benchmark.coverage.status} matched=${benchmark.coverage.matched_count}/${benchmark.coverage.required_count} requirement=${selectedPolicy.benchmark.require_coverage}`);
  if (benchmark.freshness) addCheck(checks, benchmark.freshness.status === 'expired' ? 'fail' : benchmark.freshness.status === 'fresh' ? 'pass' : 'warn', 'benchmark.data_freshness', `${benchmark.freshness.status} age_days=${benchmark.freshness.age_days} policy=${selectedPolicy.id}`, { freshness: benchmark.freshness });

  const latestComparison = buildLatestBenchmarkComparison(resolvedRoot);
  const baseline = baselineCandidates.map((name) => readBenchmarkBaseline(resolvedRoot, name)).find(Boolean) || null;
  const baselineName = baseline && baseline.name ? baseline.name : baselineCandidates[0];
  if (!latestComparison) addCheck(checks, 'skip', 'benchmark.latest_comparison', 'need at least two benchmark runs');
  else {
    const s = latestComparison.summary || {};
    const regressed = Number(s.regressed || 0);
    const degraded = regressed > 0 || Number(s.pass_rate_delta || 0) < 0 || Number(s.task_success_rate_delta || 0) < 0 || Number(s.avg_failed_count_delta || 0) > 0;
    addCheck(checks, degraded ? 'warn' : 'pass', 'benchmark.latest_comparison', `regressed=${regressed} pass_delta=${s.pass_rate_delta} task_delta=${s.task_success_rate_delta} failed_delta=${s.avg_failed_count_delta}`, latestComparison);
  }

  let baselineApproval = null;
  if (!baseline) {
    if (selectedPolicy.benchmark.require_baseline) addCheck(checks, 'warn', 'benchmark.baseline_comparison', `baseline ${baselineName} required by policy=${selectedPolicy.id} but not configured`);
    else addCheck(checks, 'skip', 'benchmark.baseline_comparison', `baseline ${baselineName} not configured`);
    if (selectedPolicy.benchmark.require_approval) addCheck(checks, 'warn', 'benchmark.baseline_approval', `baseline approval for ${baselineName} required by policy=${selectedPolicy.id} but baseline is missing`);
    else addCheck(checks, 'skip', 'benchmark.baseline_approval', `baseline approval for ${baselineName} not applicable without baseline`);
  } else {
    const baselineComparison = compareBaselineToRun(resolvedRoot, baselineName, null, { latest: true });
    const s = baselineComparison.comparison ? baselineComparison.comparison.summary || {} : {};
    const regressed = Number(s.regressed || 0);
    const degraded = regressed > 0 || Number(s.pass_rate_delta || 0) < 0 || Number(s.task_success_rate_delta || 0) < 0 || Number(s.avg_failed_count_delta || 0) > 0;
    addCheck(checks, degraded ? 'warn' : 'pass', 'benchmark.baseline_comparison', `baseline=${baselineName} regressed=${regressed} pass_delta=${s.pass_rate_delta} task_delta=${s.task_success_rate_delta} failed_delta=${s.avg_failed_count_delta}`, { baseline_name: baselineName, comparison: baselineComparison.comparison });
    baselineApproval = resolveApprovalStatus(resolvedRoot, baselineName);
    if (selectedPolicy.benchmark.require_approval) {
      addCheck(checks, baselineApproval.ready ? 'pass' : 'warn', 'benchmark.baseline_approval', baselineApproval.ready ? `baseline=${baselineName} approved for run=${baselineApproval.baseline_run_id}` : `${baselineApproval.reason} (policy=${selectedPolicy.id})`, { baseline_name: baselineName, approval: baselineApproval.approval || null, approval_status: baselineApproval.status });
    } else {
      addCheck(checks, baselineApproval.ready ? 'pass' : 'skip', 'benchmark.baseline_approval', baselineApproval.ready ? `baseline=${baselineName} approved for run=${baselineApproval.baseline_run_id}` : `baseline approval optional under policy=${selectedPolicy.id}`, { baseline_name: baselineName, approval_status: baselineApproval.status });
    }
  }

  const snapshot = assessSnapshotReadiness(resolvedRoot, { label: options.snapshotLabel || 'release-check' });
  addCheck(checks, snapshot.ready ? 'pass' : snapshot.blocking ? 'fail' : 'warn', 'snapshot.readiness', snapshot.reason || snapshot.status, { snapshot_id: snapshot.snapshot_id || null });

  const summary = counts(checks);
  const decisionBeforeOverride = computeDecision(checks, { strict: Boolean(selectedPolicy.block_on_warn) });
  let decision = decisionBeforeOverride;
  let policyOverride = null;
  if (options.overrideId) {
    const resolvedOverride = resolvePolicyOverride(resolvedRoot, options.overrideId, { policy: selectedPolicy.id, now: options.now || null });
    const matched = matchOverrideToChecks(resolvedOverride, checks);
    policyOverride = {
      override_id: options.overrideId,
      status: resolvedOverride.status,
      ready: Boolean(resolvedOverride.ready),
      reason: resolvedOverride.reason || null,
      allowed_checks: matched.allowed_checks || [],
      matched_checks: matched.matched_checks || [],
      missing_checks: matched.missing_checks || [],
      blocked_checks: matched.blocked_checks || [],
      disallowed_checks: matched.disallowed_checks || [],
      covers_all: Boolean(matched.covers_all),
      applied: false,
    };
    if (resolvedOverride.ready && matched.covers_all && decisionBeforeOverride !== 'ready') {
      decision = 'ready_with_override';
      policyOverride.applied = true;
      policyOverride.decision_before = decisionBeforeOverride;
      policyOverride.decision_after = decision;
      recordOverrideUsage(resolvedRoot, options.overrideId, {
        decision_before: decisionBeforeOverride,
        decision_after: decision,
        matched_checks: matched.matched_checks,
        blocked_checks: matched.blocked_checks,
        release_checks: checks.filter((item) => item.status === 'fail' || item.status === 'warn').map((item) => item.check),
      });
    }
  }
  const releaseConclusion = buildReleaseConclusion({
    release_decision: decision,
    ready_state: decision,
    release_reason: checks
      .filter((item) => item.status === 'fail' || item.status === 'warn')
      .map((item) => `${item.check}: ${item.detail}`)
      .join(' | ') || 'all required checks satisfied',
    release_policy: selectedPolicy.id,
    override_used: Boolean(policyOverride && policyOverride.applied),
    baseline_approved: Boolean(baselineApproval && baselineApproval.ready),
    benchmark_fresh_enough: Boolean(benchmark && benchmark.freshness && (benchmark.freshness.status === 'fresh' || benchmark.freshness.status === 'aging')),
    rollback_ready: Boolean(snapshot && snapshot.ready),
    canonical_baseline_name: buildCanonicalBaselineName(resolvedRoot, { policy: selectedPolicy.id, projectProfile: benchmarkInput.profile, packageJson }),
    selected_baseline_name: baseline ? (baseline.name || baselineName) : baselineName,
    override_pressure_status: 'unknown',
    override_pressure_last_30_days: 0,
  });
  return {
    schema_version: '1.4',
    generated_at: new Date().toISOString(),
    root_dir: resolvedRoot,
    strict: Boolean(options.strict),
    selected_policy: { id: selectedPolicy.id, label: selectedPolicy.label },
    policy: buildPolicy({ ...options, baselineName }, benchmark, baseline, selectedPolicy),
    decision,
    decision_before_override: decisionBeforeOverride,
    release_conclusion: releaseConclusion,
    release_conclusion_schema: buildReleaseConclusionEnvelope(releaseConclusion),
    counts: summary,
    checks,
    benchmark_scope: { runtime: benchmarkInput.runtime || 'unknown', framework: benchmarkInput.framework || 'unknown', task_family: benchmarkInput.task_family || 'other', skill: benchmarkInput.skill || null },
    benchmark_feedback: buildBenchmarkSummary(benchmark),
    latest_benchmark_comparison: latestComparison,
    benchmark_baseline: baseline ? { name: baseline.name || baselineName, created_at: baseline.created_at || null, baseline_summary: baseline.baseline_summary || null } : null,
    benchmark_baseline_naming: {
      recommended_name: buildCanonicalBaselineName(resolvedRoot, { policy: selectedPolicy.id, projectProfile: benchmarkInput.profile, packageJson }),
      candidates: baselineCandidates,
      selected_name: baseline ? (baseline.name || baselineName) : baselineName,
      profile_hint: inferProfileHint(resolvedRoot, { policy: selectedPolicy.id, projectProfile: benchmarkInput.profile, packageJson }),
    },
    baseline_approval: baselineApproval,
    snapshot_readiness: snapshot,
    policy_override: policyOverride,
  };
}

module.exports = { buildLatestBenchmarkComparison, computeDecision, hasPackageScript, readPackageJson, runReleaseCheck };
