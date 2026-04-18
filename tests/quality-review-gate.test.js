const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles, initCommittedGitRepo } = require('./test-helpers.js');
const { validateMetadataConsistency } = require('../src/core/checks/metadata-shared.js');

const ROOT = path.resolve(__dirname, '..');
const QUALITY_GATE = path.join(ROOT, 'scripts', 'quality-gate.js');
const REVIEW_GATE = path.join(ROOT, 'scripts', 'review-gate.js');

test('quality-gate full json output stays stable on the plugin workspace', () => {
  const report = runNodeJson(QUALITY_GATE, ['--full', '--strict', '--json'], { cwd: ROOT });
  assert.equal(report.gate, 'PASS');
  assert.equal(report.strict, true);
  assert.equal(report.full, true);
  assert.deepEqual(report.counts, { pass: 13, fail: 0, warn: 0, skip: 0 });

  const checks = Object.fromEntries(report.results.map((item) => [item.check, item]));
  assert.deepEqual(checks['package.json'], { status: 'pass', check: 'package.json', detail: 'present' });
  assert.deepEqual(checks['.gitignore'], { status: 'pass', check: '.gitignore', detail: 'present' });
  assert.deepEqual(checks['package.publish_hygiene'], { status: 'pass', check: 'package.publish_hygiene', detail: 'runtime state excluded from publish whitelist' });
  assert.deepEqual(checks['.opencode/command-policy.json'], { status: 'pass', check: '.opencode/command-policy.json', detail: 'present' });
  assert.deepEqual(checks['package.json.parse'], { status: 'pass', check: 'package.json.parse', detail: 'valid JSON' });
  assert.deepEqual(checks['static.scan.failures'], { status: 'pass', check: 'static.scan.failures', detail: 'none' });
  assert.deepEqual(checks['static.scan.warnings'], { status: 'pass', check: 'static.scan.warnings', detail: 'none' });
  assert.deepEqual(checks['skills.registry'], { status: 'pass', check: 'skills.registry', detail: 'ok' });
  assert.equal(checks['skills.metadata'].status, 'pass');
  assert.match(checks['skills.metadata'].detail, /^ok skills=\d+ failures=0 warnings=\d+/);
  const metadata = validateMetadataConsistency(ROOT);
  assert.deepEqual(checks['metadata.consistency'], { status: 'pass', check: 'metadata.consistency', detail: metadata.detail });
  assert.equal(checks['script:lint'].status, 'pass');
  assert.equal(checks['script:lint'].check, 'script:lint');
  assert.match(checks['script:lint'].detail, /^ok \(files=\d+; errors=0; warnings=0\)$/);
  assert.equal(checks['script:typecheck'].status, 'pass');
  assert.equal(checks['script:typecheck'].check, 'script:typecheck');
  assert.match(checks['script:typecheck'].detail, /^ok \(checked=\d+; total=\d+; quarantined=\d+\)$/);
  assert.equal(checks['script:build'].status, 'pass');
  assert.equal(checks['script:build'].check, 'script:build');
  assert.match(checks['script:build'].detail, /^ok \(.+mode=production-pipeline\)$/);
});

test('quality-gate skips package publish hygiene outside the plugin workspace', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'plain-node-app',
        scripts: { lint: 'echo lint', build: 'echo build', test: 'node --test' },
      }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'export const value = 1;\n',
    });
  }, (dir) => {
    const report = runNodeJson(QUALITY_GATE, ['--json'], { cwd: dir });
    const packageCheck = report.results.find((item) => item.check === 'package.publish_hygiene');
    assert.equal(report.gate, 'PASS');
    assert.deepEqual(packageCheck, {
      status: 'skip',
      check: 'package.publish_hygiene',
      detail: 'not applicable outside plugin workspace',
    });
  });
});

test('review-gate reports followups instead of blocking for a generic source-only node change', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'fixture-node',
        scripts: { build: 'echo build', lint: 'echo lint', test: 'node --test' },
      }, null, 2),
      '.gitignore': 'node_modules\n',
      'src/index.js': 'export const value = 1;\n',
    });
    initCommittedGitRepo(dir);
    writeFiles(dir, {
      'src/index.js': 'export const value = 2;\n',
    });
  }, (dir) => {
    const report = runNodeJson(REVIEW_GATE, ['report', '--json'], { cwd: dir });
    const normalized = {
      verdict: report.verdict,
      changed_files: report.scope_summary.changed_files,
      changed_file_count: report.scope_summary.changed_file_count,
      test_file_count: report.scope_summary.test_file_count,
      source_file_count: report.scope_summary.source_file_count,
      quality_gate: report.status_inputs.quality_gate,
      benchmark_feedback: report.status_inputs.benchmark_feedback,
      findings: {
        correctness: report.findings.correctness,
        test_gap: report.findings.test_gap,
        interface_risk: report.findings.interface_risk,
      },
      followups: report.merge_risk_summary.followups,
    };

    assert.deepEqual(normalized, {
      verdict: 'ACCEPT_WITH_FOLLOWUPS',
      changed_files: ['src/index.js'],
      changed_file_count: 1,
      test_file_count: 0,
      source_file_count: 1,
      quality_gate: {
        gate: 'PASS',
        counts: { pass: 5, fail: 0, warn: 0, skip: 6 },
        mode: 'fast',
      },
      benchmark_feedback: {
        risk_level: 'unknown',
        risk_score: 0,
        confidence: 0,
        strategy_bias: 'balanced',
        review_gate_required: false,
      },
      findings: {
        correctness: [],
        test_gap: [
          {
            file: 'src/index.js',
            line: null,
            issue: 'source code changed without corresponding test changes',
            fix: 'Add or update tests that exercise the new behavior and key regressions.',
            severity: 'MEDIUM',
          },
        ],
        interface_risk: [],
      },
      followups: ['source changes lack test updates'],
    });
  });
});
