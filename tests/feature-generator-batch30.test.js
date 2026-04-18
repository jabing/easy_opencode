const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { withTempDir, writeFiles, initCommittedGitRepo, runNodeJson } = require('./test-helpers.js');
const { buildImplementationContext } = require('../src/core/implementation/context.js');
const { buildAutomaticRepairPlan } = require('../src/core/repair/executor.js');
const { buildNextPromptText } = require('../scripts/coder-loop.js');

const ROOT = path.resolve(__dirname, '..');
const SAFE_APPLY = path.join(ROOT, 'scripts', 'safe-apply.js');

function fixtureFiles() {
  return {
    'package.json': JSON.stringify({
      name: 'semantic-fixture',
      version: '1.0.0',
      scripts: { test: 'node --test tests/auth.test.js' },
      type: 'commonjs',
    }, null, 2),
    '.gitignore': 'node_modules\n',
    'src/auth.ts': [
      'export function parseToken(raw) { return raw.trim(); }',
      'export function refreshToken(id) { return parseToken(id) + ":ok"; }',
      '',
    ].join('\n'),
    'src/index.ts': 'export { refreshToken } from "./auth";\n',
    'src/router.ts': 'const { refreshToken } = require("./auth");\nfunction mount() { return refreshToken("x"); }\nmodule.exports = { mount };\n',
    'src/server.ts': 'const { mount } = require("./router");\nfunction start() { return mount(); }\nmodule.exports = { start };\n',
    'tests/auth.test.js': 'const test = require("node:test"); const assert = require("node:assert/strict"); const { refreshToken } = require("../src/auth"); test("refresh", () => assert.equal(refreshToken("a"), "a:ok"));\n',
  };
}

function writeCoderRun(root) {
  writeFiles(root, {
    '.opencode/coder-loop/latest.json': JSON.stringify({ run_id: 'coder-v2', latest_failures: [{ kind: 'import_resolve', file: 'src/auth.ts', message: 'missing import' }] }, null, 2),
    '.opencode/coder-loop/coder-v2.json': JSON.stringify({
      run_id: 'coder-v2',
      objective: 'fix refresh token import',
      root_dir: root,
      status: 'needs_fix',
      checks: [{ kind: 'test', command: 'npm test' }],
      latest_failures: [{ kind: 'import_resolve', category: 'import_resolve', file: 'src/auth.ts', message: 'missing import' }],
      context: {
        profile: { runtime: 'node', language: 'typescript', framework: 'express', package_manager: 'npm' },
        targets: [{ path: 'src/auth.ts', exports: ['refreshToken'], symbols: ['parseToken', 'refreshToken'], related_tests: ['tests/auth.test.js'] }],
        related_tests: ['tests/auth.test.js'],
        change_surface: {
          candidate_edit_files: [
            { path: 'src/auth.ts', score: 8 },
            { path: 'src/index.ts', score: 4 },
            { path: 'tests/auth.test.js', score: 3 },
          ],
          direct_neighbors: ['src/index.ts', 'src/router.ts'],
          test_neighbors: ['tests/auth.test.js'],
          high_risk_neighbors: ['src/router.ts', 'src/server.ts'],
        },
        edit_strategy: { edit_mode: 'surgical', allowed_files: 3 },
      },
      repair_recipe: {
        failure_kinds: ['import_resolve'],
        preferred_edit_mode: 'surgical',
        patch_guard: { max_patch_files: 3, protected_files: ['src/router.ts'], preferred_files: ['src/auth.ts', 'src/index.ts'] },
      },
    }, null, 2),
  });
}

test('implementation context exposes deeper semantic index with entrypoints and symbol chains', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixtureFiles());
  }, (dir) => {
    const context = buildImplementationContext({ rootDir: dir, objective: 'fix refresh token import', targets: ['src/auth.ts'] });
    assert.ok(context.semantic_index);
    assert.ok(context.semantic_index.entrypoints.includes('src/server.ts'));
    const target = context.targets.find((item) => item.path === 'src/auth.ts');
    assert.ok(target.semantic);
    const refreshChain = target.semantic.symbol_chains.find((item) => item.symbol === 'refreshToken');
    assert.ok(refreshChain);
    assert.ok(refreshChain.called_by.includes('src/router.ts'));
  });
});

test('automatic repair executor narrows patch and synthesizes focused verify commands', () => {
  const plan = buildAutomaticRepairPlan({
    patchDecision: { action: 'split_or_rollback', preferred_files: ['src/auth.ts', 'src/index.ts'] },
    currentPatch: {
      touched_files: ['src/auth.ts', 'src/index.ts', 'src/router.ts', 'tests/auth.test.js'],
      protected_file_violations: ['src/router.ts'],
    },
    repairRecipe: {
      failure_kinds: ['import_resolve'],
      patch_guard: { preferred_files: ['src/auth.ts', 'src/index.ts'] },
    },
    context: {
      profile: { runtime: 'node' },
      targets: [{ path: 'src/auth.ts' }],
      related_tests: ['tests/auth.test.js'],
    },
    checks: [{ kind: 'test', command: 'npm test' }],
    latestFailures: [{ category: 'import_resolve', file: 'src/auth.ts', message: 'missing import' }],
  });
  assert.equal(plan.mode, 'guarded_repair');
  assert.ok(plan.operations.includes('restore_non_preferred_files'));
  assert.ok(plan.file_actions.restore_files.includes('src/router.ts'));
  assert.ok(plan.verify_commands.some((item) => item.includes('tests/auth.test.js')));
});

test('safe-apply status includes automatic repair plan for guarded patches', () => {
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
    assert.ok(report.patch_assessment.automatic_repair);
    assert.equal(report.patch_assessment.automatic_repair.mode, 'guarded_repair');
    assert.ok(report.patch_assessment.automatic_repair.file_actions.restore_files.includes('src/router.ts'));
  });
});

test('coder-loop repair brief includes automatic repair executor section', () => {
  const prompt = buildNextPromptText({
    run_id: 'coder-v2',
    objective: 'fix refresh token import',
    checks: [{ kind: 'test', command: 'npm test' }],
    latest_failures: [{ category: 'import_resolve', file: 'src/auth.ts', message: 'missing import' }],
    current_patch_evaluation: {
      verdict: 'reject',
      touched_files: ['src/auth.ts', 'src/index.ts', 'src/router.ts'],
      file_budget: 3,
      unrelated_edit_ratio: 0.34,
      protected_file_violations: ['src/router.ts'],
    },
    repair_recipe: {
      failure_kinds: ['import_resolve'],
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
  assert.match(prompt, /Automatic Repair Executor/);
  assert.match(prompt, /Restore files: src\/router\.ts/);
  assert.match(prompt, /Focused verify: .*tests\/auth\.test\.js/);
});
