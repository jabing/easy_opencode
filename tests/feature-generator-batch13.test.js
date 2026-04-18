const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, runNodeResult, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');
const FIX_LOOP = path.join(ROOT, 'scripts', 'debug-fix-loop.js');

function fixture(memory = {}, extra = {}) {
  return {
    'package.json': JSON.stringify({
      name: 'batch13-node-project',
      scripts: {
        build: 'node -e "process.exit(0)"',
        'test:unit': 'vitest run',
        'test:ci': 'vitest run --coverage',
        'test:watch': 'vitest --watch',
        'test:coverage': 'vitest run --coverage',
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

test('detects app entrypoint registration for global error handlers', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixture({}, {
      'src/middleware/error-handler.ts': 'export function appErrorHandler(err, req, res, next) { res.status(500).json({ ok: false, error: err.message }); }\n',
      'src/app.ts': "import express from 'express';\nimport { appErrorHandler } from './middleware/error-handler';\nconst app = express();\napp.use(appErrorHandler);\napp.listen(3000);\n",
    }));
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['quota-sync', '--root', dir, '--json', '--skip-verify'], { cwd: ROOT });
    assert.equal(result.project_memory.app_entrypoint.module_path, 'src/app.ts');
    assert.equal(result.project_memory.app_entrypoint.registers_global_error_handler, true);
    const docs = fs.readFileSync(path.join(dir, '.opencode/feature-bundles/quota-sync.integration.md'), 'utf8');
    assert.ok(docs.includes('App entrypoint integration: `src/app.ts (registered)`'));
  });
});

test('persists multi-mode preferred test commands after generation', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixture());
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['usage-metrics', '--root', dir, '--json', '--skip-verify'], { cwd: ROOT });
    assert.equal(result.project_memory.preferred_test_commands.default, 'npm run test:unit');
    assert.equal(result.project_memory.preferred_test_commands.ci, 'npm run test:ci');
    assert.equal(result.project_memory.preferred_test_commands.watch, 'npm run test:watch');
    assert.equal(result.project_memory.preferred_test_commands.coverage, 'npm run test:coverage');
    const apiDoc = fs.readFileSync(path.join(dir, 'docs/api/usage-metrics.md'), 'utf8');
    assert.ok(apiDoc.includes('Preferred CI test command: `npm run test:ci`'));
  });
});

test('debug fix loop records guarded narrowing for missing watch verify script', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'batch13-fix-project',
        scripts: { build: 'node -e "process.exit(0)"', 'test:ci': 'vitest run --coverage' },
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
    const outcome = runNodeResult(FIX_LOOP, ['--root', dir, '--feature', 'quota-sync', '--verify', 'npm run test:watch'], { cwd: ROOT, env: { ...process.env, CI: '1' } });
    assert.notEqual(outcome.code, 0);
    const result = JSON.parse(outcome.stdout);
    assert.equal(result.ok, false);
    assert.equal(result.root_cause, 'missing_verify_script');
    assert.equal(result.patchDecision.action, 'narrow_patch');
    assert.equal(result.automaticRepair.requires_narrowing, true);
  });
});
