const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');
const SKILL_RUNNER = path.join(ROOT, 'scripts', 'skill-runner.js');

function baseNodePackage(extra = {}) {
  return {
    'package.json': JSON.stringify({
      name: 'batch4-node-project',
      scripts: {
        build: 'tsc -p tsconfig.json',
        test: 'vitest run',
      },
      dependencies: {
        express: '^4.19.0',
        zod: '^3.23.0',
        '@prisma/client': '^5.0.0',
        jsonwebtoken: '^9.0.0',
        ...(extra.dependencies || {}),
      },
      devDependencies: {
        vitest: '^2.0.0',
        ...(extra.devDependencies || {}),
      },
    }, null, 2),
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020' } }, null, 2),
  };
}

test('generate-feature writes inferred project-memory.json and surfaces memory in dry-run output', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      ...baseNodePackage(),
      'src/modules/index.ts': '',
      'src/modules/user/user.routes.ts': "import { z } from 'zod';\nexport function buildUser() {}\n",
      'src/modules/user/user.service.ts': "import { PrismaClient } from '@prisma/client';\nexport function buildUserService() { return new PrismaClient(); }\n",
      'docs/api/index.md': '# API\n',
    });
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['billing-report', '--root', dir, '--dry-run', '--json'], { cwd: ROOT });
    const memoryPath = path.join(dir, '.opencode', 'project-memory.json');
    assert.equal(fs.existsSync(memoryPath), true);
    const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
    assert.equal(memory.test_framework, 'vitest');
    assert.equal(memory.validation_lib, 'zod');
    assert.equal(memory.orm, 'prisma');
    assert.equal(memory.auth_strategy, 'jwt');
    assert.equal(memory.naming.file_case, 'kebab');
    assert.deepEqual(result.project_memory.test_framework, 'vitest');

    const docsPreview = result.preview.find((item) => item.module === 'docs');
    assert.match(docsPreview.body, /Validation: `zod`/);
    assert.match(docsPreview.body, /Test framework: `vitest`/);

    const integrationPreview = result.preview.find((item) => item.module === 'integration');
    assert.match(integrationPreview.body, /ORM: `prisma`/);
    assert.match(integrationPreview.body, /Auth: `jwt`/);
  });
});

test('skill-runner merges existing project memory overrides with inferred defaults', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      ...baseNodePackage(),
      '.opencode/project-memory.json': JSON.stringify({
        schema_version: '1.0',
        coding_style: 'functional',
        api_style: 'graphql',
        test_framework: 'vitest',
        validation_lib: 'zod',
        orm: 'prisma',
        auth_strategy: 'jwt',
        error_pattern: 'typed-errors',
        naming: { file_case: 'snake' },
        preferred_feature_shape: ['route', 'service', 'repository', 'schema', 'docs'],
      }, null, 2),
      'src/features/index.ts': '',
      'src/features/user/user.route.ts': 'export {}\n',
      'src/features/user/user.service.ts': 'export {}\n',
      'docs/api/index.md': '# API\n',
    });
  }, (dir) => {
    const result = runNodeJson(SKILL_RUNNER, [
      'scaffold',
      'generate-node-feature',
      '--root', dir,
      '--dry-run',
      '--json',
      '--var', 'name=checkout',
      '--var', 'subject=Checkout',
    ], { cwd: ROOT });

    assert.equal(result.project_memory.api_style, 'graphql');
    assert.equal(result.project_memory.naming.file_case, 'snake');
    assert.equal(result.outputs.includes('tests/features/checkout/checkout.spec.ts'), false);
    const integrationPreview = result.preview.find((item) => item.module === 'integration');
    assert.match(integrationPreview.body, /API style: `graphql`/);
    assert.match(integrationPreview.body, /Preferred feature shape: `route,service,repository,schema,docs`/);
  });
});
