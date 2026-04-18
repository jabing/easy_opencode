const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');

function featureFixture(files = {}) {
  return {
    'package.json': JSON.stringify({
      name: 'batch7-node-project',
      scripts: {
        build: 'node -e "process.exit(0)"',
      },
      dependencies: {
        express: '^4.19.0',
      },
    }, null, 2),
    'src/modules/user/user.route.ts': "export const userRoute = true;\n",
    'src/modules/user/user.service.ts': "export const userService = true;\n",
    'docs/api/index.md': '# API\n',
    ...files,
  };
}

test('planning feedback disables test module by default when project has no runnable test script', () => {
  withTempDir((dir) => {
    writeFiles(dir, featureFixture());
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['ops-audit', '--root', dir, '--json'], { cwd: ROOT });
    assert.equal(result.feature_planning.with_test, false);
    assert.equal(result.feature_planning.integration_mode, 'apply');
    assert.ok(!result.outputs.some((file) => /ops-audit\.(spec|test)\.ts$/.test(file)));
    const integration = fs.readFileSync(path.join(dir, '.opencode', 'feature-bundles', 'ops-audit.integration.md'), 'utf8');
    assert.match(integration, /Planned test module: `false`/);
    assert.match(integration, /Enabled modules: `[^`]*docs[^`]*integration`/);
    assert.doesNotMatch(integration, /Enabled modules: `[^`]*test[^`]*`/);
  });
});

test('safe mode switches default integration mode to plan and keeps docs guidance', () => {
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
        preferred_feature_shape: ['route', 'controller', 'service', 'repository', 'schema', 'docs'],
        failure_patterns: [
          { pattern: 'cannot-find-module', root_cause: 'broken_local_imports', file_count: 1, timestamp: '2026-04-12T00:00:00.000Z' },
        ],
      }, null, 2),
    }));
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['event-sync', '--root', dir, '--json'], { cwd: ROOT });
    assert.equal(result.feature_planning.integration_mode, 'plan');
    assert.equal(result.scaffold_policy.integration_mode, 'plan');
    assert.ok(result.updates.every((item) => ['would_apply', 'already_present', 'skipped_missing', 'noop'].includes(item.status)));
    assert.ok(result.outputs.some((file) => file.endsWith('event-sync.md')));
  });
});

test('explicit user test toggle overrides planning default', () => {
  withTempDir((dir) => {
    writeFiles(dir, featureFixture());
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['ledger-export', '--root', dir, '--with-test', 'true', '--json'], { cwd: ROOT });
    assert.equal(result.feature_planning.with_test, true);
    assert.ok(result.outputs.some((file) => /ledger-export\.(spec|test)\.ts$/.test(file)));
  });
});
