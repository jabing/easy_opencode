const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles, initCommittedGitRepo, writeBenchmarkRun, makeBenchmarkResult } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const QUALITY_GATE = path.join(ROOT, 'scripts', 'quality-gate.js');
const REVIEW_GATE = path.join(ROOT, 'scripts', 'review-gate.js');
const RELEASE_EVIDENCE = path.join(ROOT, 'scripts', 'release-evidence.js');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');

function writeHealthyRuns(dir) {
  for (let i = 1; i <= 6; i += 1) {
    writeBenchmarkRun(dir, {
      run_id: `run-${i}`,
      completed_at: `2026-04-${String(i).padStart(2, '0')}T10:00:00.000Z`,
      results: [makeBenchmarkResult({ passed: true, task_success: true, failed_count: 0, review_verdict: 'ACCEPT' })],
    });
  }
}

test('quality-gate emits evidence bundle', () => {
  const report = runNodeJson(QUALITY_GATE, ['--json'], { cwd: ROOT });
  assert.ok(report.evidence_bundle);
  assert.equal(report.evidence_bundle.gate.gate_id, 'quality-gate');
  assert.equal(report.evidence_bundle.summary.count >= 1, true);
  assert.equal(report.evidence_bundle.evidence[0].type, 'quality-gate-results');
});

test('review-gate emits evidence bundle with gate evaluation', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', scripts: { build: 'echo build', lint: 'echo lint', test: 'node --test' } }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'export const value = 1;\n',
    });
    initCommittedGitRepo(dir);
    writeFiles(dir, {
      'src/index.js': 'export const value = 2;\n',
    });
  }, (dir) => {
    const report = runNodeJson(REVIEW_GATE, ['report', '--json'], { cwd: dir });
    assert.ok(report.evidence_bundle);
    assert.equal(report.evidence_bundle.gate.gate_id, 'merge-review-gate');
    assert.equal(report.evidence_bundle.summary.by_type['git-change-scope'], 1);
    assert.ok(Array.isArray(report.evidence_bundle.gate.rules));
  });
});

test('release-evidence emits evidence bundle with release gate evaluation', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'fixture-node', version: '1.0.0', scripts: { test: 'node --test' } }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'export const value = 1;\n',
    });
    initCommittedGitRepo(dir);
    writeHealthyRuns(dir);
    runNodeJson(BENCHMARK_SUITE, ['baseline', '--name', 'release', '--latest', '--json'], { cwd: dir });
    runNodeJson(BENCHMARK_SUITE, ['approve', '--name', 'release', '--json'], { cwd: dir });
  }, (dir) => {
    const report = runNodeJson(RELEASE_EVIDENCE, ['--json'], { cwd: dir });
    assert.ok(report.evidence_bundle);
    assert.equal(report.evidence_bundle.gate.gate_id, 'release-evidence-gate');
    assert.equal(report.evidence_bundle.summary.by_type['release-report'], 1);
    assert.ok(['ready', 'caution', 'blocked'].includes(report.evidence_bundle.gate.decision));
  });
});
