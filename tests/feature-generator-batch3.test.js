const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');

function baseNodePackage() {
  return {
    'package.json': JSON.stringify({
      name: 'batch3-node-project',
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

test('generate-feature computes cross-directory imports for layered layout', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      ...baseNodePackage(),
      'src/controllers/index.ts': '',
      'src/services/index.ts': '',
      'src/repositories/index.ts': '',
      'src/schemas/index.ts': '',
      'src/routes/index.ts': '',
      'src/controllers/health.controller.ts': 'export {}\n',
      'src/services/health.service.ts': 'export {}\n',
      'src/routes/health.route.ts': 'export {}\n',
      'src/repositories/health.repository.ts': 'export {}\n',
      'src/schemas/health.schema.ts': 'export {}\n',
      'tests/health/health.spec.ts': 'export {}\n',
      'docs/api/index.md': '# API\n',
    });
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['orders', '--root', dir, '--dry-run', '--json'], { cwd: ROOT });
    const controllerPreview = result.preview.find((item) => item.module === 'controller');
    const servicePreview = result.preview.find((item) => item.module === 'service');
    const repositoryPreview = result.preview.find((item) => item.module === 'repository');
    const routePreview = result.preview.find((item) => item.module === 'route');
    const testPreview = result.preview.find((item) => item.module === 'test');

    assert.match(controllerPreview.body, /from '\.\.\/services\/orders\.service'/);
    assert.match(controllerPreview.body, /from '\.\.\/schemas\/orders\.schema'/);
    assert.match(servicePreview.body, /from '\.\.\/repositories\/orders\.repository'/);
    assert.match(servicePreview.body, /from '\.\.\/schemas\/orders\.schema'/);
    assert.match(repositoryPreview.body, /from '\.\.\/schemas\/orders\.schema'/);
    assert.match(routePreview.body, /from '\.\.\/controllers\/orders\.controller'/);
    assert.match(testPreview.body, /from '\.\.\/\.\.\/src\/services\/orders\.service'/);

    const controllerIndexUpdate = result.updates.find((item) => item.file === 'src/controllers/index.ts');
    assert.equal(controllerIndexUpdate.content, "export * from './orders.controller';");
    const serviceIndexUpdate = result.updates.find((item) => item.file === 'src/services/index.ts');
    assert.equal(serviceIndexUpdate.content, "export * from './orders.service';");
  });
});

test('generate-feature creates feature-local index and respects route/test suffix conventions', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      ...baseNodePackage(),
      'src/modules/index.ts': '',
      'src/modules/user/user.routes.ts': 'export {}\n',
      'src/modules/user/user.service.ts': 'export {}\n',
      'tests/modules/user/user.test.ts': 'export {}\n',
      'docs/api/index.md': '# API\n',
    });
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['billing-report', '--root', dir, '--dry-run', '--json'], { cwd: ROOT });
    assert.equal(result.outputs.includes('src/modules/billing-report/billing-report.routes.ts'), true);
    assert.equal(result.outputs.includes('tests/modules/billing-report/billing-report.test.ts'), true);
    const featureIndexUpdate = result.updates.find((item) => item.file === 'src/modules/billing-report/index.ts');
    assert.match(featureIndexUpdate.content, /export \* from '\.\/billing-report\.controller';/);
    assert.match(featureIndexUpdate.content, /export \* from '\.\/billing-report\.routes';/);
  });
});
