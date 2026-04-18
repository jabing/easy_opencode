const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const ANALYZE = path.join(ROOT, 'scripts', 'analyze-project-structure.js');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');

function baseNodePackage() {
  return {
    'package.json': JSON.stringify({
      name: 'adaptive-node-project',
      scripts: {
        build: 'tsc -p tsconfig.json',
        test: 'node --test',
      },
      dependencies: {
        express: '^4.19.0',
      },
    }, null, 2),
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020' } }, null, 2),
  };
}

test('analyze-project-structure detects feature-based modules layout', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      ...baseNodePackage(),
      'src/modules/user/user.route.ts': 'export {}\n',
      'src/modules/user/user.service.ts': 'export {}\n',
      'tests/modules/user/user.spec.ts': 'export {}\n',
      'docs/api/index.md': '# API\n',
    });
  }, (dir) => {
    const result = runNodeJson(ANALYZE, ['--root', dir, '--json'], { cwd: ROOT });
    assert.equal(result.architecture_pattern, 'feature-based');
    assert.equal(result.module_roots.route, 'src/modules');
    assert.equal(result.paths.route_index, 'src/modules/index.ts');
    assert.equal(result.docs_root, 'docs/api');
    assert.equal(result.test_root, 'tests');
    assert.equal(fs.existsSync(path.join(dir, '.opencode', 'project-structure.json')), true);
  });
});

test('generate-feature uses detected modules layout for output paths', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      ...baseNodePackage(),
      'src/modules/index.ts': '',
      'src/modules/user/user.route.ts': 'export {}\n',
      'src/modules/user/user.service.ts': 'export {}\n',
      'tests/modules/user/user.spec.ts': 'export {}\n',
      'docs/api/index.md': '# API\n',
    });
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['billing-report', '--root', dir, '--dry-run', '--json'], { cwd: ROOT });
    assert.deepEqual(new Set(result.outputs), new Set([
      'src/modules/billing-report/billing-report.repository.ts',
      'src/modules/billing-report/billing-report.schema.ts',
      'src/modules/billing-report/billing-report.service.ts',
      'src/modules/billing-report/billing-report.controller.ts',
      'src/modules/billing-report/billing-report.route.ts',
      'docs/api/billing-report.md',
      '.opencode/feature-bundles/billing-report.integration.md',
      'tests/modules/billing-report/billing-report.spec.ts',
    ]));
    assert.equal(result.paths.route_index, 'src/modules/index.ts');
    assert.equal(result.project_structure.architecture_pattern, 'feature-based');
    const routeIndexUpdate = result.updates.find((item) => item.file === 'src/modules/index.ts');
    assert.equal(routeIndexUpdate.content, "export * from './billing-report/billing-report.route';");
    const testPreview = result.preview.find((item) => item.module === 'test');
    assert.match(testPreview.body, /from '\.\.\/\.\.\/\.\.\/src\/modules\/billing-report\/billing-report\.service'/);
  });
});

test('generate-feature adapts to layered controllers-services-routes layout', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      ...baseNodePackage(),
      'src/controllers/health.controller.ts': 'export {}\n',
      'src/services/health.service.ts': 'export {}\n',
      'src/routes/index.ts': '',
      'src/routes/health.route.ts': 'export {}\n',
      'src/repositories/health.repository.ts': 'export {}\n',
      'src/schemas/health.schema.ts': 'export {}\n',
      'tests/health/health.spec.ts': 'export {}\n',
      'docs/api/index.md': '# API\n',
    });
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['orders', '--root', dir, '--dry-run', '--json'], { cwd: ROOT });
    assert.equal(result.project_structure.architecture_pattern, 'layered');
    assert.deepEqual(result.paths, {
      controller: 'src/controllers',
      service: 'src/services',
      repository: 'src/repositories',
      schema: 'src/schemas',
      route: 'src/routes',
      test: 'tests/orders',
      docs: 'docs/api',
      route_index: 'src/routes/index.ts',
      docs_index: 'docs/api/index.md',
      feature_root: 'src/orders',
    });
    const routeIndexUpdate = result.updates.find((item) => item.file === 'src/routes/index.ts');
    assert.equal(routeIndexUpdate.content, "export * from './orders.route';");
    const outputs = new Set(result.outputs);
    assert.equal(outputs.has('src/controllers/orders.controller.ts'), true);
    assert.equal(outputs.has('src/services/orders.service.ts'), true);
    assert.equal(outputs.has('src/routes/orders.route.ts'), true);
    const docsPreview = result.preview.find((item) => item.module === 'docs');
    assert.match(docsPreview.body, /Controller: `src\/controllers\/orders\.controller\.ts`/);
  });
});
