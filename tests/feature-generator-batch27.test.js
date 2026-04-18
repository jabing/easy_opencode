const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCodeIntelligence, summarizeTargetNeighborhood, buildChangeSurface } = require('../src/core/implementation/code-intelligence.js');
const { recommendTaskRoute } = require('../src/core/implementation/task-routing.js');
const { recommendRepairRecipe } = require('../src/core/repair/debug-fix-loop.js');
const { evaluatePatchFootprint } = require('../src/core/implementation/edit-engine.js');
const { summarizeCodingCapability, scorePatchDiscipline } = require('../src/core/benchmark/coding.js');
const { deriveStyleContract } = require('../src/core/project/memory.js');
const { buildImplementationContext } = require('../src/core/implementation/context.js');
const { withTempDir, writeFiles } = require('./test-helpers.js');

function fixture() {
  return {
    'package.json': JSON.stringify({
      name: 'demo',
      version: '1.0.0',
      scripts: { test: 'node --test tests/auth.test.js' },
    }, null, 2),
    'src/config.ts': 'export const appConfig = { env: "test" };\n',
    'src/auth.ts': [
      'import { appConfig } from "./config";',
      'export function refreshToken(userId) {',
      '  return `${userId}:${appConfig.env}`;',
      '}',
      '',
    ].join('\n'),
    'src/index.ts': [
      'import { refreshToken } from "./auth";',
      'export function serve(id) { return refreshToken(id); }',
      '',
    ].join('\n'),
    'src/router.ts': [
      'import { serve } from "./index";',
      'export function register(router) { router.get("/token", (req, res) => res.send(serve(req.query.id))); }',
      '',
    ].join('\n'),
    'tests/auth.test.js': 'const test = require("node:test"); const assert = require("node:assert/strict"); const { refreshToken } = require("../src/auth"); test("refresh", () => { assert.equal(refreshToken("u1"), "u1:test"); });\n',
  };
}

test('code intelligence ranks candidate edit files and incoming symbol callers', () => {
  withTempDir((dir) => writeFiles(dir, fixture()), (dir) => {
    const index = buildCodeIntelligence(dir, 'fix refresh token bug', ['src/auth.ts']);
    const auth = summarizeTargetNeighborhood(index, 'src/auth.ts');
    const surface = buildChangeSurface(index, ['src/auth.ts']);
    assert.ok(auth.incoming_symbol_callers.some((item) => item.path === 'src/index.ts'));
    assert.ok(auth.candidate_edit_files.some((item) => item.path === 'tests/auth.test.js'));
    assert.ok(surface.candidate_edit_files.some((item) => item.path === 'src/index.ts'));
  });
});

test('repair recipe carries patch guard and footprint rejects broad patch', () => {
  withTempDir((dir) => writeFiles(dir, fixture()), (dir) => {
    const index = buildCodeIntelligence(dir, 'fix refresh token bug', ['src/auth.ts']);
    const changeSurface = buildChangeSurface(index, ['src/auth.ts']);
    const recipe = recommendRepairRecipe({
      failureKinds: ['import_resolve'],
      objective: 'fix refresh token import',
      verifyCommands: ['npm run test'],
      route: { edit_mode: 'surgical', verify_intensity: 'targeted' },
      changeSurface,
    });
    assert.equal(recipe.patch_guard.max_patch_files, 4);
    const verdict = evaluatePatchFootprint({
      route: { allowed_files: recipe.patch_guard.max_patch_files },
      recipe,
      changeSurface,
      footprint: { touched_files: ['src/auth.ts', 'src/index.ts', 'src/router.ts', 'tests/auth.test.js', 'src/unrelated.ts'] },
    });
    assert.equal(verdict.verdict, 'reject');
    assert.equal(verdict.file_budget_exceeded, true);
  });
});

test('task routing uses benchmark strength and implementation context exposes style contract', () => {
  withTempDir((dir) => writeFiles(dir, fixture()), (dir) => {
    const route = recommendTaskRoute({
      objective: 'fix refresh token bug',
      profile: { runtime: 'node', repo_shape: 'single', framework: 'express' },
      targets: ['src/auth.ts'],
      latestFailures: [{ kind: 'test_assertion' }],
      benchmarkFeedback: { coding_strength: 'strong' },
    });
    assert.equal(route.coding_model, 'small');
    const context = buildImplementationContext({ rootDir: dir, objective: 'fix refresh token bug', targets: ['src/auth.ts'] });
    assert.ok(context.style_contract);
    assert.ok(Array.isArray(context.context_buckets.candidate_edit_files));
  });
});

test('coding benchmark scores patch discipline', () => {
  const summary = summarizeCodingCapability({
    results: [
      { task: { task_success: true, regression_rate: 0 }, plan: { coder_loop: { round_count: 1 } }, patch: { file_count: 2, unrelated_edit_ratio: 0.05, verdict: 'accept' } },
      { task: { task_success: true, regression_rate: 0.05 }, plan: { coder_loop: { round_count: 2 } }, patch: { file_count: 3, unrelated_edit_ratio: 0.1, verdict: 'accept' } },
    ],
    summary: { task_success_rate: 100 },
  });
  assert.equal(scorePatchDiscipline({ averageUnrelatedEditRatio: 0.1, averageDiffSize: 3, averageRegressionRate: 0.05 }), 85);
  assert.equal(summary.patch_discipline, 'tight');
  assert.equal(summary.coding_strength, 'strong');
});

test('derive style contract normalizes memory for coder use', () => {
  const contract = deriveStyleContract({
    style_profile: { controller_pattern: 'controller-service', async_style: 'async-await', test_style: 'bdd', validation_style: 'library-driven' },
    preferred_test_runner_profile: { default: { runner: 'node:test' } },
    naming: { file_case: 'kebab' },
  });
  assert.equal(contract.async_style, 'async-await');
  assert.equal(contract.naming.file_case, 'kebab');
  assert.equal(contract.preferred_test_runner_profile.default.runner, 'node:test');
});
