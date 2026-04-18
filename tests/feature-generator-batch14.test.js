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
      name: 'batch14-node-project',
      scripts: {
        build: 'node -e "process.exit(0)"',
        'test:unit': 'jest --runInBand',
        'test:ci': 'jest --runInBand',
        'test:watch': 'jest --watch',
        'test:coverage': 'jest --coverage --runInBand'
      },
      dependencies: { express: '^4.19.0' },
      devDependencies: { jest: '^29.0.0' },
    }, null, 2),
    '.opencode/project-memory.json': JSON.stringify({
      schema_version: '1.0',
      coding_style: 'functional',
      api_style: 'rest',
      test_framework: 'jest',
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

test('auto-registers generated routes in detected app entrypoint', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixture({}, {
      'src/app.ts': "import express from 'express';\nconst app = express();\napp.listen(3000);\n",
    }));
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['audit-log', '--root', dir, '--json', '--skip-verify'], { cwd: ROOT });
    const appText = fs.readFileSync(path.join(dir, 'src/app.ts'), 'utf8');
    assert.equal(result.integration_status, 'applied');
    assert.ok(appText.includes("import { registerAuditLogRoutes } from './modules/audit-log/audit-log.route';"));
    assert.ok(appText.includes('app.use(registerAuditLogRoutes());'));
  });
});

test('persists runner profile details after generation', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixture());
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['quota-guard', '--root', dir, '--json', '--skip-verify'], { cwd: ROOT });
    assert.equal(result.project_memory.preferred_test_runner_profile.default.runner, 'jest');
    assert.equal(result.project_memory.preferred_test_runner_profile.default.run_in_band, true);
    assert.equal(result.project_memory.preferred_test_runner_profile.watch.watch, true);
    assert.equal(result.project_memory.preferred_test_runner_profile.ci.ci_safe, true);
    const docs = fs.readFileSync(path.join(dir, '.opencode/feature-bundles/quota-guard.integration.md'), 'utf8');
    assert.ok(docs.includes('Preferred test runner profile: `'));
  });
});

test('debug fix loop records guarded narrowing for missing coverage verify script', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'batch14-fix-project',
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
    const outcome = runNodeResult(FIX_LOOP, ['--root', dir, '--feature', 'quota-sync', '--verify', 'npm run test:coverage'], { cwd: ROOT });
    assert.notEqual(outcome.code, 0);
    const result = JSON.parse(outcome.stdout);
    assert.equal(result.ok, false);
    assert.equal(result.root_cause, 'missing_verify_script');
    assert.equal(result.patchDecision.action, 'narrow_patch');
    assert.equal(result.automaticRepair.requires_narrowing, true);
  });
});


test('persists feature plan and structured integration artifacts after generation', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixture());
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['invoice-sync', '--root', dir, '--json', '--skip-verify'], { cwd: ROOT });
    const planPath = path.join(dir, '.opencode/feature-plans/invoice-sync.json');
    const integrationJsonPath = path.join(dir, '.opencode/feature-bundles/invoice-sync.integration.json');
    assert.equal(result.feature_plan, '.opencode/feature-plans/invoice-sync.json');
    assert.equal(result.integration_json, '.opencode/feature-bundles/invoice-sync.integration.json');
    assert.equal(result.integration_status, 'applied');
    assert.ok(fs.existsSync(planPath));
    assert.ok(fs.existsSync(integrationJsonPath));

    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    const integration = JSON.parse(fs.readFileSync(integrationJsonPath, 'utf8'));
    const memory = JSON.parse(fs.readFileSync(path.join(dir, '.opencode/project-memory.json'), 'utf8'));

    assert.equal(plan.feature_name, 'invoice-sync');
    assert.ok(Array.isArray(plan.files_to_generate));
    assert.ok(plan.files_to_generate.includes('.opencode/feature-bundles/invoice-sync.integration.md'));
    assert.ok(Array.isArray(plan.verify_commands));
    assert.equal(integration.feature_name, 'invoice-sync');
    assert.ok(Array.isArray(integration.created_files));
    assert.ok(integration.created_files.includes('.opencode/feature-bundles/invoice-sync.integration.md'));
    assert.equal(memory.last_feature_generation.plan_path, '.opencode/feature-plans/invoice-sync.json');
    assert.equal(memory.last_feature_generation.integration_json_path, '.opencode/feature-bundles/invoice-sync.integration.json');
  });
});
