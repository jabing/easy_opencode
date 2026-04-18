const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');

function fixture(memory) {
  return {
    'package.json': JSON.stringify({
      name: 'batch10-node-project',
      scripts: {
        build: 'node -e "process.exit(0)"',
        test: 'node -e "process.exit(0)"',
      },
      dependencies: {
        express: '^4.19.0',
        ...(memory.orm === 'prisma' ? { '@prisma/client': '^5.0.0' } : {}),
      },
      devDependencies: {
        ...(memory.test_framework === 'vitest' ? { vitest: '^2.0.0' } : {}),
        ...(memory.test_framework === 'jest' ? { jest: '^29.0.0' } : {}),
      },
    }, null, 2),
    '.opencode/project-memory.json': JSON.stringify({
      schema_version: '1.0',
      coding_style: 'functional',
      api_style: 'rest',
      test_framework: 'node:test',
      validation_lib: 'unknown',
      orm: 'unknown',
      auth_strategy: 'unknown',
      error_pattern: 'standard-errors',
      naming: { file_case: 'kebab', symbol_case: 'pascal-camel', feature_container: 'modules' },
      preferred_feature_shape: ['route', 'controller', 'service', 'repository', 'schema', 'test', 'docs'],
      ...memory,
    }, null, 2),
    'src/modules/user/user.route.ts': 'export const userRoute = true;\n',
    'src/modules/user/user.service.ts': 'export const userService = true;\n',
    'docs/api/index.md': '# API\n',
  };
}

test('prisma + typed errors + vitest change repository, service, route, and test content', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixture({ orm: 'prisma', error_pattern: 'typed-errors', test_framework: 'vitest' }));
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['invoice-sync', '--root', dir, '--json'], { cwd: ROOT });
    const repository = fs.readFileSync(path.join(dir, 'src/modules/invoice-sync/invoice-sync.repository.ts'), 'utf8');
    const service = fs.readFileSync(path.join(dir, 'src/modules/invoice-sync/invoice-sync.service.ts'), 'utf8');
    const route = fs.readFileSync(path.join(dir, 'src/modules/invoice-sync/invoice-sync.route.ts'), 'utf8');
    const testFile = fs.readFileSync(path.join(dir, 'tests/modules/invoice-sync/invoice-sync.spec.ts'), 'utf8');
    assert.equal(result.feature_planning.repository_style, 'prisma-repository');
    assert.equal(result.feature_planning.error_style, 'typed-errors');
    assert.equal(result.feature_planning.test_template_style, 'vitest');
    assert.ok(repository.includes("import type { PrismaClient } from '@prisma/client';"));
    assert.ok(repository.includes('inject PrismaClient and persist InvoiceSync records here'));
    assert.ok(service.includes('export class InvoiceSyncServiceError extends Error'));
    assert.ok(service.includes("throw new InvoiceSyncServiceError('Expected an object payload for InvoiceSync.'"));
    assert.ok(route.includes("import { InvoiceSyncServiceError } from './invoice-sync.service';"));
    assert.ok(route.includes('error instanceof InvoiceSyncServiceError'));
    assert.ok(testFile.includes("from 'vitest';"));
    assert.ok(testFile.includes('expect(result.ok).toBe(true);'));
  });
});

test('jest memory switches generated test template', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixture({ orm: 'unknown', error_pattern: 'standard-errors', test_framework: 'jest' }));
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['ledger-audit', '--root', dir, '--json'], { cwd: ROOT });
    const testFile = fs.readFileSync(path.join(dir, 'tests/modules/ledger-audit/ledger-audit.spec.ts'), 'utf8');
    const docs = fs.readFileSync(path.join(dir, 'docs/api/ledger-audit.md'), 'utf8');
    assert.equal(result.feature_planning.test_template_style, 'jest');
    assert.ok(testFile.includes("describe('LedgerAuditService'"));
    assert.ok(!testFile.includes('node:test'));
    assert.ok(docs.includes('Repository style: `generic-repository`'));
    assert.ok(docs.includes('Error style: `standard-errors`'));
    assert.ok(docs.includes('Test template style: `jest`'));
  });
});
