#!/usr/bin/env node
const { readEvents, summarizeEvents, readBenchmarkRuns, summarizeBenchmarkRuns } = require('../src/control-plane/observability/index.js');
const { compareRuns } = require('../src/core/benchmark/analysis.js');
const { buildTrendReport } = require('../src/core/benchmark/trends.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { assertObservabilityReportContract, assertNamedContract } = require('../src/shared/contracts.js');

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
  console.log(`  ${formatManagedInvocation('observability-report', ['report', '--json'])}`);
  console.log(`  ${formatManagedInvocation('observability-report', ['events', '--type', 'coder-loop.round', '--limit', '20'])}`);
  console.log(`  ${formatManagedInvocation('observability-report', ['benchmarks', '--limit', '10'])}`);
  console.log(`  ${formatManagedInvocation('observability-report', ['benchmark-compare', '--json'])}`);
  console.log(`  ${formatManagedInvocation('observability-report', ['benchmark-trends', '--group-by', 'framework', '--json'])}`);
  console.log(`  ${formatManagedInvocation('observability-report', ['benchmark-trends', '--group-by', 'skill-family', '--json'])}`);
}

function printReport(data) {
  console.log('Observability Summary');
  console.log(`Events: ${data.events.event_count}`);
  console.log(`Latest event: ${data.events.latest_at || 'none'}`);
  if (Object.keys(data.events.by_type || {}).length > 0) {
    console.log('Event types:');
    for (const [key, value] of Object.entries(data.events.by_type)) console.log(`- ${key}: ${value}`);
  }
  if (data.events.recent_objectives && data.events.recent_objectives.length > 0) {
    console.log('Recent objectives:');
    for (const item of data.events.recent_objectives) console.log(`- ${item}`);
  }
  console.log('');
  console.log('Benchmark Summary');
  console.log(`Runs: ${data.benchmarks.run_count}`);
  console.log(`Cases: ${data.benchmarks.case_total}`);
  console.log(`Passed: ${data.benchmarks.case_passed}`);
  console.log(`Failed: ${data.benchmarks.case_failed}`);
  console.log(`Pass rate: ${data.benchmarks.pass_rate === null ? 'n/a' : `${data.benchmarks.pass_rate}%`}`);
  console.log(`Task success rate: ${data.benchmarks.task_success_rate === null ? 'n/a' : `${data.benchmarks.task_success_rate}%`}`);
  console.log(`Latest benchmark: ${data.benchmarks.latest_completed_at || 'none'}`);
  if (data.benchmark_compare) {
    console.log('');
    console.log('Latest comparison');
    console.log(`Improved: ${data.benchmark_compare.summary.improved}`);
    console.log(`Regressed: ${data.benchmark_compare.summary.regressed}`);
    console.log(`Pass-rate delta: ${data.benchmark_compare.summary.pass_rate_delta}%`);
    console.log(`Task-success delta: ${data.benchmark_compare.summary.task_success_rate_delta}%`);
  }
  if (data.benchmark_trends) {
    console.log('');
    console.log(`Benchmark trends (${data.benchmark_trends.group_by})`);
    console.log(`Buckets: ${data.benchmark_trends.bucket_count}`);
    console.log(`Improving buckets: ${data.benchmark_trends.summary.directions.improving}`);
    console.log(`Regressing buckets: ${data.benchmark_trends.summary.directions.regressing}`);
  }
}

function computeLatestComparison(runs) {
  if (!Array.isArray(runs) || runs.length < 2) return null;
  return compareRuns(runs[1], runs[0]);
}

function main() {
  try {
    const { cmd, opts } = parseArgs(process.argv);
    const rootDir = String(opts.root || process.cwd());
    const limit = Number(opts.limit || 200);
    if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
      usage();
      return;
    }
    if (cmd === 'report' || cmd === 'status') {
      const events = readEvents(rootDir, { limit });
      const benchmarks = readBenchmarkRuns(rootDir, { limit: Number(opts['benchmark-limit'] || 10) });
      const payload = {
        root_dir: rootDir,
        events: summarizeEvents(events),
        benchmarks: summarizeBenchmarkRuns(benchmarks),
        benchmark_compare: computeLatestComparison(benchmarks),
        benchmark_trends: benchmarks.length > 0 ? buildTrendReport(benchmarks, { groupBy: opts['group-by'] || 'runtime-framework', limit: Number(opts['trend-limit'] || 10) }) : null,
        recent_events: events.slice(0, Number(opts.recent || 10)),
        recent_benchmarks: benchmarks.slice(0, Number(opts['recent-benchmarks'] || 5)),
      };
      if (opts.json) {
        assertObservabilityReportContract(payload);
        process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      } else {
        printReport(payload);
      }
      return;
    }
    if (cmd === 'events') {
      const events = readEvents(rootDir, { limit, type: opts.type, since: opts.since });
      assertNamedContract('observability-events', events);
      process.stdout.write(JSON.stringify(events, null, 2) + '\n');
      return;
    }
    if (cmd === 'benchmarks') {
      const runs = readBenchmarkRuns(rootDir, { limit });
      assertNamedContract('observability-benchmarks', runs);
      process.stdout.write(JSON.stringify(runs, null, 2) + '\n');
      return;
    }
    if (cmd === 'benchmark-compare') {
      const runs = readBenchmarkRuns(rootDir, { limit: Math.max(2, Number(opts.limit || 2)) });
      const payload = computeLatestComparison(runs);
      if (!payload) throw new Error('Need at least two benchmark runs to compare');
      assertNamedContract('benchmark-compare', payload);
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      return;
    }
    if (cmd === 'benchmark-trends') {
      const runs = readBenchmarkRuns(rootDir, { limit: Math.max(1, Number(opts.limit || 10)) });
      if (runs.length === 0) throw new Error('Need at least one benchmark run to compute trends');
      const payload = buildTrendReport(runs, { groupBy: opts['group-by'] || 'runtime-framework', limit: Number(opts.limit || 10) });
      assertNamedContract('benchmark-trends', payload);
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      return;
    }
    throw new Error(`unknown command: ${cmd}`);
  } catch (error) {
    console.error(`[observability-report] ${error.message}`);
    usage();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
