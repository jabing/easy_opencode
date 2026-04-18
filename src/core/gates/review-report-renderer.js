/** @param {Record<string, any>} report @param {(line?: string) => void} printLine */
function printMergeReport(report, printLine) {
  printLine('=== Review Gate ===');
  printLine(`Verdict: ${report.verdict}`);
  printLine(`Objective: ${report.objective || '(unknown)'}`);
  printLine(`Changed files: ${report.scope_summary.changed_file_count}`);
  if (report.status_inputs && report.status_inputs.review_policy) {
    printLine(`Review posture: ${report.status_inputs.review_policy.merge_posture} / diff-sample=${report.status_inputs.review_policy.diff_sample_mode}`);
  }
  if (report.scope_summary && report.scope_summary.diff_sample) {
    printLine(`Diff sample: ${report.scope_summary.diff_sample.sampled_file_count}/${report.scope_summary.diff_sample.max_files} files, ${report.scope_summary.diff_sample.sampled_line_count}/${report.scope_summary.diff_sample.max_lines} lines${report.scope_summary.diff_sample.truncated ? ' (truncated)' : ''}`);
  }
  if (report.status_inputs && report.status_inputs.benchmark_feedback) {
    printLine(`Benchmark risk: ${report.status_inputs.benchmark_feedback.risk_level} (score=${report.status_inputs.benchmark_feedback.risk_score}, confidence=${report.status_inputs.benchmark_feedback.confidence})`);
    printLine(`Strategy bias: ${report.status_inputs.benchmark_feedback.strategy_bias}`);
  }
  if (report.scope_summary.risky_areas.length > 0) {
    printLine(`Risky areas: ${report.scope_summary.risky_areas.join(', ')}`);
  }
  const findings = report.findings;
  for (const [category, items] of Object.entries(findings)) {
    if (!Array.isArray(items) || items.length === 0) continue;
    printLine(`\n${category}:`);
    const limit = (report.status_inputs && report.status_inputs.review_policy && report.status_inputs.review_policy.finding_print_limit) || 5;
    for (const item of items.slice(0, limit)) {
      const where = item.file ? `${item.file}${item.line ? `:${item.line}` : ''}` : '(repo)';
      printLine(`- [${item.severity}] ${where} ${item.issue}`);
      if (item.fix) printLine(`  Fix: ${item.fix}`);
    }
  }
  printLine('\nRecommended next steps:');
  for (const step of report.merge_risk_summary.recommended_next_steps) {
    printLine(`- ${step}`);
  }
}

module.exports = {
  printMergeReport,
};
