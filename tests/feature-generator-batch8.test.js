const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');

function classBasedFixture(files = {}) {
  return {
    'package.json': JSON.stringify({
      name: 'batch8-node-project',
      scripts: {
        build: 'node -e "process.exit(0)"',
        test: 'node -e "process.exit(0)"',
      },
      dependencies: {
        express: '^4.19.0',
      },
    }, null, 2),
    '.opencode/project-memory.json': JSON.stringify({
      schema_version: '1.0',
      coding_style: 'class-based',
      api_style: 'rest',
      test_framework: 'node:test',
      validation_lib: 'zod',
      orm: 'prisma',
      auth_strategy: 'jwt',
      error_pattern: 'typed-errors',
      naming: { file_case: 'kebab', symbol_case: 'pascal-camel', feature_container: 'modules' },
      preferred_feature_shape: ['route', 'controller', 'service', 'repository', 'schema', 'test', 'docs'],
    }, null, 2),
    'src/modules/user/user.route.ts': 'export const userRoute = true;\n',
    'src/modules/user/user.service.ts': 'export const userService = true;\n',
    'docs/api/index.md': '# API\n',
    ...files,
  };
}

test('project memory selects class-based implementation templates', () => {
  withTempDir((dir) => {
    writeFiles(dir, classBasedFixture());
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['event-bus', '--root', dir, '--json'], { cwd: ROOT });
    const controllerPath = path.join(dir, 'src/modules/event-bus/event-bus.controller.ts');
    const servicePath = path.join(dir, 'src/modules/event-bus/event-bus.service.ts');
    const controller = fs.readFileSync(controllerPath, 'utf8');
    const service = fs.readFileSync(servicePath, 'utf8');
    assert.equal(result.feature_planning.implementation_style, 'class-based');
    assert.match(controller, /export class EventBusController/);
    assert.match(service, /export class EventBusService/);
    const integration = fs.readFileSync(path.join(dir, '.opencode/feature-bundles/event-bus.integration.md'), 'utf8');
    assert.match(integration, /Implementation style: `class-based`/);
    assert.match(integration, /Shape strategy: `project-guided`/);
  });
});

test('successful generation persists preferred feature shape and last generation details', () => {
  withTempDir((dir) => {
    writeFiles(dir, classBasedFixture());
  }, (dir) => {
    runNodeJson(GENERATE_FEATURE, ['audit-log', '--root', dir, '--with-test', 'false', '--json'], { cwd: ROOT });
    const memory = JSON.parse(fs.readFileSync(path.join(dir, '.opencode/project-memory.json'), 'utf8'));
    assert.deepEqual(memory.preferred_feature_shape.slice(0, 6), ['route', 'controller', 'service', 'repository', 'schema', 'docs']);
    assert.equal(memory.last_feature_generation.feature_name, 'audit-log');
    assert.equal(memory.last_feature_generation.implementation_style, 'class-based');
    assert.equal(memory.last_feature_generation.shape_strategy, 'project-guided');
    assert.ok(Array.isArray(memory.last_feature_generation.enabled_modules));
    assert.ok(!memory.last_feature_generation.enabled_modules.includes('test'));
  });
});
