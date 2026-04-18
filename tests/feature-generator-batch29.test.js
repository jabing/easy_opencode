const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { withTempDir, writeFiles, initCommittedGitRepo, runNodeJson } = require('./test-helpers.js');
const { buildNextPromptText } = require('../scripts/coder-loop.js');
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

function writeCoderRun(root, options = {}) {
  const runId = options.runId || 'coder-1';
  writeFiles(root, {
    '.opencode/coder-loop/latest.json': JSON.stringify({ run_id: runId, latest_failures: [{ kind: options.failureKind || 'import_resolve', message: 'missing import' }] }, null, 2),
    [`.opencode/coder-loop/${runId}.json`]: JSON.stringify({
      run_id: runId,
      objective: options.objective || 'fix refresh token import',
      root_dir: root,
      status: options.status || 'needs_fix',
      rounds: options.rounds || [{ round: 1 }],
      checks: [{ kind: 'test', command: 'npm test' }],
      latest_failures: [{ kind: options.failureKind || 'import_resolve', category: options.failureKind || 'import_resolve', file: 'src/auth.ts', message: 'missing import' }],
      current_patch_evaluation: options.patch || {
        verdict: 'reject',
        touched_files: ['src/auth.ts', 'src/index.ts', 'src/router.ts', 'tests/auth.test.js'],
        file_budget: 3,
        unrelated_edit_ratio: 0.5,
        protected_file_violations: ['src/router.ts'],
      },
      context: {
        profile: { runtime: options.runtime || 'node', language: 'typescript', framework: 'express', package_manager: 'npm' },
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
      repair_recipe: {
        preferred_edit_mode: 'surgical',
        patch_guard: { max_patch_files: 3, protected_files: ['src/router.ts'], preferred_files: ['src/auth.ts', 'src/index.ts'] },
      },
    }, null, 2),
  });
}

test('safe-apply status exposes patch gate decision for guarded apply flow', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixtureFiles());
    initCommittedGitRepo(dir);
    writeCoderRun(dir);
    writeFiles(dir, {
      'src/auth.ts': '// changed auth\n',
      'src/index.ts': '// changed index\n',
      'src/router.ts': '// changed router\n',
      'tests/auth.test.js': '// changed test\n',
    });
  }, (dir) => {
    const report = runNodeJson(SAFE_APPLY, ['status'], { cwd: dir });
    assert.ok(report.patch_assessment.patch_gate);
    assert.equal(report.patch_assessment.patch_gate.allow_apply, false);
    assert.equal(report.patch_assessment.patch_gate.action, 'split_or_rollback');
  });
});

test('coder-loop repair brief includes recommended patch action from gate decision', () => {
  const prompt = buildNextPromptText({
    run_id: 'coder-1',
    objective: 'fix refresh token import',
    checks: [{ kind: 'test', command: 'npm test' }],
    latest_failures: [{ category: 'import_resolve', file: 'src/auth.ts', message: 'missing import' }],
    current_patch_evaluation: {
      verdict: 'reject',
      touched_files: ['src/auth.ts', 'src/index.ts', 'src/router.ts', 'tests/auth.test.js'],
      file_budget: 3,
      unrelated_edit_ratio: 0.5,
      protected_file_violations: ['src/router.ts'],
    },
    repair_recipe: {
      patch_guard: { max_patch_files: 3, protected_files: ['src/router.ts'], preferred_files: ['src/auth.ts', 'src/index.ts'] },
    },
    context_policy: { strategy_bias: 'balanced', context_scope: 'standard', ast_edit_mode: 'surgical', target_budget: 2, related_test_budget: 1 },
    context: {
      profile: { runtime: 'node', language: 'typescript', framework: 'express', package_manager: 'npm' },
      targets: [{ path: 'src/auth.ts', exports: ['refreshToken'], symbols: ['refreshToken'], related_tests: ['tests/auth.test.js'] }],
      related_tests: ['tests/auth.test.js'],
      omitted_targets: [],
      omitted_related_tests: [],
      edit_strategy: { edit_mode: 'surgical', allowed_files: 3 },
      change_surface: { candidate_edit_files: [{ path: 'src/auth.ts' }, { path: 'src/index.ts' }] },
    },
  });
  assert.match(prompt, /Recommended patch action: split_or_rollback/);
  assert.match(prompt, /Patch gate: patch touches protected high-risk files/i);
});

test('benchmark-suite replay synthesizes realistic failure-replay cases from coder runs', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixtureFiles());
    writeCoderRun(dir, {
      runId: 'coder-type',
      objective: 'repair user session types',
      failureKind: 'typecheck',
      status: 'green',
      rounds: [{ round: 1 }, { round: 2 }],
      patch: { verdict: 'warning', touched_files: ['src/auth.ts', 'src/index.ts'], file_budget: 3, unrelated_edit_ratio: 0.25, protected_file_violations: [] },
    });
    writeCoderRun(dir, {
      runId: 'coder-refactor',
      objective: 'local refactor auth helper',
      failureKind: 'test_assertion',
      status: 'needs_fix',
      rounds: [{ round: 1 }],
      patch: { verdict: 'accept', touched_files: ['src/auth.ts'], file_budget: 3, unrelated_edit_ratio: 0, protected_file_violations: [] },
    });
  }, (dir) => {
    const suite = runNodeJson(BENCHMARK_SUITE, ['replay', '--limit', '5'], { cwd: dir });
    assert.equal(suite.profile, 'failure-replay');
    assert.equal(suite.source.kind, 'coder-loop');
    assert.ok(suite.cases.some((item) => item.scenario === 'type-repair'));
    assert.ok(suite.cases.some((item) => item.scenario === 'local-refactor'));
    assert.ok(suite.cases.every((item) => item.expected && item.expected.preferred_patch_discipline));
  });
});
