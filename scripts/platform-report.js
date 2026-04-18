#!/usr/bin/env node
const { listRunRecords, loadActiveRunRecord } = require('../src/control-plane/kernel/run-store.js');
const { buildRunSummary, buildRunTimeline, buildArtifactIndex, buildTelemetrySummary } = require('../src/control-plane/platform/api-models.js');
const { buildReleaseRecord } = require('../src/control-plane/platform/release-registry.js');
const { createDefaultTelemetryRegistry } = require('../src/control-plane/platform/telemetry-registry.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { assertPlatformSnapshotContract } = require('../src/shared/contracts.js');

function parseArgs(argv) {
  const cmd = argv[2] || 'report';
  const opts = { _: [] };
  for (let i = 3; i < argv.length; i += 1) {
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
  console.log(`  ${formatManagedInvocation('platform-report', ['report', '--json'])}`);
  console.log(`  ${formatManagedInvocation('platform-report', ['runs', '--json'])}`);
  console.log(`  ${formatManagedInvocation('platform-report', ['release', '--policy', 'production', '--json'])}`);
  console.log(`  ${formatManagedInvocation('platform-report', ['exporters', '--json'])}`);
  console.log(`  ${formatManagedInvocation('platform-report', ['ui-overview', '--json'])}`);
}

function buildSnapshot(rootDir, opts = {}) {
  const runs = listRunRecords(rootDir);
  const activeRun = loadActiveRunRecord(rootDir);
  const release = buildReleaseRecord(rootDir, {
    policy: opts.policy || 'production',
    baselineName: opts['baseline-name'] || null,
    eventLimit: Number(opts['event-limit'] || 100),
    now: opts.now || null,
    overrideId: opts['override-id'] || null,
  });
  return {
    schema_name: 'platform_api_snapshot',
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    root_dir: rootDir,
    telemetry: buildTelemetrySummary(rootDir),
    active_run: buildRunSummary(activeRun, rootDir),
    runs: runs.map((run) => buildRunSummary(run, rootDir)),
    run_timelines: runs.slice(0, Number(opts['timeline-limit'] || 5)).map((run) => buildRunTimeline(rootDir, run)),
    artifact_index: buildArtifactIndex(rootDir, runs),
    release,
  };
}

function main() {
  try {
    const { cmd, opts } = parseArgs(process.argv);
    const rootDir = String(opts.root || process.cwd());
    const registry = createDefaultTelemetryRegistry();
    if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
      usage();
      return;
    }
    if (cmd === 'exporters') {
      process.stdout.write(JSON.stringify({ schema_name: 'platform_exporters', schema_version: '1.0', exporters: registry.list() }, null, 2) + '\n');
      return;
    }
    const snapshot = buildSnapshot(rootDir, opts);
    if (cmd === 'report') {
      assertPlatformSnapshotContract(snapshot);
      process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');
      return;
    }
    if (cmd === 'runs') {
      const payload = { schema_name: 'platform_runs_view', schema_version: '1.0', generated_at: snapshot.generated_at, root_dir: snapshot.root_dir, active_run: snapshot.active_run, runs: snapshot.runs, run_timelines: snapshot.run_timelines };
      assertPlatformSnapshotContract(payload);
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      return;
    }
    if (cmd === 'release') {
      const payload = { ...snapshot.release, schema_name: snapshot.release.schema_name || 'platform_release_view', schema_version: snapshot.release.schema_version || '1.0', generated_at: snapshot.generated_at, root_dir: snapshot.root_dir };
      assertPlatformSnapshotContract(payload);
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      return;
    }
    if (cmd === 'ui-overview') {
      process.stdout.write(JSON.stringify(registry.run('ui-overview', snapshot, opts), null, 2) + '\n');
      return;
    }
    throw new Error(`unknown command: ${cmd}`);
  } catch (error) {
    console.error(`[platform-report] ${error.message}`);
    usage();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildSnapshot,
};
