#!/usr/bin/env node
const { generateReleaseEvidence } = require('../src/core/release/evidence.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { assertReleaseEvidenceContract } = require('../src/shared/contracts.js');
function parseArgs(argv) { const opts = { _: [] }; for (let i = 2; i < argv.length; i += 1) { const token = argv[i]; if (!token.startsWith('--')) { opts._.push(token); continue; } const key = token.slice(2); const next = argv[i + 1]; if (!next || next.startsWith('--')) { opts[key] = true; continue; } opts[key] = next; i += 1; } return opts; }
function usage() { console.log('Usage:'); console.log(`  ${formatManagedInvocation('release-evidence', ['--json'])}`); console.log(`  ${formatManagedInvocation('release-evidence', ['--policy', 'production', '--baseline-name', 'release', '--json'])}`); }
function print(report) { console.log(`Release evidence: decision=${report.summary.release_decision} policy=${report.summary.release_policy}`); console.log(`Summary: ${report.summary.final_decision_summary}`); console.log(`Benchmark readiness: ${report.summary.benchmark_readiness}`); console.log(`Baseline: ${report.summary.baseline_status} approval=${report.summary.approval_status}`); console.log(`Latest rehearsal: ${report.summary.latest_rehearsal_decision}`); console.log(`Rollback ready: ${report.summary.rollback_ready}`); console.log(`Active overrides: ${report.summary.active_override_count}`); console.log(`Override pressure: ${report.summary.override_pressure ? report.summary.override_pressure.status : 'none'}`); }
function main() {
  try {
    const opts = parseArgs(process.argv);
    if (opts.help || opts.h) { usage(); process.exit(0); }
    const report = generateReleaseEvidence(String(opts.root || process.cwd()), {
      policy: opts.policy || 'standard',
      baselineName: opts['baseline-name'] || 'release',
      strict: Boolean(opts.strict),
      eventLimit: opts['event-limit'] || 50,
      overrideId: opts['override-id'] || null,
      now: opts.now || null,
    });
    if (opts.json) {
      assertReleaseEvidenceContract(report);
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return;
    }
    print(report);
    if (report.release_report && report.release_report.decision === 'blocked') process.exit(1);
  } catch (error) {
    console.error(`[release-evidence] ${error.message}`);
    usage();
    process.exit(1);
  }
}

if (require.main === module) main();
