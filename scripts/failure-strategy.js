#!/usr/bin/env node
const { loadRun, loadLatestRunId } = require('./coder-loop.js');
const { analyzeCoderRun } = require('../src/core/gates/failure-strategy.js');
const { assertNamedContract } = require('../src/shared/contracts.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');

function parseArgs(argv) {
  const cmd = argv[2] || 'report';
  const opts = { _: [] };
  for (let i = 3; i < argv.length; i++) {
    const token = argv[i];
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
  return { cmd, opts };
}

function usage() {
  console.log('Usage:');
  console.log(`  ${formatManagedInvocation('failure-strategy', ['report', '--run-id', '<run-id>', '--json'])}`);
  console.log(`  ${formatManagedInvocation('failure-strategy', ['report'])}`);
  console.log('Commands: report');
}

function printReport(report) {
  console.log(`Run: ${report.run_id}`);
  console.log(`Objective: ${report.objective}`);
  console.log(`Status: ${report.status}`);
  console.log(`Recommended action: ${report.action}`);
  console.log(`Confidence: ${report.confidence}`);
  if (report.benchmark_feedback) {
    console.log(`Benchmark risk: ${report.benchmark_feedback.risk_level} (score=${report.benchmark_feedback.risk_score}, confidence=${report.benchmark_feedback.confidence})`);
    console.log(`Strategy bias: ${report.strategy_bias} / validation=${report.recommended_validation_mode}`);
    console.log(`Review gate required: ${report.review_gate_required ? 'yes' : 'no'}`);
  }
  if (report.linked_plan_id) console.log(`Linked plan: ${report.linked_plan_id}`);
  if (report.linked_snapshot_id) console.log(`Linked snapshot: ${report.linked_snapshot_id}`);
  console.log('Reasons:');
  for (const reason of report.reasons || []) {
    console.log(`- ${reason}`);
  }
  console.log('Signals:');
  console.log(`- failure_count: ${report.signals.current_failure_count}`);
  console.log(`- previous_failure_count: ${report.signals.previous_failure_count}`);
  console.log(`- failed_checks: ${(report.signals.failing_checks || []).join(', ') || '(none)'}`);
  console.log(`- files: ${(report.signals.unique_files || []).join(', ') || '(none)'}`);
  console.log(`- repeated_failure: ${report.signals.repeated_failure ? 'yes' : 'no'}`);
  console.log(`- regression_spike: ${report.signals.regression_spike ? 'yes' : 'no'}`);
  console.log('Suggested commands:');
  for (const command of report.suggested_commands || []) {
    console.log(`- ${command}`);
  }
}

function main() {
  try {
    const { cmd, opts } = parseArgs(process.argv);
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
      usage();
      process.exit(0);
    }
    if (cmd !== 'report') throw new Error(`unknown command: ${cmd}`);
    const root = String(opts.root || process.cwd());
    const runId = String(opts['run-id'] || opts.run || opts._[0] || loadLatestRunId(root));
    const run = loadRun(runId, root);
    const report = analyzeCoderRun(run);
    if (opts.json) {
      assertNamedContract('failure-strategy', report);
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return;
    }
    printReport(report);
  } catch (error) {
    console.error(`[failure-strategy] ${error.message}`);
    usage();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
