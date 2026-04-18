const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const SKILL_RUNNER = path.join(ROOT, 'scripts', 'skill-runner.js');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');

function normalizePreview(preview) {
  return (preview || []).map((item) => ({ output: item.output, module: item.module }));
}

test('skill-runner scaffold dry-run executes feature_bundle for node feature generation', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'sample-node-feature',
        scripts: {
          build: 'tsc -p tsconfig.json',
          test: 'node --test',
        },
        dependencies: {
          express: '^4.19.0',
        },
      }, null, 2),
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020' } }, null, 2),
    });
  }, (dir) => {
    const result = runNodeJson(SKILL_RUNNER, [
      'scaffold',
      'generate-node-feature',
      '--root', dir,
      '--dry-run',
      '--json',
      '--var', 'name=user-auth',
      '--var', 'subject=UserAuth',
    ], { cwd: ROOT });

    assert.equal(result.mode, 'feature_bundle');
    assert.equal(result.runtime, 'node');
    assert.deepEqual(result.outputs, [
      'src/features/user-auth/user-auth.repository.ts',
      'src/features/user-auth/user-auth.schema.ts',
      'src/features/user-auth/user-auth.service.ts',
      'src/features/user-auth/user-auth.controller.ts',
      'src/features/user-auth/user-auth.route.ts',
      'docs/api/user-auth.md',
      '.opencode/feature-bundles/user-auth.integration.md',
      'tests/features/user-auth/user-auth.spec.ts',
    ]);
    assert.deepEqual(normalizePreview(result.preview), [
      { output: 'src/features/user-auth/user-auth.repository.ts', module: 'repository' },
      { output: 'src/features/user-auth/user-auth.schema.ts', module: 'schema' },
      { output: 'src/features/user-auth/user-auth.service.ts', module: 'service' },
      { output: 'src/features/user-auth/user-auth.controller.ts', module: 'controller' },
      { output: 'src/features/user-auth/user-auth.route.ts', module: 'route' },
      { output: 'docs/api/user-auth.md', module: 'docs' },
      { output: '.opencode/feature-bundles/user-auth.integration.md', module: 'integration' },
      { output: 'tests/features/user-auth/user-auth.spec.ts', module: 'test' },
    ]);
    assert.equal(result.integration_status, 'planned');
    assert.equal(result.integration_note, '.opencode/feature-bundles/user-auth.integration.md');
    assert.deepEqual(result.dependency_graph.service, ['repository', 'schema']);
  });
});

test('generate-feature delegates to generate-node-feature skill for node repositories', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'sample-node-feature',
        scripts: {
          build: 'tsc -p tsconfig.json',
          test: 'node --test',
        },
      }, null, 2),
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020' } }, null, 2),
    });
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, [
      'billing-report',
      '--root', dir,
      '--dry-run',
      '--json',
    ], { cwd: ROOT });

    assert.equal(result.skill, 'generate-node-feature');
    assert.equal(result.mode, 'feature_bundle');
    assert.match(result.output, /billing-report\.controller\.ts$/);
  });
});
