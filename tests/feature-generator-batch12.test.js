const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');
const FIX_LOOP = path.join(ROOT, 'scripts', 'debug-fix-loop.js');

function fixture(memory = {}, extra = {}) {
  return {
    'package.json': JSON.stringify({
      name: 'batch12-node-project',
      scripts: {
        build: 'node -e "process.exit(0)"',
        'test:unit': 'vitest run',
      },
      dependencies: { express: '^4.19.0' },
      devDependencies: { vitest: '^2.0.0' },
    }, null, 2),
    '.opencode/project-memory.json': JSON.stringify({
      schema_version: '1.0',
      coding_style: 'functional',
      api_style: 'rest',
      test_framework: 'vitest',
      validation_lib: 'unknown',
      orm: 'unknown',
      auth_strategy: 'unknown',
      error_pattern: 'typed-errors',
      naming: { file_case: 'kebab', symbol_case: 'pascal-camel', feature_container: 'modules' },
      preferred_feature_shape: ['route', 'controller', 'service', 'repository', 'schema', 'test', 'docs'],
      ...memory,
    }, null, 2),
    'src/modules/user/user.route.ts': 'export const userRoute = true;\n',
    'src/modules/user/user.service.ts': 'export const userService = true;\n',
    'docs/api/index.md': '# API\n',
    ...extra,
  };
}

test('global error middleware makes generated route delegate unexpected errors', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixture({}, {
      'src/middleware/error-handler.ts': 'export function appErrorHandler(err, req, res, next) { res.status(500).json({ ok: false, error: err.message }); }\n',
    }));
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['quota-sync', '--root', dir, '--json', '--skip-verify'], { cwd: ROOT });
    const route = fs.readFileSync(path.join(dir, 'src/modules/quota-sync/quota-sync.route.ts'), 'utf8');
    const docs = fs.readFileSync(path.join(dir, '.opencode/feature-bundles/quota-sync.integration.md'), 'utf8');
    assert.equal(result.project_memory.global_error_middleware.symbol_name, 'appErrorHandler');
    assert.ok(route.includes('next(error);'));
    assert.ok(docs.includes('Global error handler integration: `appErrorHandler@src/middleware/error-handler.ts`'));
  });
});

test('preferred test command is persisted after generation', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixture());
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['usage-metrics', '--root', dir, '--json', '--skip-verify'], { cwd: ROOT });
    assert.equal(result.project_memory.preferred_test_command, 'npm run test:unit');
    const apiDoc = fs.readFileSync(path.join(dir, 'docs/api/usage-metrics.md'), 'utf8');
    assert.ok(apiDoc.includes('Preferred test command: `npm run test:unit`'));
  });
});

test('debug fix loop recovers missing test script via framework-aware fallback', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'batch12-fix-project',
        scripts: { build: 'node -e "process.exit(0)"' },
        devDependencies: { vitest: '^2.0.0' },
      }, null, 2),
      '.opencode/project-memory.json': JSON.stringify({
        schema_version: '1.0',
        coding_style: 'functional',
        api_style: 'rest',
        test_framework: 'vitest',
        validation_lib: 'unknown',
        orm: 'unknown',
        auth_strategy: 'unknown',
        error_pattern: 'standard-errors',
        naming: { file_case: 'kebab', symbol_case: 'pascal-camel', feature_container: 'modules' },
        preferred_feature_shape: ['route', 'controller', 'service', 'repository', 'schema'],
      }, null, 2),
      'node_modules/.bin/vitest': '#!/bin/sh\nexit 0\n',
      'src/modules/user/user.route.ts': 'export const userRoute = true;\n',
      'src/modules/user/user.service.ts': 'export const userService = true;\n',
    });
    fs.chmodSync(path.join(dir, 'node_modules/.bin/vitest'), 0o755);
  }, (dir) => {
    const result = runNodeJson(FIX_LOOP, ['--root', dir, '--feature', 'quota-sync', '--verify', 'npm run test'], { cwd: ROOT });
    assert.equal(result.ok, true);
    assert.equal(result.root_cause, 'missing_verify_script_recovered');
    assert.deepEqual(result.verify_after.steps.map((step) => step.command), ['npm run build', 'npx vitest run']);
  });
});
