const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');

function memoryDrivenFixture(memory, extra = {}) {
  return {
    'package.json': JSON.stringify({
      name: 'batch9-node-project',
      scripts: {
        build: 'node -e "process.exit(0)"',
        test: 'node -e "process.exit(0)"',
      },
      dependencies: {
        express: '^4.19.0',
        ...(memory.validation_lib === 'zod' ? { zod: '^3.23.0' } : {}),
      },
    }, null, 2),
    '.opencode/project-memory.json': JSON.stringify({
      schema_version: '1.0',
      coding_style: 'functional',
      api_style: 'rest',
      test_framework: 'node:test',
      validation_lib: 'unknown',
      orm: 'prisma',
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

test('zod and jwt memory change generated schema and route content', () => {
  withTempDir((dir) => {
    writeFiles(dir, memoryDrivenFixture({ validation_lib: 'zod', auth_strategy: 'jwt', api_style: 'rest' }));
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['secure-report', '--root', dir, '--json'], { cwd: ROOT });
    const schema = fs.readFileSync(path.join(dir, 'src/modules/secure-report/secure-report.schema.ts'), 'utf8');
    const route = fs.readFileSync(path.join(dir, 'src/modules/secure-report/secure-report.route.ts'), 'utf8');
    const docs = fs.readFileSync(path.join(dir, 'docs/api/secure-report.md'), 'utf8');
    assert.equal(result.feature_planning.schema_style, 'zod-first');
    assert.equal(result.feature_planning.auth_mode, 'bearer-guard');
    assert.match(schema, /import \{ z \} from 'zod';/);
    assert.match(schema, /export const SecureReportPayloadSchema = z\.object/);
    assert.match(route, /SecureReportPayloadSchema\.parse\(req\.body \?\? \{\}\)/);
    assert.match(route, /Missing bearer token/);
    assert.match(docs, /Auth: `jwt`/);
    assert.match(docs, /Route style: `rest-endpoint`/);
    assert.match(docs, /Auth mode: `bearer-guard`/);
  });
});

test('graphql and session memory change generated route endpoint and response envelope', () => {
  withTempDir((dir) => {
    writeFiles(dir, memoryDrivenFixture({ validation_lib: 'unknown', auth_strategy: 'session', api_style: 'graphql' }));
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['member-profile', '--root', dir, '--json'], { cwd: ROOT });
    const route = fs.readFileSync(path.join(dir, 'src/modules/member-profile/member-profile.route.ts'), 'utf8');
    const integration = fs.readFileSync(path.join(dir, '.opencode/feature-bundles/member-profile.integration.md'), 'utf8');
    assert.equal(result.feature_planning.route_style, 'graphql-endpoint');
    assert.equal(result.feature_planning.auth_mode, 'session-guard');
    assert.match(route, /router\.post\('\/graphql'/);
    assert.match(route, /const requestWithSession = req as typeof req & \{ session\?: unknown \};/);
    assert.match(route, /req\.body\?\.variables\?\.input \?\? \{\}/);
    assert.match(route, /res\.status\(200\)\.json\(\{ data: \{ result \} \}\);/);
    assert.match(integration, /Route style: `graphql-endpoint`/);
    assert.match(integration, /Auth mode: `session-guard`/);
  });
});
