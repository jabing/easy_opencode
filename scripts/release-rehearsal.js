#!/usr/bin/env node
const { runReleaseRehearsal } = require('../src/core/release/rehearsal.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { assertReleaseRehearsalContract } = require('../src/shared/contracts.js');

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) { opts._.push(token); continue; }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { opts[key] = true; continue; }
    opts[key] = next; i += 1;
  }
  return opts;
}

function usage() {
  console.log('Usage:');
  console.log(`  ${formatManagedInvocation('release-rehearsal', ['--json'])}`);
  console.log(`  ${formatManagedInvocation('release-rehearsal', ['--policy', 'production', '--baseline-name', 'release', '--json'])}`);
  console.log(`  ${formatManagedInvocation('release-rehearsal', ['--strict', '--baseline-name', 'release', '--json'])}`);
}

function printReport(report) {
  console.log(`Release rehearsal decision: ${report.decision}`);
  console.log(`Rehearsal root: ${report.rehearsal_root}`);
  console.log(`Snapshot status: ${report.snapshot ? report.snapshot.status : 'n/a'}`);
  console.log(`Release decision: ${report.release_report ? report.release_report.decision : 'n/a'}`);
  if (report.release_conclusion) {
    console.log(`Why: ${report.release_conclusion.reason}`);
    console.log(`Baseline: ${report.release_conclusion.selected_baseline_name || 'n/a'} (recommended=${report.release_conclusion.canonical_baseline_name || 'n/a'})`);
    console.log(`Rollback ready: ${report.release_conclusion.rollback_ready}`);
  }
}

function main() {
  try {
    const opts = parseArgs(process.argv);
    if (opts.help || opts.h) { usage(); process.exit(0); }
    const report = runReleaseRehearsal(String(opts.root || process.cwd()), {
      strict: opts.strict !== undefined ? Boolean(opts.strict) : true,
      baselineName: opts['baseline-name'] || 'release',
      policy: opts.policy || 'standard',
      snapshotLabel: opts['snapshot-label'] || 'release-rehearsal',
    });
    if (opts.json) {
      assertReleaseRehearsalContract(report);
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return;
    }
    printReport(report);
    if (report.decision === 'blocked') process.exit(1);
  } catch (error) {
    console.error(`[release-rehearsal] ${error.message}`);
    usage();
    process.exit(1);
  }
}

if (require.main === module) main();
