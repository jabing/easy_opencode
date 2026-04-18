const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');

function frameworkFixture(memory, extra = {}) {
  return {
    'package.json': JSON.stringify({
      name: 'batch11-node-project',
      scripts: {
        build: 'node -e "process.exit(0)"',
        'test:unit': 'vitest run',
      },
      dependencies: {
        express: '^4.19.0',
      },
      devDependencies: {
        vitest: '^2.0.0',
      },
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

test('framework-aware verify prefers vitest unit script', () => {
  withTempDir((dir) => {
    writeFiles(dir, frameworkFixture({ test_framework: 'vitest', error_pattern: 'standard-errors' }));
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['usage-metrics', '--root', dir, '--json', '--skip-verify'], { cwd: ROOT });
    assert.deepEqual(result.verify, ['npm run build', 'npm run test:unit']);
    assert.equal(result.feature_planning.verify_preference, 'vitest-preferred');
  });
});

test('typed errors reuse shared AppError module when present', () => {
  withTempDir((dir) => {
    writeFiles(dir, frameworkFixture(
      { test_framework: 'vitest', error_pattern: 'typed-errors' },
      { 'src/lib/errors.ts': 'export class AppError extends Error {}\n' },
    ));
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['quota-guard', '--root', dir, '--json', '--skip-verify'], { cwd: ROOT });
    const service = fs.readFileSync(path.join(dir, 'src/modules/quota-guard/quota-guard.service.ts'), 'utf8');
    const route = fs.readFileSync(path.join(dir, 'src/modules/quota-guard/quota-guard.route.ts'), 'utf8');
    const docs = fs.readFileSync(path.join(dir, '.opencode/feature-bundles/quota-guard.integration.md'), 'utf8');
    assert.equal(result.project_memory.shared_error_module.class_name, 'AppError');
    assert.ok(service.includes("import { AppError } from '../../lib/errors';"));
    assert.ok(service.includes('export class QuotaGuardServiceError extends AppError'));
    assert.ok(route.includes("import { AppError } from '../../lib/errors';"));
    assert.ok(route.includes('if (error instanceof AppError)'));
    assert.ok(docs.includes('Shared error integration: `AppError@src/lib/errors.ts`'));
  });
});
