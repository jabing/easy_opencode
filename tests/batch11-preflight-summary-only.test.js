const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { buildStepPlan, buildSummary, printSummaryOnly } = require('../scripts/preflight-production.js');

const ROOT = path.resolve(__dirname, '..');

test('printSummaryOnly emits stable release_audit_summary json payload', () => {
  const releaseEvidence = {
    summary: {
      release_conclusion: {
        schema_version: '1.1',
        release_decision: 'blocked',
        ready_state: 'blocked',
        reason: 'baseline approval required by policy=production',
        release_policy: 'production',
        override_used: false,
        baseline_approved: false,
        benchmark_fresh_enough: true,
        rollback_ready: true,
        canonical_baseline_name: 'release.node-api.production',
        selected_baseline_name: 'release.node-api.production',
        override_pressure_status: 'present',
        override_pressure_last_30_days: 1,
      },
      final_decision_summary: 'baseline approval required by policy=production',
      why_blocked_or_caution: ['benchmark.baseline_approval: baseline approval required by policy=production'],
      benchmark_readiness: 'ready',
      benchmark_freshness: 'fresh',
      baseline_status: 'present',
      approval_status: 'missing',
      latest_rehearsal_decision: 'ready',
      override_pressure: { status: 'present', last_30_days_count: 1 },
    },
  };
  const summary = buildSummary([
    { name: 'lint', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'typecheck', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'build', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'test', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'quality-gate:json', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: '{"status":"pass"}', stderr: '', parsed_json: { status: 'pass' } },
    { name: 'release-check:production', code: 1, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: '{}', stderr: '', parsed_json: {} },
    { name: 'release-evidence:production', code: 1, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: JSON.stringify(releaseEvidence), stderr: '', parsed_json: releaseEvidence },
  ]);

  let output = '';
  const write = process.stdout.write;
  process.stdout.write = (chunk) => {
    output += String(chunk);
    return true;
  };
  try {
    printSummaryOnly(summary, true);
  } finally {
    process.stdout.write = write;
  }
  const payload = JSON.parse(output);
  assert.equal(payload.schema_name, 'release_audit_summary');
  assert.equal(payload.preflight_decision, 'blocked');
  assert.equal(payload.release_conclusion.release_decision, 'blocked');
  assert.equal(payload.override_pressure.status, 'present');
});


test('buildStepPlan supports explicit and automatic test skipping for summary-only preflight', () => {
  const explicit = buildStepPlan({ 'skip-step': 'test' }, {});
  assert.ok(!explicit.some((step) => step.name === 'test'));

  const auto = buildStepPlan({ 'summary-only': true }, { npm_lifecycle_event: 'test' });
  assert.ok(!auto.some((step) => step.name === 'test'));

  const normal = buildStepPlan({ 'summary-only': true }, { npm_lifecycle_event: 'preflight:production' });
  assert.ok(normal.some((step) => step.name === 'test'));
});

test('repository preflight supports summary-only json mode', () => {
  const { runNodeResult } = require('./test-helpers.js');
  const result = runNodeResult(path.join(ROOT, 'scripts', 'preflight-production.js'), ['--json', '--summary-only', '--skip-step', 'test', '--step-timeout-ms', '2000'], { cwd: ROOT, env: { CI: '1' } });
  assert.notEqual(result.code, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema_name, 'release_audit_summary');
  assert.equal(typeof report.release_conclusion.release_decision, 'string');
  assert.equal(typeof report.override_pressure.status, 'string');
});
