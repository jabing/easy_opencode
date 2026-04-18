const fs = require('fs');
const path = require('path');
const { formatManagedInvocation } = require('../../cli/runtime-paths.js');
const { assessBenchmarkFeedback } = require('../benchmark/feedback.js');
const { detectProjectProfile } = require('../project-profile.js');

/** @typedef {{ category?: string | null, file?: string | null, line?: number | null, code?: string | number | null, message?: string | null }} FailureItem */
/** @typedef {{ kind?: string | null, code?: number | null, output_excerpt?: unknown[] | null, failures?: FailureItem[] | null }} RoundCheck */
/** @typedef {{ checks?: RoundCheck[] | null }} RunRound */
/** @typedef {{ run_id?: string | null, root_dir?: string | null, objective?: string | null, status?: string | null, rounds?: RunRound[] | null, latest_failures?: FailureItem[] | null, targets?: string[] | null }} CoderRun */
/** @typedef {{ plan_id?: string | null, coder_loop?: { run_id?: string | null } | null, safety?: { snapshot_id?: string | null } | null, profile?: any, selected_skill?: any, objective?: string | null }} LinkedPlan */
/** @typedef {{ current_failure_count: number, previous_failure_count: number, repeated_failure: boolean, regression_spike: boolean, high_blast_radius: boolean, interface_surface: boolean, env_issue: boolean, merge_conflict: boolean, dependency_issue: boolean, mostly_local_fix: boolean }} SignalSummary */
/** @typedef {{ action: string, confidence: number, reasons: string[] }} StrategyDecision */

function nowIso() {
  return new Date().toISOString();
}

/** @param {string} filePath */
function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {string | null | undefined} rootDir @param {string | null | undefined} runId @returns {LinkedPlan | null} */
function readLinkedPlan(rootDir, runId) {
  const root = path.resolve(rootDir || process.cwd());
  const latestPointer = /** @type {{ plan_id?: string | null } | null} */ (tryReadJson(path.join(root, '.opencode', 'implementation-plans', 'latest.json')));
  if (!latestPointer || !latestPointer.plan_id) return null;
  const plan = /** @type {LinkedPlan | null} */ (tryReadJson(path.join(root, '.opencode', 'implementation-plans', latestPointer.plan_id, 'plan.json')));
  if (!plan) return null;
  const linkedRunId = plan && plan.coder_loop ? plan.coder_loop.run_id : null;
  return linkedRunId === runId ? plan : null;
}

/** @param {RunRound | null | undefined} round */
function flattenOutput(round) {
  /** @type {string[]} */
  const lines = [];
  for (const check of (round && round.checks) || []) {
    for (const line of check.output_excerpt || []) {
      const text = String(line || '').trim();
      if (text) lines.push(text);
    }
  }
  return lines.join('\n');
}

/** @param {FailureItem[] | null | undefined} failures */
function buildFailureFingerprint(failures) {
  return (failures || [])
    .slice(0, 12)
    .map((item) => [item.category || '', item.file || '', item.line || '', item.code || '', item.message || ''].join('|'))
    .join('||');
}

/** @template T @param {T[] | null | undefined} items @param {(item: T) => string | null | undefined} keyFn */
function countBy(items, keyFn) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const item of items || []) {
    const key = keyFn(item) || 'unknown';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

/** @param {CoderRun} run */
function classifySignals(run) {
  const rounds = Array.isArray(run.rounds) ? run.rounds : [];
  const latestRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
  const prevRound = rounds.length > 1 ? rounds[rounds.length - 2] : null;
  const failures = Array.isArray(run.latest_failures) ? run.latest_failures : [];
  const output = flattenOutput(latestRound);
  const prevFingerprint = prevRound ? buildFailureFingerprint((prevRound.checks || []).flatMap((check) => check.failures || [])) : '';
  const currentFingerprint = buildFailureFingerprint(failures);
  const categoryCounts = countBy(failures, (item) => item.category || 'unknown');
  const fileCounts = countBy(failures.filter((item) => item.file), (item) => String(item.file || '').replace(/\\/g, '/'));
  const uniqueFiles = Object.keys(fileCounts).sort();
  const categories = Object.keys(categoryCounts).sort();
  const checks = ((latestRound && latestRound.checks) || []).filter((check) => Number(check.code || 0) !== 0);
  const failedCheckKinds = checks.map((check) => String(check.kind || 'unknown'));
  const outputText = String(output || '');
  const envIssue = /(command not found|is not recognized as an internal or external command|Cannot find module|MODULE_NOT_FOUND|No module named|ModuleNotFoundError|executable file not found|ENOENT|npm ERR! missing script|python: can't open file|pip: command not found|pytest: command not found|mvn: command not found|gradle: command not found|javac: command not found|go: command not found|tsc: command not found|node: not found)/i.test(outputText);
  const mergeConflict = /(<<<<<<<|=======|>>>>>>>|CONFLICT \(content\)|needs merge)/i.test(outputText);
  const dependencyIssue = /(lockfile|package-lock|pnpm-lock|yarn.lock|Could not resolve|resolution failed|dependency conflict|ERESOLVE)/i.test(outputText);
  const repeatedFailure = Boolean(prevFingerprint) && prevFingerprint === currentFingerprint && currentFingerprint.length > 0;
  const previousFailureCount = prevRound ? (prevRound.checks || []).flatMap((check) => check.failures || []).length : 0;
  const currentFailureCount = failures.length;
  const regressionSpike = previousFailureCount > 0 && currentFailureCount >= Math.max(previousFailureCount + 3, Math.ceil(previousFailureCount * 1.5));
  const highBlastRadius = uniqueFiles.length >= 6 || categories.length >= 4 || currentFailureCount >= 8 || failedCheckKinds.length >= 3;
  const interfaceSurface = uniqueFiles.some((file) => /(route|controller|handler|endpoint|api|schema|openapi|swagger|auth|security|migration|database|model|service)/i.test(file));
  const mostlyLocalFix = !envIssue && !mergeConflict && !highBlastRadius && uniqueFiles.length <= 3 && categories.every((name) => /^(type_error|lint_error|lint_warning|compile_error|test_failure|runtime_error)$/.test(name));
  return {
    analyzed_at: nowIso(),
    failing_checks: failedCheckKinds,
    category_counts: categoryCounts,
    file_counts: fileCounts,
    unique_files: uniqueFiles,
    current_failure_count: currentFailureCount,
    previous_failure_count: previousFailureCount,
    repeated_failure: repeatedFailure,
    regression_spike: regressionSpike,
    high_blast_radius: highBlastRadius,
    interface_surface: interfaceSurface,
    env_issue: envIssue,
    merge_conflict: mergeConflict,
    dependency_issue: dependencyIssue,
    mostly_local_fix: mostlyLocalFix,
    output_excerpt: outputText.split(/\r?\n/).filter(Boolean).slice(0, 12),
  };
}

/** @param {CoderRun} run @param {SignalSummary} signals @param {LinkedPlan | null} linkedPlan @param {any} benchmarkFeedback @returns {StrategyDecision} */
function determineStrategy(run, signals, linkedPlan, benchmarkFeedback) {
  /** @type {string[]} */
  const reasons = [];
  const hasSnapshot = Boolean(linkedPlan && linkedPlan.safety && linkedPlan.safety.snapshot_id);
  const failureCount = signals.current_failure_count;
  const benchmarkRiskLevel = benchmarkFeedback && benchmarkFeedback.risk_level ? benchmarkFeedback.risk_level : 'unknown';
  const benchmarkStrategyBias = benchmarkFeedback && benchmarkFeedback.strategy_bias ? benchmarkFeedback.strategy_bias : 'balanced';
  const benchmarkReviewGateRequired = Boolean(benchmarkFeedback && benchmarkFeedback.review_gate_required);

  if (benchmarkRiskLevel === 'high') reasons.push('benchmark history for this task bucket is currently high risk');
  else if (benchmarkRiskLevel === 'medium') reasons.push('benchmark history for this task bucket suggests mixed stability');

  if (run.status === 'green' || failureCount === 0) {
    reasons.push('all configured validation checks are currently green');
    if (benchmarkReviewGateRequired) reasons.push('historical benchmark risk still requires a structured review gate before merge');
    return { action: 'review_gate', confidence: benchmarkRiskLevel === 'high' ? 96 : 93, reasons };
  }
  if (signals.merge_conflict) {
    reasons.push('detected merge-conflict markers or conflict output in the latest failing round');
    return { action: 'manual_intervention_required', confidence: 96, reasons };
  }
  if (signals.env_issue || signals.dependency_issue) {
    reasons.push('latest failure output looks environmental or dependency-related rather than code-local');
    return { action: 'environment_fix_required', confidence: signals.dependency_issue ? 88 : 92, reasons };
  }
  if (signals.regression_spike && hasSnapshot) {
    reasons.push('latest round regressed sharply compared with the previous round');
    reasons.push('a safety snapshot is available for fast rollback');
    if (benchmarkRiskLevel !== 'low') reasons.push('historical benchmark risk makes rollback safer than another wide fix round');
    return { action: 'rollback_to_snapshot', confidence: benchmarkRiskLevel === 'high' ? 92 : 87, reasons };
  }
  if (signals.high_blast_radius && signals.repeated_failure && hasSnapshot) {
    reasons.push('the same failure fingerprint repeated across rounds with wide impact');
    reasons.push('rolling back is safer than piling on more edits');
    if (benchmarkRiskLevel !== 'low') reasons.push('historical instability strengthens the rollback recommendation');
    return { action: 'rollback_to_snapshot', confidence: benchmarkRiskLevel === 'high' ? 89 : 83, reasons };
  }
  if (signals.high_blast_radius || signals.interface_surface || signals.repeated_failure) {
    if (signals.high_blast_radius) reasons.push('the current failures span many files/categories/checks');
    if (signals.interface_surface) reasons.push('the changed surface touches API/auth/schema/service areas');
    if (signals.repeated_failure) reasons.push('the latest failure set repeated without meaningful movement');
    if (benchmarkStrategyBias === 'conservative') reasons.push('benchmark feedback recommends rebuilding context before continuing');
    return { action: 'rebuild_context', confidence: benchmarkRiskLevel === 'high' ? 86 : (signals.high_blast_radius ? 79 : 74), reasons };
  }
  if (signals.mostly_local_fix) {
    reasons.push('the failures look local to a small number of files and standard compile/test/lint categories');
    if (benchmarkRiskLevel === 'high') {
      reasons.push('but the surrounding task bucket is historically unstable, so rebuild context before another aggressive edit round');
      return { action: 'rebuild_context', confidence: 81, reasons };
    }
    if (benchmarkRiskLevel === 'medium') {
      reasons.push('continue fixing, but keep the next round smaller and expect a review gate before merge');
      return { action: 'continue_fix', confidence: 76, reasons };
    }
    return { action: 'continue_fix', confidence: 84, reasons };
  }
  reasons.push('the failure pattern is mixed but still looks repairable without starting over');
  if (benchmarkStrategyBias === 'conservative') {
    reasons.push('benchmark feedback prefers a more conservative rebuild over another blind retry');
    return { action: 'rebuild_context', confidence: 72, reasons };
  }
  return { action: 'continue_fix', confidence: benchmarkRiskLevel === 'medium' ? 63 : 67, reasons };
}

/** @param {CoderRun} run @param {LinkedPlan | null} linkedPlan @param {StrategyDecision} strategy @param {any} benchmarkFeedback */
function buildSuggestedCommands(run, linkedPlan, strategy, benchmarkFeedback) {
  const rootDir = path.resolve(run.root_dir || process.cwd());
  /** @type {string[]} */
  const commands = [];
  const objective = run.objective || 'continue task';
  const targets = Array.isArray(run.targets) ? run.targets.join(',') : '';

  commands.push(formatManagedInvocation('benchmark-feedback', ['report', '--root', rootDir, '--json'], { cwd: rootDir }));

  switch (strategy.action) {
    case 'review_gate':
      commands.push(formatManagedInvocation('review-gate', ['report', '--json'], { cwd: rootDir }));
      if (benchmarkFeedback && benchmarkFeedback.review_gate_required) {
        commands.push(formatManagedInvocation('review-gate', ['report', '--with-quality-gate', '--quality-mode', 'full', '--json'], { cwd: rootDir }));
      }
      break;
    case 'environment_fix_required':
      commands.push(formatManagedInvocation('env-check', [], { cwd: rootDir }));
      commands.push(formatManagedInvocation('runtime-detect', ['--json', '--root', rootDir], { cwd: rootDir }));
      break;
    case 'rollback_to_snapshot': {
      const snapshotId = linkedPlan && linkedPlan.safety ? linkedPlan.safety.snapshot_id : null;
      if (snapshotId) {
        commands.push(formatManagedInvocation('safe-apply', ['status', '--snapshot-id', snapshotId], { cwd: rootDir }));
        commands.push(formatManagedInvocation('safe-apply', ['rollback', '--snapshot-id', snapshotId, '--dry-run'], { cwd: rootDir }));
        commands.push(formatManagedInvocation('safe-apply', ['rollback', '--snapshot-id', snapshotId], { cwd: rootDir }));
      }
      commands.push(formatManagedInvocation('implement-task', ['run', '--objective', objective, '--root', rootDir], { cwd: rootDir }));
      break;
    }
    case 'rebuild_context':
      commands.push(formatManagedInvocation('coder-context', ['--objective', objective, '--root', rootDir, ...(targets ? ['--targets', targets] : [])], { cwd: rootDir }));
      commands.push(formatManagedInvocation('implement-task', ['run', '--objective', objective, '--root', rootDir, ...(targets ? ['--targets', targets] : [])], { cwd: rootDir }));
      if (benchmarkFeedback && benchmarkFeedback.review_gate_required) {
        commands.push(formatManagedInvocation('review-gate', ['report', '--with-quality-gate', '--quality-mode', 'full', '--json'], { cwd: rootDir }));
      }
      break;
    case 'manual_intervention_required':
      commands.push(formatManagedInvocation('code-review', ['inspect unresolved conflict or manual blocker'], { cwd: rootDir }));
      break;
    case 'continue_fix':
    default:
      commands.push(formatManagedInvocation('coder-loop', ['next-prompt', '--run-id', String(run.run_id || ''), '--root', rootDir], { cwd: rootDir }));
      commands.push(formatManagedInvocation('coder-loop', ['run', '--run-id', String(run.run_id || ''), '--root', rootDir, '--emit-prompt'], { cwd: rootDir }));
      if (benchmarkFeedback && benchmarkFeedback.review_gate_required) {
        commands.push(formatManagedInvocation('review-gate', ['report', '--with-quality-gate', '--quality-mode', 'full', '--json'], { cwd: rootDir }));
      }
      break;
  }
  return commands;
}

/** @param {CoderRun} run @param {LinkedPlan | null} linkedPlan */
function buildBenchmarkInput(run, linkedPlan) {
  const rootDir = path.resolve(run.root_dir || process.cwd());
  const profile = linkedPlan && linkedPlan.profile ? linkedPlan.profile : detectProjectProfile(rootDir);
  const selectedSkill = linkedPlan && linkedPlan.selected_skill ? linkedPlan.selected_skill : null;
  return {
    objective: run.objective || (linkedPlan ? linkedPlan.objective : null),
    runtime: profile && profile.runtime ? profile.runtime : 'unknown',
    framework: profile && profile.framework ? profile.framework : 'unknown',
    skill: selectedSkill && selectedSkill.dir ? selectedSkill.dir : null,
    task_family: selectedSkill && selectedSkill.task_family ? selectedSkill.task_family : null,
  };
}

/** @param {CoderRun} run @param {{ linkedPlan?: LinkedPlan | null, benchmarkFeedback?: any }} [options] */
function analyzeCoderRun(run, options = {}) {
  const linkedPlan = options.linkedPlan || readLinkedPlan(run.root_dir, run.run_id);
  const signals = classifySignals(run);
  const benchmarkFeedback = options.benchmarkFeedback || assessBenchmarkFeedback(path.resolve(run.root_dir || process.cwd()), buildBenchmarkInput(run, linkedPlan));
  const strategy = determineStrategy(run, signals, linkedPlan, benchmarkFeedback);
  return {
    schema_version: '1.0',
    analyzed_at: nowIso(),
    run_id: run.run_id,
    objective: run.objective,
    status: run.status,
    action: strategy.action,
    confidence: strategy.confidence,
    reasons: strategy.reasons,
    linked_plan_id: linkedPlan ? linkedPlan.plan_id : null,
    linked_snapshot_id: linkedPlan && linkedPlan.safety ? linkedPlan.safety.snapshot_id || null : null,
    benchmark_feedback: benchmarkFeedback,
    strategy_bias: benchmarkFeedback ? benchmarkFeedback.strategy_bias : 'balanced',
    review_gate_required: Boolean(benchmarkFeedback && benchmarkFeedback.review_gate_required),
    recommended_validation_mode: benchmarkFeedback ? benchmarkFeedback.recommended_validation_mode : 'standard',
    signals,
    suggested_commands: buildSuggestedCommands(run, linkedPlan, strategy, benchmarkFeedback),
  };
}

module.exports = {
  analyzeCoderRun,
  readLinkedPlan,
  buildFailureFingerprint,
};
