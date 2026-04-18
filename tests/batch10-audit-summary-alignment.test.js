const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildSummary } = require('../scripts/preflight-production.js');
const { buildBundle } = require('../scripts/release-audit-export.js');
const { buildReleaseAuditSummary } = require('../src/core/release/audit-summary.js');
const { buildEvidenceSummary } = require('../src/core/release/evidence.js');
const { initCommittedGitRepo, makeBenchmarkResult, runNodeJson, runNodeResult, withTempDir, writeBenchmarkRun, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');
const RELEASE_REHEARSAL = path.join(ROOT, 'scripts', 'release-rehearsal.js');
const RELEASE_EVIDENCE = path.join(ROOT, 'scripts', 'release-evidence.js');

function writeHealthyRuns(dir) {
  for (let i = 1; i <= 8; i += 1) {
    writeBenchmarkRun(dir, {
      run_id: `run-${i}`,
      completed_at: `2026-04-${String(i).padStart(2, '0')}T10:00:00.000Z`,
      results: [makeBenchmarkResult({ passed: true, task_success: true, failed_count: 0, review_verdict: 'ACCEPT' })],
    });
  }
}

test('release-evidence summary now includes stable audit_summary schema', () => {
  const report = {
    decision: 'blocked',
    selected_policy: { id: 'production' },
    checks: [
      { status: 'fail', check: 'benchmark.baseline_approval', detail: 'baseline approval required by policy=production' },
    ],
    snapshot_readiness: { ready: true },
    benchmark_feedback: {
      release_readiness: { status: 'ready' },
      freshness: { status: 'fresh' },
    },
    benchmark_baseline_naming: {
      recommended_name: 'release.node-api.production',
      selected_name: 'release.node-api.production',
    },
  };
  const summary = buildEvidenceSummary(report, { decision: 'ready' }, { name: 'release.node-api.production' }, { status: 'approved' }, []);
  assert.equal(summary.audit_summary.schema_name, 'release_audit_summary');
  assert.equal(summary.audit_summary.release_conclusion.release_decision, summary.release_conclusion.release_decision);
  assert.equal(summary.audit_summary.baseline_status, summary.baseline_status);
  assert.equal(summary.audit_summary.approval_status, summary.approval_status);
  assert.equal(summary.audit_summary.rollback_ready, summary.release_conclusion.rollback_ready);
});

test('preflight topline audit_summary remains schema-compatible with evidence and audit export', () => {
  const releaseConclusion = {
    schema_version: '1.1',
    release_decision: 'ready',
    ready_state: 'ready',
    reason: 'all required checks satisfied',
    release_policy: 'production',
    override_used: false,
    baseline_approved: true,
    benchmark_fresh_enough: true,
    rollback_ready: true,
    canonical_baseline_name: 'release.node-api.production',
    selected_baseline_name: 'release.node-api.production',
    override_pressure_status: 'none',
    override_pressure_last_30_days: 0,
  };
  const evidenceSummary = {
    release_conclusion: releaseConclusion,
    final_decision_summary: 'decision=ready | benchmark=ready/fresh | baseline=present/approved | rehearsal=ready | baseline_name=release.node-api.production',
    why_blocked_or_caution: [],
    benchmark_readiness: 'ready',
    benchmark_freshness: 'fresh',
    baseline_status: 'present',
    approval_status: 'approved',
    latest_rehearsal_decision: 'ready',
    rollback_ready: true,
    override_pressure: { status: 'none', last_30_days_count: 0 },
  };
  const preflight = buildSummary([
    { name: 'lint', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'typecheck', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'build', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'test', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: 'ok\n', stderr: '', parsed_json: null },
    { name: 'quality-gate:json', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: '{"status":"pass"}', stderr: '', parsed_json: { status: 'pass' } },
    { name: 'release-check:production', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: '{}', stderr: '', parsed_json: {} },
    { name: 'release-evidence:production', code: 0, signal: null, timed_out: false, duration_ms: 5, timeout_ms: 1000, stdout: JSON.stringify({ summary: evidenceSummary }), stderr: '', parsed_json: { summary: evidenceSummary } },
  ]);
  const direct = buildReleaseAuditSummary({
    preflight_decision: 'ready',
    policy: 'production',
    baseline_name: 'release.node-api.production',
    release_conclusion: releaseConclusion,
    final_decision_summary: releaseConclusion.reason,
    why_blocked_or_caution: [],
    benchmark_readiness: evidenceSummary.benchmark_readiness,
    benchmark_freshness: evidenceSummary.benchmark_freshness,
    baseline_status: evidenceSummary.baseline_status,
    approval_status: evidenceSummary.approval_status,
    latest_rehearsal_decision: evidenceSummary.latest_rehearsal_decision,
    rollback_ready: true,
    override_pressure: { status: 'none', last_30_days_count: 0 },
  });
  assert.deepEqual(preflight.topline.audit_summary, direct);
});

test('repository evidence and audit export share the same audit summary core fields', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0', scripts: { test: 'node --test' }, dependencies: { express: '^4.0.0' } }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'module.exports = {}\n',
    });
    initCommittedGitRepo(dir);
    writeHealthyRuns(dir);
    runNodeJson(BENCHMARK_SUITE, ['baseline', '--profile', 'node-api', '--policy', 'production', '--latest', '--json'], { cwd: dir });
    runNodeJson(BENCHMARK_SUITE, ['approve', '--profile', 'node-api', '--policy', 'production', '--json'], { cwd: dir });
    execFileSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' });
    execFileSync('git', ['commit', '-qm', 'record audit summary alignment fixtures'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'tester', GIT_AUTHOR_EMAIL: 'tester@example.com', GIT_COMMITTER_NAME: 'tester', GIT_COMMITTER_EMAIL: 'tester@example.com' } });
    const rehearsal = runNodeResult(RELEASE_REHEARSAL, ['--policy', 'production', '--json'], { cwd: dir });
    assert.ok([0, 1].includes(rehearsal.code));
  }, (dir) => {
    const evidenceResult = runNodeResult(RELEASE_EVIDENCE, ['--policy', 'production', '--json'], { cwd: dir });
    assert.ok([0, 1].includes(evidenceResult.code));
    const evidence = JSON.parse(evidenceResult.stdout);
    const bundle = buildBundle(dir, { policy: 'production' });

    assert.equal(evidence.summary.audit_summary.schema_name, 'release_audit_summary');
    assert.deepEqual(evidence.summary.audit_summary.release_conclusion, bundle.homepage.release_conclusion);
    assert.equal(evidence.summary.audit_summary.baseline_status, bundle.homepage.baseline_status);
    assert.equal(evidence.summary.audit_summary.approval_status, bundle.homepage.approval_status);
    assert.equal(evidence.summary.audit_summary.override_pressure.status, bundle.homepage.override_pressure.status);
  });
});
