#!/usr/bin/env node
const { runReleaseCheck } = require('../src/core/release/check.js');
const { assertReleaseCheckContract } = require('../src/shared/contracts.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { EXIT_CODE, renderManagedUsage, runCli } = require('../src/cli/command.js');

function usage() {
  return renderManagedUsage(formatManagedInvocation, [
    ['release-check', '--json'],
    ['release-check', '--policy', 'production', '--json'],
    ['release-check', '--strict'],
    ['release-check', '--policy', 'production', '--override-id', '<override-id>', '--json'],
  ]);
}

function printReport(report, stdout = process.stdout) {
  stdout.write(`Release decision: ${report.decision} (policy=${report.selected_policy ? report.selected_policy.id : 'standard'})\n`);
  if (report.release_conclusion) {
    stdout.write(`Why: ${report.release_conclusion.reason}\n`);
    stdout.write(`Baseline: ${report.release_conclusion.selected_baseline_name || 'n/a'} (recommended=${report.release_conclusion.canonical_baseline_name || 'n/a'}) approved=${report.release_conclusion.baseline_approved}\n`);
    stdout.write(`Benchmark fresh enough: ${report.release_conclusion.benchmark_fresh_enough}\n`);
    stdout.write(`Rollback ready: ${report.release_conclusion.rollback_ready}\n`);
  }
  if (report.policy_override && report.policy_override.applied) stdout.write(`Override applied: ${report.policy_override.override_id}\n`);
  stdout.write(`Counts: pass=${report.counts.pass} fail=${report.counts.fail} warn=${report.counts.warn} skip=${report.counts.skip}\n`);
  for (const item of report.checks || []) stdout.write(`- [${item.status}] ${item.check}: ${item.detail}\n`);
  if (report.benchmark_feedback && report.benchmark_feedback.release_readiness) stdout.write(`Benchmark readiness: ${report.benchmark_feedback.release_readiness.status}\n`);
  if (report.snapshot_readiness) stdout.write(`Snapshot readiness: ${report.snapshot_readiness.status}\n`);
}

function main(deps = {}) {
  return runCli(({ argv, stdout, stderr, exit, parseArgs, writeJson, printUsage }) => {
    try {
      const opts = parseArgs(argv);
      const usageText = usage();
      if (opts.help || opts.h) {
        printUsage(stdout, usageText);
        exit(EXIT_CODE.OK);
        return;
      }
      const report = runReleaseCheck(String(opts.root || process.cwd()), {
        strict: Boolean(opts.strict),
        policy: opts.policy || 'standard',
        now: opts.now || null,
        overrideId: opts['override-id'] || null,
      });
      assertReleaseCheckContract(report);
      if (opts.json) writeJson(stdout, report);
      else printReport(report, stdout);
      exit(report.decision === 'blocked' ? EXIT_CODE.FAILED : EXIT_CODE.OK);
    } catch (error) {
      stderr.write(`[release-check] ${error instanceof Error ? error.message : String(error)}\n`);
      printUsage(stderr, usage());
      exit(EXIT_CODE.FAILED);
    }
  }, deps);
}

module.exports = {
  main,
  printReport,
  usage,
};

if (require.main === module) main();
