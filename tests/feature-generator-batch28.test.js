const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { withTempDir, writeFiles, initCommittedGitRepo, runNodeJson } = require('./test-helpers.js');
const { buildNextPromptText } = require('../scripts/coder-loop.js');
const { runMergeGate } = require('../scripts/review-gate.js');

const ROOT = path.resolve(__dirname, '..');
const SAFE_APPLY = path.join(ROOT, 'scripts', 'safe-apply.js');
const BENCHMARK_SUITE = path.join(ROOT, 'scripts', 'benchmark-suite.js');

function fixtureFiles() {
  return {
    'package.json': JSON.stringify({
      name: 'coder-fixture',
      version: '1.0.0',
      scripts: { test: 'node --test tests/auth.test.js' },
    }, null, 2),
    '.gitignore': 'node_modules\n',
    'src/auth.ts': 'export async function refreshToken(id) { return `${id}:ok`; }\n',
    'src/index.ts': 'export { refreshToken } from "./auth";\n',
    'src/router.ts': 'export function register(router) { return router; }\n',
    'tests/auth.test.js': 'const test = require("node:test"); test("ok", () => {});\n',
  };
}

function writeCoderRun(root, touched = []) {
  writeFiles(root, {
    '.opencode/coder-loop/latest.json': JSON.stringify({ run_id: 'coder-1', latest_failures: [{ kind: 'import_resolve', message: 'missing import' }] }, null, 2),
    '.opencode/coder-loop/coder-1.json': JSON.stringify({
      run_id: 'coder-1',
      objective: 'fix refresh token import',
      root_dir: root,
      status: 'needs_fix',
      checks: [{ kind: 'test', command: 'npm test' }],
      latest_failures: [{ kind: 'import_resolve', category: 'import_resolve', file: 'src/auth.ts', message: 'missing import' }],
      context: {
        profile: { runtime: 'node', language: 'typescript', framework: 'express', package_manager: 'npm' },
        style_contract: { controller_pattern: 'controller-service', async_style: 'async-await' },
        targets: [{ path: 'src/auth.ts', exports: ['refreshToken'], symbols: ['refreshToken'], related_tests: ['tests/auth.test.js'] }],
        related_tests: ['tests/auth.test.js'],
        omitted_targets: [],
        omitted_related_tests: [],
        change_surface: {
          candidate_edit_files: [
            { path: 'src/auth.ts', score: 5 },
            { path: 'src/index.ts', score: 3 },
            { path: 'tests/auth.test.js', score: 2 },
          ],
          direct_neighbors: ['src/index.ts'],
          test_neighbors: ['tests/auth.test.js'],
          high_risk_neighbors: ['src/router.ts'],
        },
        edit_strategy: { edit_mode: 'surgical', allowed_files: 3 },
      },
    }, null, 2),
  });
  for (const file of touched) {
    writeFiles(root, { [file]: `// changed ${file}\n` });
  }
}

test('safe-apply status reports patch assessment against latest coder run', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixtureFiles());
    initCommittedGitRepo(dir);
    writeCoderRun(dir, ['src/auth.ts', 'src/index.ts', 'src/router.ts', 'tests/auth.test.js']);
  }, (dir) => {
    const report = runNodeJson(SAFE_APPLY, ['status'], { cwd: dir });
    assert.ok(report.patch_assessment);
    assert.equal(report.patch_assessment.run_id, 'coder-1');
    assert.equal(report.patch_assessment.patch_verdict, 'reject');
    assert.equal(report.patch_assessment.patch_evaluation.file_budget_exceeded, true);
  });
});

test('coder-loop repair brief includes patch discipline and preferred edit files', () => {
  const prompt = buildNextPromptText({
    run_id: 'coder-1',
    objective: 'fix refresh token import',
    checks: [{ kind: 'test', command: 'npm test' }],
    latest_failures: [{ category: 'import_resolve', file: 'src/auth.ts', message: 'missing import' }],
    current_patch_evaluation: {
      verdict: 'warning',
      touched_files: ['src/auth.ts', 'src/index.ts', 'src/unrelated.ts'],
      file_budget: 3,
      unrelated_edit_ratio: 0.33,
      protected_file_violations: [],
    },
    context_policy: { strategy_bias: 'balanced', context_scope: 'standard', ast_edit_mode: 'surgical', target_budget: 2, related_test_budget: 1 },
    context: {
      profile: { runtime: 'node', language: 'typescript', framework: 'express', package_manager: 'npm' },
      targets: [{ path: 'src/auth.ts', exports: ['refreshToken'], symbols: ['refreshToken'], related_tests: ['tests/auth.test.js'] }],
      related_tests: ['tests/auth.test.js'],
      omitted_targets: [],
      omitted_related_tests: [],
      change_surface: { candidate_edit_files: [{ path: 'src/auth.ts' }, { path: 'src/index.ts' }] },
    },
    failure_strategy: { action: 'repair_first', confidence: 0.8, reasons: ['import failure'], suggested_commands: ['npm test'] },
  });
  assert.match(prompt, /Current patch verdict: warning/);
  assert.match(prompt, /Preferred edit files: src\/auth.ts, src\/index.ts/);
});

test('review-gate blocks overly broad patch footprint from coder context', async () => {
  await withTempDir((dir) => {
    writeFiles(dir, fixtureFiles());
    initCommittedGitRepo(dir);
    writeCoderRun(dir, ['src/auth.ts', 'src/index.ts', 'src/router.ts', 'tests/auth.test.js']);
  }, async (dir) => {
    const report = await runMergeGate({ root: dir, json: true, 'no-plan': true });
    assert.equal(report.verdict, 'BLOCK');
    assert.ok(report.status_inputs.patch_footprint);
    assert.equal(report.status_inputs.patch_footprint.verdict, 'reject');
    assert.match(report.merge_risk_summary.blockers.join(' | '), /patch footprint/i);
    const patchRule = report.evidence_bundle.gate.rules.find((item) => item.rule_id === 'review.patch-discipline');
    assert.ok(patchRule);
    assert.equal(patchRule.status, 'fail');
  });
});

test('benchmark-suite exposes strong-coder sample preset with realistic scenarios', () => {
  const suite = runNodeJson(BENCHMARK_SUITE, ['sample', '--preset', 'strong-coder', '--json'], { cwd: ROOT });
  assert.equal(suite.profile, 'strong-coder');
  assert.ok(suite.cases.some((item) => item.scenario === 'bugfix'));
  assert.ok(suite.cases.some((item) => item.expected && item.expected.preferred_patch_discipline));
});
