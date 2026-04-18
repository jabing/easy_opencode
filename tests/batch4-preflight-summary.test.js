const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { buildSummary } = require('../scripts/preflight-production.js');
const { buildOverridePressure } = require('../src/core/release/evidence.js');

const ROOT = path.resolve(__dirname, '..');

test('preflight summary surfaces release evidence and baseline naming in topline', () => {
  const quality = { schema_version: '1.0', status: 'pass' };
  const releaseCheck = {
    decision: 'blocked',
    benchmark_baseline_naming: {
      recommended_name: 'release.node-api.production',
      selected_name: 'release.node-api.production',
    },
    checks: [
      { status: 'fail', check: 'benchmark.baseline_approval', detail: 'baseline approval required by policy=production' },
    ],
  };
  const releaseEvidence = {
    summary: {
      topline: {
        release_decision: 'blocked',
        reason: 'benchmark.baseline_approval: baseline approval required by policy=production',
        override_used: false,
        baseline_approved: false,
        benchmark_fresh_enough: true,
        rollback_ready: true,
        canonical_baseline_name: 'release.node-api.production',
        selected_baseline_name: 'release.node-api.production',
        override_pressure_status: 'elevated',
        override_pressure_last_30_days: 2,
      },
      override_pressure: {
        status: 'elevated',
        last_30_days_count: 2,
      },
    },
  };

  const summary = buildSummary([
    { name: 'lint', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'typecheck', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'build', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'test', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'quality-gate:json', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: JSON.stringify(quality), stderr: '', parsed_json: quality },
    { name: 'release-check:production', code: 1, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: JSON.stringify(releaseCheck), stderr: '', parsed_json: releaseCheck },
    { name: 'release-evidence:production', code: 1, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: JSON.stringify(releaseEvidence), stderr: '', parsed_json: releaseEvidence },
  ]);

  assert.equal(summary.decision, 'blocked');
  assert.equal(summary.topline.release_decision, 'blocked');
  assert.equal(summary.topline.canonical_baseline_name, 'release.node-api.production');
  assert.equal(summary.topline.selected_baseline_name, 'release.node-api.production');
  assert.equal(summary.topline.override_pressure_status, 'elevated');
  assert.equal(summary.topline.override_pressure_last_30_days, 2);

  assert.equal(summary.topline.audit_summary.schema_name, 'release_audit_summary');
  assert.equal(summary.topline.audit_summary.preflight_decision, 'blocked');
  assert.equal(summary.topline.audit_summary.release_conclusion.release_decision, 'blocked');
  assert.equal(summary.topline.audit_summary.override_pressure.status, 'elevated');
  assert.match(summary.topline.release_reason, /baseline approval/i);
});

test('override pressure distinguishes repeated recent overrides from no override history', () => {
  const now = new Date('2026-04-13T12:00:00.000Z').toISOString();
  const pressure = buildOverridePressure([
    { status: 'approved', updated_at: now, policy: { id: 'production' }, allowed_checks: ['benchmark.latest_comparison'] },
    { status: 'approved', updated_at: now, policy: { id: 'production' }, allowed_checks: ['benchmark.latest_comparison'] },
    { status: 'approved', updated_at: now, policy: { id: 'standard' }, allowed_checks: ['benchmark.scope_coverage'] },
  ]);
  assert.equal(pressure.status, 'high');
  assert.equal(pressure.last_30_days_count, 3);
  assert.ok(pressure.repeated_checks_last_30_days.some((item) => item.check === 'benchmark.latest_comparison'));

  const none = buildOverridePressure([]);
  assert.equal(none.status, 'none');
  assert.equal(none.last_30_days_count, 0);
});

test('repository preflight still emits json on blocked result', () => {
  const { runNodeResult } = require('./test-helpers.js');
  const result = runNodeResult(path.join(ROOT, 'scripts', 'preflight-production.js'), ['--json', '--step-timeout-ms', '2000'], { cwd: ROOT, env: { CI: '1' } });
  assert.notEqual(result.code, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.decision, 'blocked');
  assert.ok(report.topline);
  assert.equal(typeof report.topline.override_pressure_status, 'string');
  assert.equal(report.topline.audit_summary.schema_name, 'release_audit_summary');
  assert.ok(report.steps.every((item) => typeof item.timeout_ms === 'number'));
});
