const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCodeIntelligence, summarizeTargetNeighborhood, buildChangeSurface } = require('../src/core/implementation/code-intelligence.js');
const { recommendTaskRoute } = require('../src/core/implementation/task-routing.js');
const { classifyFailureKinds, recommendRepairRecipe } = require('../src/core/repair/debug-fix-loop.js');
const { summarizeCodingCapability } = require('../src/core/benchmark/coding.js');
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
    'src/index.ts': 'import { refreshToken } from "./auth";\nexport function serve(id) { return refreshToken(id); }\n',
    'tests/auth.test.js': 'const test = require("node:test"); const assert = require("node:assert/strict"); const { refreshToken } = require("../src/auth"); test("refresh", () => { assert.equal(refreshToken("u1"), "u1:test"); });\n',
  };
}

test('code intelligence tracks symbol references, tests, and impact score', () => {
  withTempDir((dir) => writeFiles(dir, fixture()), (dir) => {
    const index = buildCodeIntelligence(dir, 'fix refresh token bug', ['src/auth.ts']);
    const auth = summarizeTargetNeighborhood(index, 'src/auth.ts');
    const surface = buildChangeSurface(index, ['src/auth.ts']);
    assert.ok(auth.test_neighbors.includes('tests/auth.test.js'));
    assert.ok(auth.impact.reference_count >= 1);
    assert.ok(auth.impact.risk_score >= 1);
    assert.ok(surface.impact_score >= auth.impact.risk_score);
  });
});

test('task routing reacts to typecheck-heavy failures with repair-first guidance', () => {
  const route = recommendTaskRoute({
    objective: 'fix token signature mismatch',
    profile: { runtime: 'node', repo_shape: 'workspace', framework: 'express' },
    targets: ['src/auth.ts'],
    latestFailures: [{ kind: 'typecheck' }],
  });
  assert.equal(route.task_kind, 'type_repair');
  assert.equal(route.recommended_loop_mode, 'repair-first');
  assert.equal(route.verify_intensity, 'targeted');
});

test('failure taxonomy and repair recipe distinguish env and lint failures', () => {
  const failureKinds = classifyFailureKinds({
    combined_output: 'Error: connect ECONNREFUSED 127.0.0.1:5432\neslint error Unexpected console statement',
  });
  assert.ok(failureKinds.includes('runtime_or_env'));
  assert.ok(failureKinds.includes('lint_or_format'));
  const recipe = recommendRepairRecipe({
    failureKinds,
    objective: 'fix service startup issue',
    verifyCommands: ['npm run test'],
    route: { edit_mode: 'localized', verify_intensity: 'deep' },
  });
  assert.equal(recipe.preferred_edit_mode, 'surgical');
  assert.equal(recipe.verify_scope, 'standard');
  assert.ok(recipe.actions.some((item) => item.includes('environment')));
});

test('coding benchmark reports unrelated edit and regression averages', () => {
  const summary = summarizeCodingCapability({
    results: [
      { task: { task_success: true, regression_rate: 0 }, plan: { coder_loop: { round_count: 1 } }, patch: { file_count: 2, unrelated_edit_ratio: 0.05 } },
      { task: { task_success: true, regression_rate: 0.1 }, plan: { coder_loop: { round_count: 2 } }, patch: { file_count: 3, unrelated_edit_ratio: 0.1 } },
      { task: { task_success: false, regression_rate: 0.5 }, plan: { coder_loop: { round_count: 4 } }, patch: { file_count: 6, unrelated_edit_ratio: 0.6 } },
    ],
    summary: { task_success_rate: 66.7 },
  });
  assert.equal(summary.average_diff_size, 3.67);
  assert.equal(summary.average_unrelated_edit_ratio, 0.25);
  assert.equal(summary.average_regression_rate, 0.2);
  assert.equal(summary.coding_strength, 'weak');
  assert.equal(summary.patch_discipline, 'loose');
});
