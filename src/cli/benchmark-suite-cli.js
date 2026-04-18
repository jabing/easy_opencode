#!/usr/bin/env node
const path = require('path');
const { formatManagedInvocation } = require('./runtime-paths.js');
const { appendEvent, readBenchmarkRuns } = require('../control-plane/observability/index.js');
const { compareRuns, loadRunFromRef } = require('../core/benchmark/analysis.js');
const { writeBenchmarkBaseline, listBenchmarkBaselines, compareBaselineToRun, selectRun } = require('../core/benchmark/baselines.js');
const { approveBaseline, revokeBaselineApproval, resolveApprovalStatus, listBaselineApprovals } = require('../core/benchmark/baseline-approvals.js');
const { archiveBenchmarkRuns, assessBenchmarkRetention } = require('../core/benchmark/retention.js');
const { buildTrendReport } = require('../core/benchmark/trends.js');
const { summarizeRunFreshness } = require('../core/benchmark/freshness.js');
const { buildCanonicalBaselineName, inferProfileHint, normalizeProfileHint } = require('../core/benchmark/baseline-naming.js');
const { summarizeCodingCapability } = require('../core/benchmark/coding.js');
const {
  printApprovalReport,
  printArchiveReport,
  printBaselineSummary,
  printComparison,
  printFreshnessReport,
  printSummary,
  printTrendReport,
  readFailureReplayCases,
  materializeSuiteRoots,
  sampleSuite,
} = require('../core/benchmark/suite-helpers.js');
const { parseCliArgs } = require('../shared/cli/args.js');
const { readJson, writeJson, runSuite, compareLatest } = require('../core/benchmark/suite-runtime.js');

/** @typedef {import('../shared/cli/args.js').ParsedCliOptions} ParsedCliOptions */
/** @typedef {{ summary?: { failed?: number, regressed?: number } | null }} SummaryCarrier */

/** @param {ParsedCliOptions} opts @param {string} key @returns {string | undefined} */
function readStringFlag(opts, key) {
  const value = opts[key];
  return typeof value === 'string' ? value : undefined;
}

/** @param {ParsedCliOptions} opts @param {string} key @returns {string | null} */
function readNullableStringFlag(opts, key) {
  const value = readStringFlag(opts, key);
  return value === undefined ? null : value;
}

/** @param {ParsedCliOptions} opts @param {string} key @returns {number | undefined} */
function readNumberFlag(opts, key) {
  const value = readStringFlag(opts, key);
  if (value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

/** @param {ParsedCliOptions} opts @param {string} key @returns {Date | undefined} */
function readDateFlag(opts, key) {
  const value = readStringFlag(opts, key);
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** @param {ParsedCliOptions} opts @param {string} key @returns {boolean} */
function hasFlag(opts, key) {
  return Boolean(opts[key]);
}

/** @param {unknown} report @returns {{ comparison?: SummaryCarrier, summary?: SummaryCarrier['summary'] }} */
function readComparisonReport(report) {
  return /** @type {{ comparison?: SummaryCarrier, summary?: SummaryCarrier['summary'] }} */ (report || {});
}

/** @param {string} policy @param {string | null} profile @returns {Record<string, any>} */
function buildBaselineNamingArgs(policy, profile) {
  return profile ? { policy, profile } : { policy };
}

/** @param {string} policy @param {number | undefined} keepLatest @param {Date | undefined} now @param {number} limit @param {boolean} [apply] @returns {Record<string, any>} */
function buildRetentionOptions(policy, keepLatest, now, limit, apply) {
  /** @type {Record<string, any>} */
  const options = apply ? { policy, limit, apply: true } : { policy, limit };
  if (keepLatest !== undefined) options.keepLatest = keepLatest;
  if (now !== undefined) options.now = now;
  return options;
}

/** @param {string} policy @param {string | undefined} now @returns {Record<string, any>} */
function buildFreshnessOptions(policy, now) {
  return now ? { policy, now } : { policy };
}

function printLine(line = '') {
  process.stdout.write(String(line) + '\n');
}

function usage() {
  printLine('Usage:');
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['sample', '--preset', 'production-readiness', '--out', 'benchmarks.sample.json'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['sample', '--preset', 'node-api'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['sample', '--preset', 'plugin-self-release'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['run', '--suite', 'benchmarks.sample.json', '--json'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['compare', '--baseline', '<run-id>', '--current', '<run-id>', '--json'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['compare', '--latest', '--json'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['baseline', '--name', 'release', '--latest', '--json'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['baseline', '--profile', 'node-api', '--policy', 'production', '--latest', '--json'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['compare', '--baseline-name', 'release', '--latest', '--json'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['trend', '--group-by', 'runtime-framework', '--json'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['trend', '--group-by', 'skill-family', '--json'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['freshness', '--policy', 'production', '--json'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['approve', '--name', 'release', '--approver', 'qa-lead', '--json'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['approval', '--name', 'release', '--json'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['archive', '--policy', 'production', '--apply', '--json'])}`);
  printLine(`  ${formatManagedInvocation('benchmark-suite', ['replay', '--limit', '5', '--json'])}`);
}

async function main() {
  try {
    const { cmd, opts } = parseCliArgs(process.argv, { defaultCommand: 'run', listFlags: ['var'] });
    if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
      usage();
      return;
    }
    if (cmd === 'sample') {
      const payload = materializeSuiteRoots(sampleSuite(readStringFlag(opts, 'preset') || 'core'), readStringFlag(opts, 'root') || process.cwd());
      const outPath = readStringFlag(opts, 'out');
      if (outPath) writeJson(path.resolve(outPath), payload);
      else process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      return;
    }
    if (cmd === 'replay') {
      const rootDir = readStringFlag(opts, 'root') || process.cwd();
      const payload = readFailureReplayCases(rootDir, { limit: readNumberFlag(opts, 'limit') || 10 }, readJson);
      appendEvent(rootDir, 'benchmark.replay.generated', { flow: 'benchmark', status: 'generated', case_count: payload.cases.length, source_kind: payload.source.kind });
      const outPath = readStringFlag(opts, 'out');
      if (outPath) writeJson(path.resolve(outPath), payload);
      else process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      return;
    }
    if (cmd === 'run') {
      const run = await runSuite(opts);
      if (opts.json) process.stdout.write(JSON.stringify(run, null, 2) + '\n');
      else printSummary(run, summarizeCodingCapability);
      if ((run.summary && Number(run.summary.failed || 0) > 0) && !hasFlag(opts, 'allow-failures')) process.exit(1);
      return;
    }
    if (cmd === 'compare') {
      const rootDir = readStringFlag(opts, 'root') || process.cwd();
      const report = opts['baseline-name']
        ? compareBaselineToRun(rootDir, String(readStringFlag(opts, 'baseline-name')), readStringFlag(opts, 'current'), { latest: hasFlag(opts, 'latest') })
        : opts.latest
          ? compareLatest(rootDir)
          : compareRuns(loadRunFromRef(rootDir, String(readStringFlag(opts, 'baseline'))), loadRunFromRef(rootDir, String(readStringFlag(opts, 'current'))));
      const compareView = readComparisonReport(report);
      const summary = compareView.comparison ? compareView.comparison.summary : compareView.summary;
      if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      else printComparison(compareView.comparison || report);
      if (summary && Number(summary.regressed || 0) > 0 && !hasFlag(opts, 'allow-regressions')) process.exit(1);
      return;
    }
    if (cmd === 'baseline') {
      const rootDir = readStringFlag(opts, 'root') || process.cwd();
      if (hasFlag(opts, 'list')) {
        const report = { baselines: listBenchmarkBaselines(rootDir) };
        if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        else printBaselineSummary(report);
        return;
      }
      const profileHint = normalizeProfileHint(readNullableStringFlag(opts, 'profile'));
      const name = String(readStringFlag(opts, 'name') || buildCanonicalBaselineName(rootDir, buildBaselineNamingArgs(readStringFlag(opts, 'policy') || 'standard', profileHint)));
      const fromRef = readNullableStringFlag(opts, 'from');
      const run = fromRef === null
        ? selectRun(rootDir, { latest: hasFlag(opts, 'latest') })
        : selectRun(rootDir, { latest: hasFlag(opts, 'latest'), from: fromRef });
      const tags = opts.tag ? (Array.isArray(opts.tag) ? opts.tag : [opts.tag]) : [];
      const baseline = writeBenchmarkBaseline(rootDir, name, run, {
        latest: hasFlag(opts, 'latest'),
        sourceKind: hasFlag(opts, 'latest') ? 'latest-run' : 'run-ref',
        sourceRef: readNullableStringFlag(opts, 'from') || run.run_id || null,
        notes: readNullableStringFlag(opts, 'notes'),
        tags,
      });
      appendEvent(rootDir, 'benchmark.baseline.saved', {
        flow: 'benchmark',
        status: 'saved',
        baseline_name: baseline.name,
        run_id: baseline.baseline_summary ? baseline.baseline_summary.run_id : null,
        profile_hint: profileHint || inferProfileHint(rootDir),
      });
      if (opts.json) process.stdout.write(JSON.stringify(baseline, null, 2) + '\n');
      else printBaselineSummary(baseline);
      return;
    }
    if (cmd === 'trend') {
      const rootDir = readStringFlag(opts, 'root') || process.cwd();
      const runs = readBenchmarkRuns(rootDir, { limit: Math.max(1, readNumberFlag(opts, 'limit') || 10) });
      if (runs.length === 0) throw new Error('Need at least one benchmark run to compute trends');
      const report = buildTrendReport(runs, { groupBy: readStringFlag(opts, 'group-by') || 'runtime-framework', limit: readNumberFlag(opts, 'limit') || 10 });
      appendEvent(rootDir, 'benchmark.trend.reported', { flow: 'benchmark', status: 'reported', group_by: report.group_by, run_count: report.run_count, bucket_count: report.bucket_count });
      if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      else printTrendReport(report);
      return;
    }
    if (cmd === 'approve') {
      const rootDir = readStringFlag(opts, 'root') || process.cwd();
      const profileHint = normalizeProfileHint(readNullableStringFlag(opts, 'profile'));
      const baselineName = String(readStringFlag(opts, 'name') || buildCanonicalBaselineName(rootDir, buildBaselineNamingArgs(readStringFlag(opts, 'policy') || 'standard', profileHint)));
      const report = approveBaseline(rootDir, baselineName, { approver: readStringFlag(opts, 'approver') || readStringFlag(opts, 'by') || 'release-manager', note: readNullableStringFlag(opts, 'note') });
      appendEvent(rootDir, 'benchmark.baseline.approved', { flow: 'benchmark', status: 'approved', baseline_name: report.baseline_name, run_id: report.baseline_run_id, approver: report.approver });
      if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      else printApprovalReport({ ...report, ready: true });
      return;
    }
    if (cmd === 'approval') {
      const rootDir = readStringFlag(opts, 'root') || process.cwd();
      if (hasFlag(opts, 'list')) {
        const report = { approvals: listBaselineApprovals(rootDir) };
        if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        else printApprovalReport(report);
        return;
      }
      if (hasFlag(opts, 'revoke')) {
        const profileHint = normalizeProfileHint(readNullableStringFlag(opts, 'profile'));
        const baselineName = String(readStringFlag(opts, 'name') || buildCanonicalBaselineName(rootDir, buildBaselineNamingArgs(readStringFlag(opts, 'policy') || 'standard', profileHint)));
        const report = revokeBaselineApproval(rootDir, baselineName, { approver: readStringFlag(opts, 'approver') || readStringFlag(opts, 'by') || 'release-manager', note: readNullableStringFlag(opts, 'note') });
        appendEvent(rootDir, 'benchmark.baseline.approval_revoked', { flow: 'benchmark', status: 'revoked', baseline_name: report.baseline_name, run_id: report.baseline_run_id, approver: report.revoked_by });
        if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        else printApprovalReport({ ...report, ready: false });
        return;
      }
      const profileHint = normalizeProfileHint(readNullableStringFlag(opts, 'profile'));
      const baselineName = String(readStringFlag(opts, 'name') || buildCanonicalBaselineName(rootDir, buildBaselineNamingArgs(readStringFlag(opts, 'policy') || 'standard', profileHint)));
      const report = resolveApprovalStatus(rootDir, baselineName);
      if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      else printApprovalReport(report);
      return;
    }
    if (cmd === 'archive' || cmd === 'cleanup') {
      const rootDir = readStringFlag(opts, 'root') || process.cwd();
      const report = hasFlag(opts, 'apply')
        ? archiveBenchmarkRuns(rootDir, buildRetentionOptions(readStringFlag(opts, 'policy') || 'standard', readNumberFlag(opts, 'keep-latest'), readDateFlag(opts, 'now'), readNumberFlag(opts, 'limit') || 200, true))
        : assessBenchmarkRetention(rootDir, buildRetentionOptions(readStringFlag(opts, 'policy') || 'standard', readNumberFlag(opts, 'keep-latest'), readDateFlag(opts, 'now'), readNumberFlag(opts, 'limit') || 200));
      appendEvent(rootDir, 'benchmark.archive.reported', { flow: 'benchmark', status: hasFlag(opts, 'apply') ? 'applied' : 'dry-run', policy: readStringFlag(opts, 'policy') || 'standard', archive_candidates: report.archive_candidates.length, archived_count: 'archived_count' in report ? Number(report.archived_count || 0) : 0 });
      if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      else printArchiveReport(report);
      return;
    }
    if (cmd === 'freshness') {
      const rootDir = readStringFlag(opts, 'root') || process.cwd();
      const runs = readBenchmarkRuns(rootDir, { limit: Math.max(1, readNumberFlag(opts, 'limit') || 20) });
      const report = summarizeRunFreshness(runs, buildFreshnessOptions(readStringFlag(opts, 'policy') || 'standard', readStringFlag(opts, 'now')));
      appendEvent(rootDir, 'benchmark.freshness.reported', { flow: 'benchmark', status: report.latest_status, run_count: report.run_count, policy: report.policy ? report.policy.id : 'standard' });
      if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      else printFreshnessReport(report);
      return;
    }
    throw new Error(`unknown command: ${cmd}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[benchmark-suite] ${message}`);
    usage();
    process.exit(1);
  }
}

module.exports = {
  main,
  runSuite,
  compareLatest,
  sampleSuite,
  readFailureReplayCases,
};

if (require.main === module) {
  main();
}
