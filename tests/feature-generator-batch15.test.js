const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const ANALYZE = path.join(ROOT, 'scripts', 'analyze-project-structure.js');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');

function baseWorkspace() {
  return {
    'package.json': JSON.stringify({
      name: 'monorepo-root',
      private: true,
      workspaces: ['packages/*'],
    }, null, 2),
    'packages/api/package.json': JSON.stringify({
      name: '@repo/api',
      scripts: {
        build: 'node -e "process.exit(0)"',
        test: 'node -e "process.exit(0)"',
      },
      dependencies: { express: '^4.19.0' },
    }, null, 2),
    'packages/api/tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020' } }, null, 2),
  };
}

test('analyze-project-structure detects workspace package-local feature roots', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      ...baseWorkspace(),
      'packages/api/src/modules/user/user.route.ts': 'export {}\n',
      'packages/api/src/modules/user/user.service.ts': 'export {}\n',
      'packages/api/tests/modules/user/user.spec.ts': 'export {}\n',
      'packages/api/docs/api/index.md': '# API\n',
    });
  }, (dir) => {
    const result = runNodeJson(ANALYZE, ['--root', dir, '--json'], { cwd: ROOT });
    assert.equal(result.repo_shape, 'workspace-package-local');
    assert.equal(result.workspace_root, 'packages/api');
    assert.equal(result.source_root, 'packages/api/src');
    assert.equal(result.test_root, 'packages/api/tests');
    assert.equal(result.docs_root, 'packages/api/docs/api');
    assert.equal(result.module_roots.route, 'packages/api/src/modules');
    assert.equal(result.confidence, 'high');
    assert.ok(result.confidence_score >= 0.8);
    assert.ok(Array.isArray(result.confidence_reasons));
    assert.ok(result.confidence_reasons.length >= 1);
  });
});

test('generate-feature targets workspace package-local paths when examples live under packages/api', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      ...baseWorkspace(),
      'packages/api/src/modules/index.ts': '',
      'packages/api/src/modules/user/user.route.ts': 'export {}\n',
      'packages/api/src/modules/user/user.service.ts': 'export {}\n',
      'packages/api/tests/modules/user/user.spec.ts': 'export {}\n',
      'packages/api/docs/api/index.md': '# API\n',
    });
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['billing-report', '--root', dir, '--dry-run', '--json'], { cwd: ROOT });
    assert.equal(result.project_structure.repo_shape, 'workspace-package-local');
    assert.equal(result.paths.route_index, 'packages/api/src/modules/index.ts');
    assert.deepEqual(new Set(result.outputs), new Set([
      'packages/api/src/modules/billing-report/billing-report.repository.ts',
      'packages/api/src/modules/billing-report/billing-report.schema.ts',
      'packages/api/src/modules/billing-report/billing-report.service.ts',
      'packages/api/src/modules/billing-report/billing-report.controller.ts',
      'packages/api/src/modules/billing-report/billing-report.route.ts',
      'packages/api/docs/api/billing-report.md',
      '.opencode/feature-bundles/billing-report.integration.md',
      'packages/api/tests/modules/billing-report/billing-report.spec.ts',
    ]));
    const routeIndexUpdate = result.updates.find((item) => item.file === 'packages/api/src/modules/index.ts');
    assert.equal(routeIndexUpdate.content, "export * from './billing-report/billing-report.route';");
  });
});

test('analyze-project-structure emits conservative medium confidence when no examples exist', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'empty-node', scripts: { build: 'node -e "0"', test: 'node -e "0"' } }, null, 2),
    });
  }, (dir) => {
    const result = runNodeJson(ANALYZE, ['--root', dir, '--json'], { cwd: ROOT });
    assert.equal(result.architecture_pattern, 'feature-based');
    assert.equal(result.confidence, 'medium');
    assert.ok(result.confidence_score >= 0.35 && result.confidence_score < 0.55);
    assert.ok(result.confidence_reasons.some((reason) => /conservative fallback/i.test(reason)));
  });
});
