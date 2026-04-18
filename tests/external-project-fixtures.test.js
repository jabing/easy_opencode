const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { initCommittedGitRepo, runNodeJson, runNodeResult, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const PROJECT_PROFILE = path.join(ROOT, 'scripts', 'project-profile.js');
const SKILL_RUNNER = path.join(ROOT, 'scripts', 'skill-runner.js');
const QUALITY_GATE = path.join(ROOT, 'scripts', 'quality-gate.js');
const RELEASE_CHECK = path.join(ROOT, 'scripts', 'release-check.js');

function setupFixture(dir, files) {
  writeFiles(dir, { '.gitignore': 'node_modules\n', ...files });
  initCommittedGitRepo(dir);
}

function scaffold(dir, skill, vars = []) {
  return runNodeJson(SKILL_RUNNER, ['scaffold', skill, '--root', dir, '--dry-run', '--json', ...vars.flatMap((item) => ['--var', item])], { cwd: ROOT });
}

test('node api fixture stays release-checkable end to end', () => {
  withTempDir((dir) => {
    setupFixture(dir, {
      'package.json': JSON.stringify({ name: 'node-api', scripts: { test: 'node --test', build: 'tsc -p tsconfig.json', lint: 'eslint .' }, dependencies: { express: '^5.0.0' }, devDependencies: { typescript: '^5.0.0' } }, null, 2),
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020' } }, null, 2),
      'src/server.ts': 'export {}\n',
    });
  }, (dir) => {
    const profile = runNodeJson(PROJECT_PROFILE, ['--json'], { cwd: dir });
    const bundle = scaffold(dir, 'add-service-module', ['name=billing', 'subject=Billing']);
    const quality = runNodeJson(QUALITY_GATE, ['--json'], { cwd: dir });
    const release = JSON.parse(runNodeResult(RELEASE_CHECK, ['--json'], { cwd: dir }).stdout);

    assert.equal(profile.runtime, 'node');
    assert.equal(bundle.runtime, 'node');
    assert.deepEqual(bundle.verify, ['npm run build', 'npx tsc --noEmit --pretty false', 'npm run lint', 'npm run test']);
    assert.equal(quality.gate, 'PASS');
    assert.ok(['caution', 'blocked', 'ready', 'ready_with_override'].includes(release.decision));
  });
});

test('python service fixture keeps python-only verify and release-check output stable', () => {
  withTempDir((dir) => {
    setupFixture(dir, {
      'pyproject.toml': '[project]\nname="py-service"\ndependencies=["fastapi>=0.111","pytest>=8.0","ruff>=0.4"]\n',
      'app/api/__init__.py': '',
      'app/main.py': 'app = None\n',
      'tests/test_health.py': 'def test_ok():\n    assert True\n',
    });
  }, (dir) => {
    const profile = runNodeJson(PROJECT_PROFILE, ['--json'], { cwd: dir });
    const bundle = scaffold(dir, 'add-config-module', ['name=payments', 'subject=Payments', 'env_key=PAYMENTS_URL']);
    const quality = runNodeJson(QUALITY_GATE, ['--json'], { cwd: dir });
    const release = JSON.parse(runNodeResult(RELEASE_CHECK, ['--json'], { cwd: dir }).stdout);

    assert.equal(profile.runtime, 'python');
    assert.equal(bundle.runtime, 'python');
    assert.deepEqual(bundle.verify, ['python -m pytest -q', 'python -m ruff check .', 'python -m compileall .']);
    assert.equal(quality.gate, 'PASS');
    assert.ok(Array.isArray(release.checks));
  });
});

test('go service fixture keeps go-only verify and release-check output stable', () => {
  withTempDir((dir) => {
    setupFixture(dir, {
      'go.mod': 'module example.com/service\n\ngo 1.22\nrequire github.com/gin-gonic/gin v1.10.0\n',
      'cmd/api/main.go': 'package main\nfunc main() {}\n',
      '.golangci.yml': 'run:\n  timeout: 2m\n',
    });
  }, (dir) => {
    const profile = runNodeJson(PROJECT_PROFILE, ['--json'], { cwd: dir });
    const bundle = scaffold(dir, 'add-unit-test', ['name=account service', 'subject=Account service']);
    const quality = runNodeJson(QUALITY_GATE, ['--json'], { cwd: dir });
    const release = JSON.parse(runNodeResult(RELEASE_CHECK, ['--json'], { cwd: dir }).stdout);

    assert.equal(profile.runtime, 'go');
    assert.equal(bundle.runtime, 'go');
    assert.deepEqual(bundle.verify, ['go test ./...', 'golangci-lint run', 'go build ./...']);
    assert.equal(quality.gate, 'PASS');
    assert.ok(Array.isArray(release.checks));
  });
});

test('java spring fixture keeps gradle-wrapper verify and release-check output stable', () => {
  withTempDir((dir) => {
    setupFixture(dir, {
      'build.gradle': 'plugins { id "java"; id "org.springframework.boot" version "3.3.0" }\n',
      'gradlew': '#!/bin/sh\nexit 0\n',
      'src/main/resources/application.properties': 'server.port=8080\n',
      'src/test/java/com/example/AppTest.java': 'class AppTest {}\n',
    });
  }, (dir) => {
    const profile = runNodeJson(PROJECT_PROFILE, ['--json'], { cwd: dir });
    const bundle = scaffold(dir, 'add-service-module', ['name=ledger', 'subject=Ledger', 'package_name=com.example.app']);
    const quality = runNodeJson(QUALITY_GATE, ['--json'], { cwd: dir });
    const release = JSON.parse(runNodeResult(RELEASE_CHECK, ['--json'], { cwd: dir }).stdout);

    assert.equal(profile.runtime, 'java');
    assert.equal(bundle.runtime, 'java');
    assert.deepEqual(bundle.verify, ['./gradlew compileJava', './gradlew test']);
    assert.equal(quality.gate, 'PASS');
    assert.ok(Array.isArray(release.checks));
  });
});
