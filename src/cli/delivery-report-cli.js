#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readLatestPlanId } = require('../control-plane/orchestrator/memory.js');
const { formatManagedInvocation } = require('../cli/runtime-paths.js');
const { appendEvent } = require('../control-plane/observability/index.js');
const { deriveDeliveryAdvice } = require('../core/delivery/advice.js');
const { buildFeatureDeliverySummary } = require('../core/feature/delivery.js');
const { buildFeatureAcceptanceSummary } = require('../core/feature/acceptance.js');
const { toAdviceMarkdown, toHandoff, toMarkdown, toPrBody } = require('../core/delivery/report-renderers.js');
const { assertNamedContract } = require('../shared/contracts.js');

/** @typedef {{ _: string[], [key: string]: string | boolean | string[] | undefined }} DeliveryReportCliOptions */

/** @param {string} value */
function printLine(value) {
  process.stdout.write(`${value}
`);
}

/** @param {string[]} argv @returns {DeliveryReportCliOptions} */
function parseArgs(argv) {
  /** @type {DeliveryReportCliOptions} */
  const opts = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (typeof token !== 'string') continue;
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      opts[key] = true;
      continue;
    }
    opts[key] = next;
    i += 1;
  }
  return opts;
}

function usage() {
  printLine('Usage:');
  printLine(`  ${formatManagedInvocation('delivery-report', ['report'])}`);
  printLine(`  ${formatManagedInvocation('delivery-report', ['report', '--json'])}`);
  printLine(`  ${formatManagedInvocation('delivery-report', ['report', '--plan-id', '<plan-id>'])}`);
  printLine(`  ${formatManagedInvocation('delivery-report', ['pr-body'])}`);
  printLine(`  ${formatManagedInvocation('delivery-report', ['handoff'])}`);
  printLine(`  ${formatManagedInvocation('delivery-report', ['advice'])}`);
}

/** @param {string} dir */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** @param {string} filePath */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** @param {string} filePath */
function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return readJson(filePath);
  } catch {
    return null;
  }
}

/** @param {string} rootDir @param {string | null | undefined} planId */
function resolvePlan(rootDir, planId) {
  const resolved = planId || readLatestPlanId(rootDir);
  if (!resolved) return null;
  const filePath = path.join(rootDir, '.opencode', 'implementation-plans', resolved, 'plan.json');
  return tryReadJson(filePath);
}

/** @param {string} rootDir @param {any} plan */
function resolveCoderRun(rootDir, plan) {
  const runId = plan && plan.coder_loop ? plan.coder_loop.run_id : null;
  if (!runId) return null;
  return tryReadJson(path.join(rootDir, '.opencode', 'coder-loop', `${runId}.json`));
}

/** @param {string} rootDir */
function resolveReviewGate(rootDir) {
  return tryReadJson(path.join(rootDir, '.opencode', 'reviews', 'merge-gate', 'latest.json'));
}

/** @param {string} rootDir @param {string[]} args */
function runGit(rootDir, args) {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  return String(result.stdout || '').trim();
}

/** @param {string} rootDir */
function gitSummary(rootDir) {
  const branch = runGit(rootDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = runGit(rootDir, ['rev-parse', '--short', 'HEAD']);
  const status = runGit(rootDir, ['status', '--short', '--untracked-files=all']) || '';
  const statusLines = status ? status.split(/\r?\n/).filter(Boolean) : [];
  const staged = runGit(rootDir, ['diff', '--cached', '--name-only']) || '';
  const unstaged = runGit(rootDir, ['diff', '--name-only']) || '';
  const stat = runGit(rootDir, ['diff', '--stat']) || '';
  const untracked = statusLines
    .filter((line) => /^\?\?\s+/.test(line))
    .map((line) => line.replace(/^\?\?\s+/, '').trim())
    .filter(Boolean);
  const changedFiles = Array.from(new Set([...staged.split(/\r?\n/), ...unstaged.split(/\r?\n/), ...untracked]
    .filter(Boolean)
    .filter((item) => !String(item).startsWith('.opencode/'))));
  return {
    branch,
    head,
    dirty: Boolean(status),
    status_lines: statusLines,
    changed_files: changedFiles,
    diff_stat: stat ? stat.split(/\r?\n/).filter(Boolean) : [],
  };
}

/** @param {any} run */
function compactChecks(run) {
  if (!run || !Array.isArray(run.rounds) || run.rounds.length === 0) return [];
  const latest = run.rounds[run.rounds.length - 1];
  return (latest.checks || []).map((/** @type {any} */ check) => ({
    kind: check.kind,
    code: check.code,
    command: check.command,
  }));
}

/** @param {any} plan @param {any} review @param {any} reportFeedback */
function buildRiskPosture(plan, review, reportFeedback) {
  const benchmark = reportFeedback || (plan && plan.benchmark_feedback) || null;
  const execution = (plan && plan.execution_policy) || null;
  const scaffold = (plan && (plan.scaffold_policy || (plan.scaffold && plan.scaffold.scaffold_policy))) || null;
  const riskLevel = benchmark ? benchmark.risk_level : 'unknown';
  const strategyBias = execution && execution.strategy_bias ? execution.strategy_bias : (benchmark ? benchmark.strategy_bias : 'balanced');
  const validationMode = execution && execution.validation_mode ? execution.validation_mode : (benchmark ? benchmark.recommended_validation_mode : 'standard');
  let posture = 'standard';
  let summary = 'Use the normal implementation, validation, and merge workflow.';
  if (riskLevel === 'high' || strategyBias === 'conservative') {
    posture = 'conservative';
    summary = 'Use smaller change batches, stronger validation, and explicit merge scrutiny before delivery.';
  } else if (strategyBias === 'accelerated' && riskLevel === 'low') {
    posture = 'accelerated';
    summary = 'This task family is currently stable enough for a lighter-weight implementation and delivery path.';
  }
  if (review && review.verdict === 'BLOCK') {
    summary = 'Merge is currently blocked; fix blockers before preparing final delivery artifacts.';
  } else if (review && review.verdict === 'ACCEPT_WITH_FOLLOWUPS') {
    summary += ' Track follow-up items explicitly in the PR or handoff.';
  }
  return {
    posture,
    summary,
    risk_level: riskLevel,
    strategy_bias: strategyBias || 'balanced',
    validation_mode: validationMode || 'standard',
    review_gate_verdict: review ? review.verdict : null,
    scaffold_bundle_mode: scaffold && scaffold.bundle_mode ? scaffold.bundle_mode : null,
    scaffold_integration_mode: scaffold && scaffold.integration_mode ? scaffold.integration_mode : null,
  };
}

/** @param {any} plan @param {any} run @param {any} review @param {any} advice */
function deriveNextSteps(plan, run, review, advice) {
  const steps = [];
  if (advice && advice.level) {
    steps.push(`Delivery recommendation: ${advice.level} — ${advice.summary}`);
  }
  if (review && review.verdict === 'BLOCK') {
    steps.push('Address review blockers before merge.');
  } else if (review && review.verdict === 'ACCEPT_WITH_FOLLOWUPS') {
    steps.push('Merge is possible, but track follow-up items explicitly.');
  } else if (review && review.verdict === 'ACCEPT') {
    steps.push('Ready to prepare final PR and merge.');
  }
  if (run && run.failure_strategy && run.failure_strategy.action && run.status !== 'green') {
    steps.push(`Current recovery strategy: ${run.failure_strategy.action} (confidence ${run.failure_strategy.confidence}).`);
  }
  if (plan && Array.isArray(plan.suggested_commands)) {
    for (const item of plan.suggested_commands.slice(0, 4)) steps.push(`Suggested command: ${item}`);
  }
  return steps.slice(0, 8);
}

/** @param {string} rootDir @param {string | null | undefined} planId */
function buildReport(rootDir, planId) {
  const plan = resolvePlan(rootDir, planId);
  const review = resolveReviewGate(rootDir);
  const git = gitSummary(rootDir);
  if (!plan) {
    const featureAcceptance = buildFeatureAcceptanceSummary(rootDir, null);
    const featureName = featureAcceptance.last_feature_generation || (featureAcceptance.features[0] ? featureAcceptance.features[0].feature_name : null);
    const featureDelivery = featureName ? buildFeatureDeliverySummary(rootDir, featureName) : null;
    /** @type {any} */
    const report = {
      schema_version: '1.4',
      generated_at: new Date().toISOString(),
      root_dir: rootDir,
      plan_id: null,
      objective: featureName ? `Feature delivery for ${featureName}` : 'Feature delivery',
      profile: { runtime: null, language: null, framework: null, package_manager: null, test_runner: null, typecheck_tool: null },
      selected_skill: null,
      scaffold: null,
      scaffold_policy: null,
      scaffold_updates: [],
      benchmark_feedback: null,
      execution_policy: null,
      coder_loop: { run_id: null, status: null, failed_count: null, round_count: null, failure_strategy: null, checks: [] },
      review_gate: review ? {
        verdict: review.verdict,
        blockers: review.merge_risk_summary && Array.isArray(review.merge_risk_summary.blockers) ? review.merge_risk_summary.blockers : [],
        followups: review.merge_risk_summary && Array.isArray(review.merge_risk_summary.followups) ? review.merge_risk_summary.followups : [],
        merge_risk_summary: review.merge_risk_summary || null,
        review_policy: review.status_inputs && review.status_inputs.review_policy ? review.status_inputs.review_policy : null,
        diff_sample: review.scope_summary && review.scope_summary.diff_sample ? review.scope_summary.diff_sample : null,
      } : null,
      git,
      risk_posture: null,
      feature_delivery: featureDelivery,
      feature_acceptance: featureAcceptance,
    };
    report.delivery_advice = deriveDeliveryAdvice(report);
    report.next_steps = featureDelivery
      ? [featureDelivery.ready ? 'Feature artifacts are ready for handoff.' : 'Resolve feature delivery gaps before handoff.']
      : ['Generate a feature or persist feature artifacts before requesting a delivery report.'];
    return report;
  }
  const run = resolveCoderRun(rootDir, plan);
  const isFeatureTask = Boolean((plan.selected_skill && plan.selected_skill.task_family === 'feature') || (plan.scaffold && plan.scaffold.task_family === 'feature') || (plan.scaffold && (plan.scaffold.feature_plan || plan.scaffold.integration_json)));
  const featureName = isFeatureTask ? (plan.scaffold && plan.scaffold.feature_name ? plan.scaffold.feature_name : null) : null;
  const featureDelivery = isFeatureTask ? buildFeatureDeliverySummary(rootDir, featureName) : null;
  const featureAcceptance = isFeatureTask ? buildFeatureAcceptanceSummary(rootDir, featureName) : null;
  /** @type {any} */
  const report = {
    schema_version: '1.4',
    generated_at: new Date().toISOString(),
    root_dir: rootDir,
    plan_id: plan.plan_id,
    objective: plan.objective,
    profile: {
      runtime: plan.profile.runtime,
      language: plan.profile.language,
      framework: plan.profile.framework,
      package_manager: plan.profile.package_manager || null,
      test_runner: plan.profile.test_runner || null,
      typecheck_tool: plan.profile.typecheck_tool || null,
    },
    selected_skill: plan.selected_skill || null,
    scaffold: plan.scaffold || null,
    scaffold_policy: plan.scaffold && plan.scaffold.scaffold_policy ? plan.scaffold.scaffold_policy : (plan.scaffold_policy || null),
    scaffold_updates: plan.scaffold && Array.isArray(plan.scaffold.updates) ? plan.scaffold.updates : [],
    benchmark_feedback: plan.benchmark_feedback ? {
      risk_level: plan.benchmark_feedback.risk_level,
      risk_score: plan.benchmark_feedback.risk_score,
      strategy_bias: plan.benchmark_feedback.strategy_bias,
      recommended_validation_mode: plan.benchmark_feedback.recommended_validation_mode,
      recommended_action: plan.benchmark_feedback.recommended_action || null,
    } : null,
    execution_policy: plan.execution_policy ? {
      strategy_bias: plan.execution_policy.strategy_bias,
      validation_mode: plan.execution_policy.validation_mode,
      review_gate_required: plan.execution_policy.review_gate_required,
      context_scope: plan.execution_policy.context_scope || null,
      ast_edit_mode: plan.execution_policy.ast_edit_mode || null,
      scaffold_bundle_mode: plan.execution_policy.scaffold_bundle_mode || null,
      scaffold_integration_mode: plan.execution_policy.scaffold_integration_mode || null,
    } : null,
    coder_loop: {
      run_id: plan.coder_loop ? plan.coder_loop.run_id : null,
      status: plan.coder_loop ? plan.coder_loop.status : null,
      failed_count: plan.coder_loop ? plan.coder_loop.failed_count : null,
      round_count: plan.coder_loop ? plan.coder_loop.round_count : null,
      failure_strategy: run && run.failure_strategy ? run.failure_strategy : null,
      checks: compactChecks(run),
    },
    review_gate: review ? {
      verdict: review.verdict,
      blockers: review.merge_risk_summary && Array.isArray(review.merge_risk_summary.blockers) ? review.merge_risk_summary.blockers : [],
      followups: review.merge_risk_summary && Array.isArray(review.merge_risk_summary.followups) ? review.merge_risk_summary.followups : [],
      merge_risk_summary: review.merge_risk_summary || null,
      review_policy: review.status_inputs && review.status_inputs.review_policy ? review.status_inputs.review_policy : null,
      diff_sample: review.scope_summary && review.scope_summary.diff_sample ? review.scope_summary.diff_sample : null,
    } : null,
    git,
    risk_posture: buildRiskPosture(plan, review, plan.benchmark_feedback),
    feature_delivery: featureDelivery,
    feature_acceptance: featureAcceptance,
  };
  report.delivery_advice = deriveDeliveryAdvice(report);
  report.next_steps = deriveNextSteps(plan, run, review, report.delivery_advice);
  return report;
}

/** @param {string} rootDir @param {any} report @param {string} markdown */
function writeArtifacts(rootDir, report, markdown) {
  const outDir = path.join(rootDir, '.opencode', 'delivery');
  ensureDir(outDir);
  const prBody = toPrBody(report);
  const handoff = toHandoff(report);
  const advice = toAdviceMarkdown(report);
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(outDir, 'latest.md'), markdown, 'utf8');
  fs.writeFileSync(path.join(outDir, 'pr-body.md'), prBody, 'utf8');
  fs.writeFileSync(path.join(outDir, 'handoff.md'), handoff, 'utf8');
  fs.writeFileSync(path.join(outDir, 'advice.md'), advice, 'utf8');
  fs.writeFileSync(path.join(outDir, 'advice.json'), JSON.stringify(report.delivery_advice || null, null, 2) + '\n', 'utf8');
  return { prBody, handoff, advice };
}

function main() {
  const opts = parseArgs(process.argv);
  const cmd = opts._[0] || 'report';
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    usage();
    return;
  }
  if (!['report', 'pr-body', 'handoff', 'advice'].includes(cmd)) throw new Error(`Unknown subcommand: ${cmd}`);
  const rootDir = path.resolve(String(opts.root || process.cwd()));
  const requestedPlanId = typeof opts['plan-id'] === 'string' ? opts['plan-id'] : (typeof opts.plan_id === 'string' ? opts.plan_id : null);
  const report = buildReport(rootDir, requestedPlanId);
  const markdown = toMarkdown(report);
  const artifacts = writeArtifacts(rootDir, report, markdown);
  appendEvent(rootDir, 'delivery-report.generated', {
    flow: 'delivery',
    plan_id: report.plan_id,
    objective: report.objective,
    status: report.review_gate ? report.review_gate.verdict : (report.coder_loop.status || 'unknown'),
    mode: cmd,
    delivery_level: report.delivery_advice ? report.delivery_advice.level : 'unknown',
    preferred_artifact: report.delivery_advice ? report.delivery_advice.preferred_artifact : null,
  });
  if (cmd === 'report') {
    if (opts.json) {
      assertNamedContract('delivery-report', report);
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return;
    }
    process.stdout.write(markdown);
    return;
  }
  process.stdout.write(cmd === 'pr-body' ? artifacts.prBody : cmd === 'handoff' ? artifacts.handoff : artifacts.advice);
}

module.exports = { main, buildReport, toMarkdown, toPrBody, toHandoff, toAdviceMarkdown };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[delivery-report] ${message}`);
    process.exit(1);
  }
}
