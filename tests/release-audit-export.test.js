const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { initCommittedGitRepo, makeBenchmarkResult, runNodeJson, withTempDir, writeBenchmarkRun, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');
const RELEASE_AUDIT = path.join(ROOT, 'scripts', 'release-audit-export.js');
const RELEASE_REHEARSAL = path.join(ROOT, 'scripts', 'release-rehearsal.js');

function writeHealthyRuns(dir) {
  for (let i = 1; i <= 8; i += 1) {
    writeBenchmarkRun(dir, {
      run_id: `run-${i}`,
      completed_at: `2026-04-${String(i).padStart(2, '0')}T10:00:00.000Z`,
      results: [makeBenchmarkResult({ passed: true, task_success: true, failed_count: 0, review_verdict: 'ACCEPT' })],
    });
  }
}

test('release audit export writes a stable read-only bundle', () => {
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
    execFileSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' });
    execFileSync('git', ['commit', '-qm', 'record release audit fixtures'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'tester', GIT_AUTHOR_EMAIL: 'tester@example.com', GIT_COMMITTER_NAME: 'tester', GIT_COMMITTER_EMAIL: 'tester@example.com' } });
    runNodeJson(RELEASE_REHEARSAL, ['--policy', 'production', '--json'], { cwd: dir });
  }, (dir) => {
    const out = path.join(dir, 'audit.json');
    const result = runNodeJson(RELEASE_AUDIT, ['--policy', 'production', '--out', out, '--json'], { cwd: dir });
    const bundle = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(result.decision, 'exported');
    assert.equal(bundle.policy, 'production');
    assert.equal(bundle.manifest.homepage.release_conclusion.release_decision, bundle.release_conclusion.release_decision);
    assert.equal(bundle.manifest.homepage.schema_name, 'release_audit_summary');
    assert.equal(bundle.manifest.homepage.entrypoints.summary, 'summary.json');
    assert.ok(bundle.evidence.summary.final_decision_summary);
    assert.ok(bundle.release_check);
    assert.ok(bundle.rehearsal);
    assert.ok(Array.isArray(bundle.observability_events));
  });
});
