const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const SKILL_RUNNER = path.join(ROOT, 'scripts', 'skill-runner.js');

function normalizePreview(preview) {
  return (preview || []).map((item) => ({ output: item.output, role: item.role }));
}

test('skill-runner scaffold dry-run generates a node service bundle with runtime-aware verify steps', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'sample-node',
        scripts: {
          build: 'tsc -p tsconfig.json',
          test: 'node --test',
        },
      }, null, 2),
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020' } }, null, 2),
      'src/services/index.ts': 'export {}\n',
    });
  }, (dir) => {
    const result = runNodeJson(SKILL_RUNNER, [
      'scaffold',
      'add-service-module',
      '--root', dir,
      '--dry-run',
      '--json',
      '--var', 'name=billing',
      '--var', 'subject=Billing',
    ], { cwd: ROOT });

    assert.equal(result.skill, 'add-service-module');
    assert.equal(result.runtime, 'node');
    assert.deepEqual(result.outputs, [
      'src/services/billing.service.ts',
      'tests/services/billing.service.test.ts',
      '.opencode/task-bundles/billing-service.integration.md',
    ]);
    assert.deepEqual(normalizePreview(result.preview), [
      { output: 'src/services/billing.service.ts', role: 'primary' },
      { output: 'tests/services/billing.service.test.ts', role: 'test' },
      { output: '.opencode/task-bundles/billing-service.integration.md', role: 'guide' },
    ]);
    assert.deepEqual(result.verify, ['npm run build', 'npx tsc --noEmit --pretty false', 'npm run test']);
    assert.equal(result.integration_status, 'planned');
  });
});

test('skill-runner scaffold dry-run generates python config bundle and keeps python-only verify commands', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'pyproject.toml': '[project]\nname = "sample-python"\nversion = "0.1.0"\ndependencies = ["pytest>=8.0"]\n',
      'app/config/__init__.py': '',
    });
  }, (dir) => {
    const result = runNodeJson(SKILL_RUNNER, [
      'scaffold',
      'add-config-module',
      '--root', dir,
      '--dry-run',
      '--json',
      '--var', 'name=payments',
      '--var', 'subject=Payments',
      '--var', 'env_key=PAYMENTS_URL',
    ], { cwd: ROOT });

    assert.equal(result.runtime, 'python');
    assert.deepEqual(result.outputs, [
      'app/config/payments.py',
      'tests/config/test_payments.py',
      '.opencode/task-bundles/payments.env.example',
      '.opencode/task-bundles/payments-config.integration.md',
    ]);
    assert.deepEqual(result.verify, ['python -m pytest -q', 'python -m compileall .']);
    assert.equal(result.integration_status, 'planned');
  });
});

test('skill-runner scaffold dry-run generates go test bundle and keeps go-only verify commands', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/sample\n\ngo 1.22\n',
    });
  }, (dir) => {
    const result = runNodeJson(SKILL_RUNNER, [
      'scaffold',
      'add-unit-test',
      '--root', dir,
      '--dry-run',
      '--json',
      '--var', 'name=account service',
      '--var', 'subject=Account service',
    ], { cwd: ROOT });

    assert.equal(result.runtime, 'go');
    assert.deepEqual(result.outputs, [
      'account_service_test.go',
      'testdata/account_service.json',
      '.opencode/task-bundles/account_service-test.integration.md',
    ]);
    assert.deepEqual(result.verify, ['go test ./...', 'go build ./...']);
  });
});

test('skill-runner scaffold dry-run generates java service bundle and keeps gradle wrapper commands', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'build.gradle': 'plugins { id "java" }\n',
      'gradlew': '#!/bin/sh\nexit 0\n',
    });
  }, (dir) => {
    const result = runNodeJson(SKILL_RUNNER, [
      'scaffold',
      'add-service-module',
      '--root', dir,
      '--dry-run',
      '--json',
      '--var', 'name=ledger',
      '--var', 'subject=Ledger',
      '--var', 'package_name=com.example.app',
    ], { cwd: ROOT });

    assert.equal(result.runtime, 'java');
    assert.deepEqual(result.outputs, [
      'src/main/java/com/example/app/LedgerService.java',
      'src/test/java/com/example/app/LedgerServiceTest.java',
      '.opencode/task-bundles/LedgerService.integration.md',
    ]);
    assert.deepEqual(result.verify, ['./gradlew compileJava', './gradlew test']);
  });
});
