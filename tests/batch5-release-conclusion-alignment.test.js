const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildSummary } = require('../scripts/preflight-production.js');
const { buildBundle } = require('../scripts/release-audit-export.js');
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

test('preflight topline preserves shared release conclusion object', () => {
  const releaseConclusion = {
    schema_version: '1.0',
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

  assert.deepEqual(summary.topline.release_conclusion, releaseConclusion);
  assert.equal(summary.topline.release_decision, releaseConclusion.release_decision);
  assert.equal(summary.topline.release_reason, releaseConclusion.reason);
});

test('audit bundle manifest and evidence share the same release conclusion', () => {
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
    execFileSync('git', ['commit', '-qm', 'record aligned release conclusion fixtures'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'tester', GIT_AUTHOR_EMAIL: 'tester@example.com', GIT_COMMITTER_NAME: 'tester', GIT_COMMITTER_EMAIL: 'tester@example.com' } });
    const rehearsal = runNodeResult(RELEASE_REHEARSAL, ['--policy', 'production', '--json'], { cwd: dir });
    assert.ok([0, 1].includes(rehearsal.code));
    assert.doesNotThrow(() => JSON.parse(rehearsal.stdout));
  }, (dir) => {
    const evidenceResult = runNodeResult(RELEASE_EVIDENCE, ['--policy', 'production', '--json'], { cwd: dir });
    assert.ok([0, 1].includes(evidenceResult.code));
    const evidence = JSON.parse(evidenceResult.stdout);
    const bundle = buildBundle(dir, { policy: 'production' });
    assert.deepEqual(bundle.release_conclusion, evidence.summary.release_conclusion);
    assert.deepEqual(bundle.manifest.release_conclusion, evidence.summary.release_conclusion);
    assert.equal(bundle.release_conclusion.selected_baseline_name, evidence.summary.release_conclusion.selected_baseline_name);
  });
});
