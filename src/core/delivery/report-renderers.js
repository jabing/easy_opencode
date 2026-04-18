/** @param {Record<string, any>} report */
function toMarkdown(report) {
  const lines = [];
  lines.push(`# Delivery Report: ${report.objective}`);
  lines.push('');
  lines.push(`- Plan ID: ${report.plan_id}`);
  lines.push(`- Runtime: ${report.profile.runtime} / ${report.profile.language} / ${report.profile.framework}`);
  lines.push(`- Toolchain: ${report.profile.package_manager || 'n/a'} / ${report.profile.test_runner || 'n/a'} / ${report.profile.typecheck_tool || 'n/a'}`);
  if (report.selected_skill) lines.push(`- Selected skill: ${report.selected_skill.dir}`);
  if (report.scaffold) {
    const outputs = Array.isArray(report.scaffold.outputs) ? report.scaffold.outputs.join(', ') : report.scaffold.output;
    lines.push(`- Scaffold outputs: ${outputs}`);
  }
  if (report.scaffold_policy) lines.push(`- Scaffold policy: ${report.scaffold_policy.strategy_bias} / bundle=${report.scaffold_policy.bundle_mode} / integration=${report.scaffold_policy.integration_mode}`);
  if (report.benchmark_feedback) lines.push(`- Benchmark risk: ${report.benchmark_feedback.risk_level} (score=${report.benchmark_feedback.risk_score}, strategy=${report.benchmark_feedback.strategy_bias}, validation=${report.benchmark_feedback.recommended_validation_mode})`);
  if (report.execution_policy) lines.push(`- Execution policy: context=${report.execution_policy.context_scope || 'standard'} / ast=${report.execution_policy.ast_edit_mode || 'balanced'} / review-gate-required=${report.execution_policy.review_gate_required ? 'yes' : 'no'}`);
  if (report.risk_posture) lines.push(`- Delivery posture: ${report.risk_posture.posture} — ${report.risk_posture.summary} (${report.risk_posture.risk_level} risk / ${report.risk_posture.strategy_bias} strategy / ${report.risk_posture.validation_mode} validation)`);
  if (report.delivery_advice) lines.push(`- Delivery recommendation: ${report.delivery_advice.level} — ${report.delivery_advice.summary} (preferred artifact: ${report.delivery_advice.preferred_artifact})`);
  if ((report.scaffold_updates || []).length > 0) {
    const applied = report.scaffold_updates.filter(/** @param {any} item */ (item) => ['updated', 'created', 'already_present', 'would_apply'].includes(item.status));
    lines.push(`- Integration updates: ${applied.map(/** @param {any} item */ (item) => `${item.file} [${item.status}]`).join(', ')}`);
  }
  lines.push('');
  lines.push('## Risk & Review Policy');
  if (report.review_gate && report.review_gate.review_policy) {
    lines.push(`- Review posture: ${report.review_gate.review_policy.merge_posture} / diff-sample=${report.review_gate.review_policy.diff_sample_mode}`);
  } else {
    lines.push('- Review posture: not assessed yet.');
  }
  if (report.review_gate && report.review_gate.diff_sample) {
    lines.push(`- Review sample: ${report.review_gate.diff_sample.sampled_file_count}/${report.review_gate.diff_sample.max_files} files, ${report.review_gate.diff_sample.sampled_line_count}/${report.review_gate.diff_sample.max_lines} lines${report.review_gate.diff_sample.truncated ? ' (truncated)' : ''}`);
  }
  if (report.delivery_advice && Array.isArray(report.delivery_advice.reasons) && report.delivery_advice.reasons.length > 0) {
    lines.push(`- Recommendation reasons: ${report.delivery_advice.reasons.join('; ')}`);
  }
  if (report.feature_delivery) {
    lines.push('');
    lines.push('## Feature Delivery');
    lines.push(`- Feature: ${report.feature_delivery.feature_name}`);
    lines.push(`- Ready: ${report.feature_delivery.ready ? 'yes' : 'no'}`);
    lines.push(`- Summary: ${report.feature_delivery.summary}`);
    if ((report.feature_delivery.missing || []).length > 0) {
      for (const item of report.feature_delivery.missing.slice(0, 6)) lines.push(`- Gap: ${item.check} — ${item.detail}`);
    }
  }
  if (report.feature_acceptance) {
    lines.push('');
    lines.push('## Feature acceptance');
    lines.push(`- Summary: ${report.feature_acceptance.summary}`);
    lines.push(`- Features counted: ${report.feature_acceptance.feature_count}`);
    lines.push(`- Ready count: ${report.feature_acceptance.ready_count}`);
    lines.push(`- Incomplete count: ${report.feature_acceptance.incomplete_count}`);
  }
  lines.push('');
  lines.push('## Validation Status');
  lines.push(`- Coder loop: ${report.coder_loop.status || 'n/a'} (${report.coder_loop.run_id || 'no-run'})`);
  if (report.coder_loop.failure_strategy) {
    lines.push(`- Failure strategy: ${report.coder_loop.failure_strategy.action} (${report.coder_loop.failure_strategy.confidence})`);
  }
  for (const check of report.coder_loop.checks || []) {
    lines.push(`- ${check.kind}: ${check.code === 0 ? 'PASS' : 'FAIL'} — ${check.command}`);
  }
  lines.push('');
  lines.push('## Merge Readiness');
  if (report.review_gate) {
    lines.push(`- Verdict: ${report.review_gate.verdict}`);
    if (report.review_gate.merge_risk_summary && report.review_gate.merge_risk_summary.recommended_next_steps && report.review_gate.merge_risk_summary.recommended_next_steps.length > 0) {
      lines.push(`- Review guidance: ${report.review_gate.merge_risk_summary.recommended_next_steps[0]}`);
    }
    for (const blocker of report.review_gate.blockers || []) lines.push(`- Blocker: ${blocker}`);
    for (const followup of report.review_gate.followups || []) lines.push(`- Follow-up: ${followup}`);
  } else {
    lines.push('- No review-gate report found yet.');
  }
  lines.push('');
  lines.push('## Changed Files');
  if ((report.git.changed_files || []).length === 0) {
    lines.push('- No git diff detected.');
  } else {
    for (const file of report.git.changed_files) lines.push(`- ${file}`);
  }
  if ((report.git.diff_stat || []).length > 0) {
    lines.push('');
    lines.push('## Diff Stat');
    for (const line of report.git.diff_stat) lines.push(`- ${line}`);
  }
  if ((report.next_steps || []).length > 0) {
    lines.push('');
    lines.push('## Suggested Next Steps');
    for (const item of report.next_steps) lines.push(`- ${item}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** @param {Record<string, any>} report */
function toAdviceMarkdown(report) {
  const advice = report.delivery_advice || null;
  const lines = [];
  lines.push(`# Delivery Advice: ${report.objective}`);
  lines.push('');
  if (!advice) {
    lines.push('- No delivery recommendation is available yet.');
    lines.push('');
    return lines.join('\n');
  }
  lines.push(`- Level: ${advice.level}`);
  lines.push(`- Summary: ${advice.summary}`);
  lines.push(`- Preferred artifact: ${advice.preferred_artifact}`);
  lines.push(`- Merge ready: ${advice.merge_ready ? 'yes' : 'no'}`);
  lines.push(`- Follow-ups required: ${advice.followups_required ? 'yes' : 'no'}`);
  lines.push(`- Review gate required: ${advice.requires_review_gate ? 'yes' : 'no'}`);
  lines.push(`- Advice tone: ${advice.advice_tone}`);
  lines.push(`- Suggested audience: ${advice.suggested_audience}`);
  if ((advice.reasons || []).length > 0) {
    lines.push('');
    lines.push('## Reasons');
    for (const reason of advice.reasons) lines.push(`- ${reason}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** @param {Record<string, any>} report */
function toPrBody(report) {
  const lines = [];
  lines.push('## Summary');
  lines.push(`- Objective: ${report.objective}`);
  lines.push(`- Runtime: ${report.profile.runtime} / ${report.profile.framework}`);
  if (report.selected_skill) lines.push(`- Skill: ${report.selected_skill.dir}`);
  if (report.scaffold) {
    const outputs = Array.isArray(report.scaffold.outputs) ? report.scaffold.outputs : [report.scaffold.output].filter(Boolean);
    lines.push(`- Scaffolded: ${outputs.join(', ')}`);
  }
  if (report.risk_posture) lines.push(`- Delivery posture: ${report.risk_posture.posture} (${report.risk_posture.risk_level} risk / ${report.risk_posture.strategy_bias} strategy / ${report.risk_posture.validation_mode} validation)`);
  if (report.delivery_advice) lines.push(`- Delivery recommendation: ${report.delivery_advice.level} (${report.delivery_advice.summary})`);
  if ((report.scaffold_updates || []).length > 0) {
    for (const item of report.scaffold_updates) lines.push(`- Integration update: ${item.file} [${item.status}]`);
  }
  if (report.feature_delivery) {
    lines.push('');
    lines.push('## Feature Delivery');
    lines.push(`- Feature: ${report.feature_delivery.feature_name}`);
    lines.push(`- Ready: ${report.feature_delivery.ready ? 'yes' : 'no'}`);
    lines.push(`- Summary: ${report.feature_delivery.summary}`);
  }
  lines.push('');
  lines.push('## Validation');
  lines.push(`- Coder loop status: ${report.coder_loop.status || 'n/a'}`);
  if (report.coder_loop.failure_strategy) {
    lines.push(`- Strategy: ${report.coder_loop.failure_strategy.action} (${report.coder_loop.failure_strategy.confidence})`);
  }
  for (const check of report.coder_loop.checks || []) {
    lines.push(`- ${check.kind}: ${check.code === 0 ? 'PASS' : 'FAIL'} — ${check.command}`);
  }
  lines.push('');
  lines.push('## Merge Gate');
  if (report.review_gate) {
    if (report.review_gate.review_policy) lines.push(`- Review posture: ${report.review_gate.review_policy.merge_posture} / diff-sample=${report.review_gate.review_policy.diff_sample_mode}`);
    lines.push(`- Verdict: ${report.review_gate.verdict}`);
    for (const blocker of report.review_gate.blockers || []) lines.push(`- Blocker: ${blocker}`);
    for (const followup of report.review_gate.followups || []) lines.push(`- Follow-up: ${followup}`);
  } else {
    lines.push('- Review gate not run yet.');
  }
  if ((report.git.changed_files || []).length > 0) {
    lines.push('');
    lines.push('## Changed Files');
    for (const file of report.git.changed_files) lines.push(`- ${file}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** @param {Record<string, any>} report */
function toHandoff(report) {
  const lines = [];
  lines.push(`# Handoff: ${report.objective}`);
  lines.push('');
  lines.push('## What was prepared');
  if (report.scaffold && Array.isArray(report.scaffold.outputs) && report.scaffold.outputs.length > 0) {
    for (const file of report.scaffold.outputs) lines.push(`- ${file}`);
  } else {
    lines.push('- No scaffold outputs recorded.');
  }
  if (report.risk_posture) lines.push(`- Delivery posture: ${report.risk_posture.posture} (${report.risk_posture.risk_level} risk / ${report.risk_posture.strategy_bias} strategy / ${report.risk_posture.validation_mode} validation)`);
  if ((report.scaffold_updates || []).length > 0) {
    lines.push('');
    lines.push('## Integration updates');
    for (const item of report.scaffold_updates) lines.push(`- ${item.file}: ${item.status}`);
  }
  if (report.feature_delivery) {
    lines.push('');
    lines.push('## Feature delivery');
    lines.push(`- Feature: ${report.feature_delivery.feature_name}`);
    lines.push(`- Ready: ${report.feature_delivery.ready ? 'yes' : 'no'}`);
    lines.push(`- Summary: ${report.feature_delivery.summary}`);
  }
  if (report.feature_acceptance) {
    lines.push('');
    lines.push('## Feature acceptance');
    lines.push(`- Summary: ${report.feature_acceptance.summary}`);
  }
  lines.push('');
  lines.push('## Current status');
  lines.push(`- Coder loop: ${report.coder_loop.status || 'n/a'}`);
  if (report.review_gate) lines.push(`- Review gate: ${report.review_gate.verdict}`);
  if (report.delivery_advice) lines.push(`- Delivery recommendation: ${report.delivery_advice.level} (${report.delivery_advice.summary})`);
  if (report.risk_posture) lines.push(`- Delivery posture: ${report.risk_posture.posture} (${report.risk_posture.risk_level} risk / ${report.risk_posture.strategy_bias} strategy)`);
  if (report.coder_loop.failure_strategy) lines.push(`- Suggested strategy: ${report.coder_loop.failure_strategy.action}`);
  lines.push('');
  lines.push('## Recommended next steps');
  for (const step of report.next_steps || []) lines.push(`- ${step}`);
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  toAdviceMarkdown,
  toHandoff,
  toMarkdown,
  toPrBody,
};
