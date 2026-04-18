const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, runNodeResult, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');
const DEBUG_FIX_LOOP = path.join(ROOT, 'scripts', 'debug-fix-loop.js');

function featureFixture(files = {}) {
  return {
    'package.json': JSON.stringify({
      name: 'batch6-node-project',
      scripts: {
        test: 'node -e "process.exit(0)"',
      },
      dependencies: {
        express: '^4.19.0',
      },
    }, null, 2),
    'src/modules/user/user.route.ts': "export const userRoute = true;\n",
    'src/modules/user/user.service.ts': "export const userService = true;\n",
    'tests/modules/.gitkeep': '',
    'docs/api/index.md': '# API\n',
    ...files,
  };
}

test('feature generator infers verify commands from available project scripts', () => {
  withTempDir((dir) => {
    writeFiles(dir, featureFixture());
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['audit-log', '--root', dir, '--dry-run', '--json'], { cwd: ROOT });
    assert.deepEqual(result.verify, ['npm run test']);
    assert.equal(result.feature_feedback.safe_mode, false);
    assert.match(result.feature_feedback.reasons.join('\n'), /project has no build script/);
  });
});

test('project memory failure patterns feed back into next generation hints and integration note', () => {
  withTempDir((dir) => {
    writeFiles(dir, featureFixture({
      '.opencode/project-memory.json': JSON.stringify({
        schema_version: '1.0',
        coding_style: 'functional',
        api_style: 'rest',
        test_framework: 'vitest',
        validation_lib: 'zod',
        orm: 'prisma',
        auth_strategy: 'jwt',
        error_pattern: 'typed-errors',
        naming: { file_case: 'kebab', symbol_case: 'pascal-camel', feature_container: 'modules' },
        preferred_feature_shape: ['route', 'controller', 'service', 'repository', 'schema', 'test'],
        failure_patterns: [
          { pattern: 'cannot-find-module', root_cause: 'broken_local_imports', file_count: 1, timestamp: '2026-04-13T00:00:00.000Z' },
        ],
      }, null, 2),
    }));
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['report-export', '--root', dir, '--json'], { cwd: ROOT });
    assert.equal(result.feature_feedback.safe_mode, true);
    assert.equal(result.project_memory.failure_patterns[0].pattern, 'cannot-find-module');
    const integration = fs.readFileSync(path.join(dir, '.opencode', 'feature-bundles', 'report-export.integration.md'), 'utf8');
    assert.match(integration, /Generation safe mode: `true`/);
    assert.match(integration, /Import repair bias: `high`/);
    assert.match(integration, /Verify bias: `standard`/);
  });
});

test('debug-fix-loop records missing build script failures into project memory', () => {
  withTempDir((dir) => {
    writeFiles(dir, featureFixture());
  }, (dir) => {
    runNodeResult(GENERATE_FEATURE, ['billing-report', '--root', dir, '--skip-verify'], { cwd: ROOT });
    const failed = runNodeResult(DEBUG_FIX_LOOP, [
      '--root', dir,
      '--feature', 'billing-report',
      '--verify', 'npm run build',
    ], { cwd: ROOT });
    assert.equal(failed.code, 0);
    const payload = JSON.parse(failed.stdout);
    assert.equal(payload.root_cause, 'missing_verify_script_recovered');
    assert.deepEqual(payload.verify_after.steps.map((step) => step.command), ['npm run test']);
    assert.equal(payload.failure_patterns_recorded, false);
  });
});
