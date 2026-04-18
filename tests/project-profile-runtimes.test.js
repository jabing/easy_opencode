const test = require('node:test');
const assert = require('node:assert/strict');
const { detectProjectProfile } = require('../src/core/project-profile.js');
const { withTempDir, writeFiles } = require('./test-helpers.js');

test('project-profile detects node fixture with validation commands', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'web-app',
        packageManager: 'pnpm@9.0.0',
        dependencies: { express: '^5.0.0' },
        devDependencies: { typescript: '^5.0.0', eslint: '^9.0.0' },
        scripts: { lint: 'eslint .', test: 'node --test', build: 'tsc -p tsconfig.json' },
      }, null, 2),
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020' } }, null, 2),
      'src/server.ts': 'export {}\n',
    });
  }, (dir) => {
    const profile = detectProjectProfile(dir);
    assert.equal(profile.runtime, 'node');
    assert.equal(profile.language, 'typescript');
    assert.equal(profile.framework, 'express');
    assert.equal(profile.package_manager, 'pnpm');
    assert.equal(profile.validation_by_kind.test, 'pnpm run test');
    assert.equal(profile.validation_by_kind.build, 'pnpm run build');
    assert.equal(profile.validation_by_kind.lint, 'pnpm run lint');
    assert.ok(profile.entrypoints.includes('src/server.ts'));
  });
});

test('project-profile detects django fixture with python validation commands', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'pyproject.toml': '[project]\nname = "django-app"\ndependencies = ["django>=5.0", "pytest>=8.0", "ruff>=0.4"]\n',
      'manage.py': '#!/usr/bin/env python\n',
      'config/settings.py': 'SECRET_KEY = "x"\n',
      'tests/test_models.py': 'def test_ok():\n    assert True\n',
    });
  }, (dir) => {
    const profile = detectProjectProfile(dir);
    assert.equal(profile.runtime, 'python');
    assert.equal(profile.framework, 'django');
    assert.equal(profile.validation_by_kind.test, 'python -m pytest -q');
    assert.equal(profile.validation_by_kind.build, 'python manage.py check');
    assert.equal(profile.validation_by_kind.lint, 'python -m ruff check .');
    assert.ok(profile.entrypoints.includes('manage.py'));
  });
});

test('project-profile detects go fixture with build and test validation commands', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/service\n\ngo 1.22\nrequire github.com/gin-gonic/gin v1.10.0\n',
      'cmd/api/main.go': 'package main\nfunc main() {}\n',
      '.golangci.yml': 'run:\n  timeout: 2m\n',
    });
  }, (dir) => {
    const profile = detectProjectProfile(dir);
    assert.equal(profile.runtime, 'go');
    assert.equal(profile.framework, 'gin');
    assert.equal(profile.validation_by_kind.build, 'go build ./...');
    assert.equal(profile.validation_by_kind.test, 'go test ./...');
    assert.equal(profile.validation_by_kind.lint, 'golangci-lint run');
    assert.ok(profile.entrypoints.includes('cmd/api/main.go'));
  });
});

test('project-profile detects java fixture with gradle wrapper commands', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'build.gradle': 'plugins { id "java"; id "org.springframework.boot" version "3.3.0" }\n',
      'gradlew': '#!/bin/sh\nexit 0\n',
      'src/main/resources/application.properties': 'server.port=8080\n',
      'src/test/java/com/example/AppTest.java': 'class AppTest {}\n',
    });
  }, (dir) => {
    const profile = detectProjectProfile(dir);
    assert.equal(profile.runtime, 'java');
    assert.equal(profile.framework, 'springboot');
    assert.equal(profile.validation_by_kind.build, './gradlew compileJava');
    assert.equal(profile.validation_by_kind.test, './gradlew test');
    assert.ok(profile.entrypoints.includes('src/main/resources/application.properties'));
  });
});
