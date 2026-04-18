const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { buildSummary } = require('../scripts/preflight-production.js');
const { buildBundle } = require('../scripts/release-audit-export.js');
const { buildEvidenceSummary } = require('../src/core/release/evidence.js');
const { runReleaseCheck } = require('../src/core/release/check.js');
const { runReleaseRehearsal } = require('../src/core/release/rehearsal.js');
const { withTempDir, writeFiles, initCommittedGitRepo, writeBenchmarkRun, makeBenchmarkResult } = require('./test-helpers.js');

function writeHealthyRuns(dir) {
  for (let i = 1; i <= 8; i += 1) {
    writeBenchmarkRun(dir, {
      run_id: `run-${i}`,
      completed_at: `2026-04-${String(i).padStart(2, '0')}T10:00:00.000Z`,
      results: [makeBenchmarkResult({ passed: true, task_success: true, failed_count: 0, review_verdict: 'ACCEPT' })],
    });
  }
}

function writeFixture(dir) {
  writeFiles(dir, {
    'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0', scripts: { test: 'node --test' }, dependencies: { express: '^4.0.0' } }, null, 2),
    '.gitignore': 'node_modules\n',
    'src/index.js': 'module.exports = {}\n',
  });
}

test('preflight topline exposes primary schema and matching legacy summary', () => {
  const releaseConclusion = {
    schema_version: '1.1',
    release_decision: 'blocked',
    ready_state: 'blocked',
    reason: 'benchmark.baseline_approval: baseline approval required by policy=production',
    release_policy: 'production',
    override_used: false,
    baseline_approved: false,
    benchmark_fresh_enough: true,
    rollback_ready: true,
    canonical_baseline_name: 'release.node-api.production',
    selected_baseline_name: 'release.node-api.production',
    override_pressure_status: 'elevated',
    override_pressure_last_30_days: 2,
  };
  const summary = buildSummary([
    { name: 'lint', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'typecheck', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'build', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'test', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'quality-gate:json', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: '{"status":"pass"}', stderr: '', parsed_json: { status: 'pass' } },
    { name: 'release-check:production', code: 1, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: '{}', stderr: '', parsed_json: {} },
    { name: 'release-evidence:production', code: 1, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: JSON.stringify({ summary: { release_conclusion: releaseConclusion } }), stderr: '', parsed_json: { summary: { release_conclusion: releaseConclusion } } },
  ]);

  assert.deepEqual(summary.topline.release_conclusion_schema.release_conclusion, releaseConclusion);
  assert.equal(summary.topline.release_conclusion_schema.primary_field, 'release_conclusion');
  assert.equal(summary.topline.release_conclusion_schema.legacy_summary.release_reason, releaseConclusion.reason);
  assert.equal(summary.topline.release_reason, summary.topline.release_conclusion_schema.legacy_summary.release_reason);
});

test('release evidence summary keeps release_conclusion primary and topline as compatibility summary', () => {
  const report = {
    decision: 'ready',
    selected_policy: { id: 'production' },
    benchmark_feedback: { release_readiness: { status: 'ready' }, freshness: { status: 'fresh' } },
    benchmark_baseline_naming: { recommended_name: 'release.node-api.production', selected_name: 'release.node-api.production' },
    snapshot_readiness: { ready: true },
    checks: [],
    policy_override: { applied: false },
  };
  const summary = buildEvidenceSummary(report, { decision: 'ready' }, { name: 'release.node-api.production' }, { status: 'approved' }, []);
  assert.equal(summary.release_conclusion_schema.primary_field, 'release_conclusion');
  assert.equal(summary.topline.release_reason, summary.release_conclusion.reason);
  assert.equal(summary.release_decision, summary.release_conclusion.release_decision);
});

test('release-check and release-rehearsal expose compatibility envelope beside release_conclusion', () => {
  withTempDir((dir) => {
    writeFixture(dir);
    initCommittedGitRepo(dir);
    writeHealthyRuns(dir);
  }, (dir) => {
    const check = runReleaseCheck(dir, { policy: 'production' });
    assert.equal(check.release_conclusion_schema.primary_field, 'release_conclusion');
    assert.deepEqual(check.release_conclusion_schema.release_conclusion, check.release_conclusion);

    const rehearsal = runReleaseRehearsal(dir, { policy: 'production' });
    assert.equal(rehearsal.release_conclusion_schema.primary_field, 'release_conclusion');
    assert.deepEqual(rehearsal.release_conclusion_schema.release_conclusion, rehearsal.release_conclusion);
  });
});

test('audit manifest exports stable release conclusion schema and legacy compatibility summary', () => {
  withTempDir((dir) => {
    writeFixture(dir);
    initCommittedGitRepo(dir);
    writeHealthyRuns(dir);
  }, (dir) => {
    const bundle = buildBundle(dir, { policy: 'production' });
    assert.equal(bundle.manifest.release_conclusion_schema.primary_field, 'release_conclusion');
    assert.deepEqual(bundle.manifest.release_conclusion_schema.release_conclusion, bundle.release_conclusion);
    assert.equal(bundle.manifest.release_conclusion_legacy.release_reason, bundle.release_conclusion.reason);
  });
});


test('audit manifest homepage is a first-view release summary', () => {
  withTempDir((dir) => {
    writeFixture(dir);
    initCommittedGitRepo(dir);
    writeHealthyRuns(dir);
  }, (dir) => {
    const bundle = buildBundle(dir, { policy: 'production' });
    assert.equal(bundle.manifest.homepage.title, 'Release audit summary');
    assert.equal(bundle.manifest.homepage.release_conclusion.release_decision, bundle.release_conclusion.release_decision);
    assert.equal(bundle.manifest.homepage.entrypoints.readme, 'README.md');
    assert.equal(bundle.manifest.homepage.schema_name, 'release_audit_summary');
    assert.ok(Array.isArray(bundle.manifest.opening_summary));
    assert.match(bundle.manifest.opening_summary[0], /decision=/);
  });
});
