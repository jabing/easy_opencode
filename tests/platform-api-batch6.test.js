const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { createRunRecord, saveRunRecord, updateRunRecord } = require('../src/control-plane/kernel/run-store.js');
const { appendKernelEvent } = require('../src/control-plane/kernel/event-log.js');
const { persistWorkflowTrace } = require('../src/control-plane/workflow/engine.js');
const { buildSnapshot } = require('../scripts/platform-report.js');
const { runNodeJson, withTempDir, writeFiles, initCommittedGitRepo, writeBenchmarkRun, makeBenchmarkResult, runNodeResult } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');
const RELEASE_REHEARSAL = path.join(ROOT, 'scripts', 'release-rehearsal.js');
const PLATFORM_REPORT = path.join(ROOT, 'scripts', 'platform-report.js');

function writeHealthyRuns(dir) {
  for (let i = 1; i <= 8; i += 1) {
    writeBenchmarkRun(dir, {
      run_id: `run-${i}`,
      completed_at: `2026-04-${String(i).padStart(2, '0')}T10:00:00.000Z`,
      results: [makeBenchmarkResult({ passed: true, task_success: true, failed_count: 0, review_verdict: 'ACCEPT' })],
    });
  }
}

test('platform snapshot exposes API-first runs, release, telemetry, and artifacts', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0', scripts: { test: 'node --test' }, dependencies: { express: '^4.0.0' } }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'module.exports = {}\n',
    });
    initCommittedGitRepo(dir);
    const record = saveRunRecord(createRunRecord({
      root_dir: dir,
      run_id: 'plan-001',
      workflow: 'implement-task',
      flow: 'implement-task',
      objective: 'Ship API-first batch6 snapshot',
      source_kind: 'plan',
      source_id: 'plan-001',
      status: 'planning',
      steps: [{ step_id: 'detect', status: 'pending' }],
      artifacts: [{ id: 'plan-artifact', type: 'plan', path: '.opencode/implementation-plans/plan-001/plan.json' }],
      summary: { trace_id: 'trace-001' },
    }));
    updateRunRecord(dir, record.run_id, (current) => ({ ...current, status: 'executing', steps: [{ step_id: 'detect', status: 'succeeded' }] }));
    appendKernelEvent(dir, { run_id: 'plan-001', event_type: 'workflow.started', summary: 'implement-task started' });
    persistWorkflowTrace(dir, 'implement-task', 'trace-001', {
      trace_id: 'trace-001',
      workflow_id: 'implement-task',
      run_id: 'plan-001',
      started_at: '2026-04-13T10:00:00.000Z',
      finished_at: '2026-04-13T10:01:00.000Z',
      status: 'succeeded',
      steps: [{ step_id: 'detect-project-profile', status: 'succeeded', summary: 'done' }],
    });
    writeHealthyRuns(dir);
    runNodeJson(BENCHMARK_SUITE, ['baseline', '--profile', 'node-api', '--policy', 'production', '--latest', '--json'], { cwd: dir });
    runNodeJson(BENCHMARK_SUITE, ['approve', '--profile', 'node-api', '--policy', 'production', '--json'], { cwd: dir });
    execFileSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' });
    execFileSync('git', ['commit', '-qm', 'record platform batch6 fixtures'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'tester', GIT_AUTHOR_EMAIL: 'tester@example.com', GIT_COMMITTER_NAME: 'tester', GIT_COMMITTER_EMAIL: 'tester@example.com' } });
    const rehearsal = runNodeResult(RELEASE_REHEARSAL, ['--policy', 'production', '--json'], { cwd: dir });
    assert.ok([0, 1].includes(rehearsal.code));
  }, (dir) => {
    const payload = buildSnapshot(dir, { policy: 'production' });
    assert.equal(payload.schema_name, 'platform_api_snapshot');
    assert.equal(payload.runs.length >= 1, true);
    assert.equal(payload.active_run.run_id, 'plan-001');
    assert.equal(payload.run_timelines[0].schema_name, 'platform_run_timeline');
    assert.equal(payload.release.schema_name, 'platform_release_record');
    assert.equal(payload.telemetry.schema_name, 'platform_telemetry_summary');
    assert.equal(payload.artifact_index.schema_name, 'platform_artifact_index');
    assert.equal(payload.release.decision_package.schema_name, 'platform_release_decision_package');
    assert.ok(Array.isArray(payload.release.audit_trail));
  });
});

test('platform-report CLI exposes exporters and UI overview payload', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0', scripts: { test: 'node --test' } }, null, 2),
      'src/index.js': 'module.exports = {}\n',
    });
    initCommittedGitRepo(dir);
  }, (dir) => {
    const exporters = runNodeJson(PLATFORM_REPORT, ['exporters'], { cwd: dir });
    assert.equal(exporters.schema_name, 'platform_exporters');
    assert.equal(exporters.exporters.some((item) => item.id === 'platform-json'), true);
    const overview = runNodeJson(PLATFORM_REPORT, ['ui-overview'], { cwd: dir });
    assert.equal(overview.schema_name, 'platform_ui_overview');
    assert.equal(Array.isArray(overview.cards), true);
    assert.equal(overview.cards.length >= 1, true);
  });
});


test('unified event log captures kernel and observability events through one store', () => {
  withTempDir(() => {}, (dir) => {
    const { appendEvent, readEvents } = require('../src/control-plane/observability/index.js');
    appendKernelEvent(dir, { run_id: 'run-1', event_type: 'workflow.started', summary: 'start' });
    appendEvent(dir, 'delivery-report.generated', { run_id: 'run-1', flow: 'delivery', status: 'ok' });
    const events = readEvents(dir, { limit: 10, reverse: false });
    assert.equal(events.length >= 2, true);
    assert.equal(events.some((event) => event.channel === 'kernel' && event.type === 'workflow.started'), true);
    assert.equal(events.some((event) => event.channel === 'observability' && event.type === 'delivery-report.generated'), true);
  });
});
