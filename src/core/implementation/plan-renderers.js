const { formatManagedInvocation } = require('../../cli/runtime-paths.js');

/** @param {string} [line] */
function printLine(line = '') {
  process.stdout.write(String(line) + '\n');
}

/** @param {any} plan */
function printPlanSummary(plan) {
  printLine(`Plan: ${plan.plan_id}`);
  printLine(`Objective: ${plan.objective}`);
  printLine(`Profile: runtime=${plan.profile.runtime} language=${plan.profile.language} framework=${plan.profile.framework}`);
  if (plan.selected_skill) {
    printLine(`Skill: ${plan.selected_skill.dir} (${plan.selected_skill.level})`);
    const rationale = plan.selected_skill.decision && plan.selected_skill.decision.summary;
    if (rationale) printLine(`Skill rationale: ${rationale}`);
  } else {
    printLine('Skill: <none>');
  }
  if (plan.skill_selection_report) {
    const report = plan.skill_selection_report;
    if (report.selection_basis) printLine(`Selection basis: ${report.selection_basis}`);
    if (report.rejected_candidates && report.rejected_candidates.length > 0) {
      printLine(`Rejected candidates: ${report.rejected_candidates.length}`);
      const topRejected = report.rejected_candidates[0];
      if (topRejected && topRejected.summary) printLine(`Top rejection: ${topRejected.dir} — ${topRejected.summary}`);
    }
  }
  if (plan.scaffold) {
    const scaffoldOutputs = Array.isArray(plan.scaffold.outputs) && plan.scaffold.outputs.length > 0
      ? plan.scaffold.outputs.join(', ')
      : plan.scaffold.output;
    printLine(`Scaffold: ${scaffoldOutputs} via ${plan.scaffold.skill}${plan.scaffold.dry_run ? ' [dry-run]' : ''}`);
    const scaffoldPolicy = plan.scaffold.scaffold_policy || plan.scaffold_policy;
    if (scaffoldPolicy) printLine(`Scaffold policy: ${scaffoldPolicy.strategy_bias} / bundle=${scaffoldPolicy.bundle_mode} / integration=${scaffoldPolicy.integration_mode}`);
  }
  if (plan.safety) {
    const parts = [plan.safety.snapshot_status || 'none'];
    if (plan.safety.snapshot_id) parts.push(plan.safety.snapshot_id);
    if (plan.safety.recovery_assessment && typeof plan.safety.recovery_assessment.confidence_score === 'number') {
      parts.push(`resume=${plan.safety.recovery_assessment.confidence_score}`);
    }
    printLine(`Safety: ${parts.join(' / ')}`);
  }
  if (plan.coder_loop) {
    printLine(`Coder loop: ${plan.coder_loop.run_id} (${plan.coder_loop.status})`);
    for (const check of plan.coder_loop.checks || []) {
      printLine(`- ${check.kind}: ${check.code === 0 ? 'PASS' : 'FAIL'} (${check.command})`);
    }
  }
  if (plan.benchmark_feedback) {
    printLine(`Benchmark risk: ${plan.benchmark_feedback.risk_level} (score=${plan.benchmark_feedback.risk_score}, confidence=${plan.benchmark_feedback.confidence})`);
    printLine(`Strategy bias: ${plan.execution_policy.strategy_bias} / validation=${plan.execution_policy.validation_mode}`);
  }
  printLine(`Context packet: ${plan.files.context}`);
  printLine(`Next prompt: ${plan.files.next_prompt}`);
}

/** @param {any} plan */
function buildSuggestedCommands(plan) {
  /** @type {string[]} */
  const commands = [
    formatManagedInvocation('project-profile', ['--root', plan.root_dir, '--json'], { cwd: plan.root_dir }),
    formatManagedInvocation('implement-task', ['status', '--plan-id', plan.plan_id], { cwd: plan.root_dir }),
    formatManagedInvocation('implement-task', ['next-prompt', '--plan-id', plan.plan_id], { cwd: plan.root_dir }),
  ];
  if (plan.coder_loop && plan.coder_loop.run_id) {
    commands.push(formatManagedInvocation('coder-loop', ['run', '--run-id', plan.coder_loop.run_id, '--root', plan.root_dir, '--emit-prompt'], { cwd: plan.root_dir }));
  }
  if (plan.selected_skill) {
    commands.push(formatManagedInvocation('skill-runner', ['show', plan.selected_skill.dir, '--json'], { cwd: plan.root_dir }));
  }
  if (plan.safety && plan.safety.snapshot_id) {
    commands.push(formatManagedInvocation('safe-apply', ['status', '--snapshot-id', plan.safety.snapshot_id], { cwd: plan.root_dir }));
    commands.push(formatManagedInvocation('safe-apply', ['rollback', '--snapshot-id', plan.safety.snapshot_id, '--dry-run'], { cwd: plan.root_dir }));
  }
  commands.push(formatManagedInvocation('failure-strategy', ['report', '--run-id', plan.coder_loop.run_id, '--json'], { cwd: plan.root_dir }));
  commands.push(formatManagedInvocation('review-gate', ['report', '--json'], { cwd: plan.root_dir }));
  commands.push(formatManagedInvocation('review-gate', ['report', '--with-quality-gate', '--quality-mode', 'full', '--json'], { cwd: plan.root_dir }));
  commands.push(formatManagedInvocation('delivery-report', ['report', '--json'], { cwd: plan.root_dir }));
  commands.push(formatManagedInvocation('delivery-report', ['report'], { cwd: plan.root_dir }));
  if (plan.benchmark_feedback) {
    commands.push(formatManagedInvocation('benchmark-feedback', ['report', '--root', plan.root_dir, '--json'], { cwd: plan.root_dir }));
    commands.push(formatManagedInvocation('benchmark-suite', ['trend', '--group-by', 'runtime-framework', '--json'], { cwd: plan.root_dir }));
    commands.push(formatManagedInvocation('benchmark-suite', ['trend', '--group-by', 'skill-family', '--json'], { cwd: plan.root_dir }));
    if (plan.selected_skill && plan.selected_skill.dir) {
      commands.push(formatManagedInvocation('benchmark-suite', ['trend', '--group-by', 'skill', '--json'], { cwd: plan.root_dir }));
    }
  }
  return Array.from(new Set(commands));
}

module.exports = {
  buildSuggestedCommands,
  printPlanSummary,
};
