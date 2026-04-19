const test = require('node:test');
const assert = require('node:assert/strict');
const { withTempDir, writeFiles } = require('./test-helpers.js');
const { createJavaProvider } = require('../src/core/languages/providers/java.js');
const { buildImplementationContext } = require('../src/core/implementation/context.js');
const { normalizeFailures } = require('../src/shared/error-normalizers/index.js');

function javaFixture() {
  return {
    'build.gradle': 'plugins { id "java"; id "org.springframework.boot" version "3.3.0" }\n',
    'gradlew': '#!/bin/sh\nexit 0\n',
    'src/main/java/com/example/App.java': [
      'package com.example;',
      '',
      'import com.example.web.Router;',
      '',
      'public class App {',
      '  public static void main(String[] args) {',
      '    Router.register();',
      '  }',
      '}',
      '',
    ].join('\n'),
    'src/main/java/com/example/web/Router.java': [
      'package com.example.web;',
      '',
      'public class Router {',
      '  public static void register() {}',
      '}',
      '',
    ].join('\n'),
    'src/test/java/com/example/AppTest.java': [
      'package com.example;',
      '',
      'class AppTest {}',
      '',
    ].join('\n'),
  };
}

test('java provider summarizes packages, imports, and related tests', () => {
  const provider = createJavaProvider();
  withTempDir((dir) => {
    writeFiles(dir, javaFixture());
  }, (dir) => {
    assert.equal(provider.supports({ runtime: 'java' }, null), true);
    assert.equal(provider.supports({ runtime: 'node' }, 'src/main/java/com/example/App.java'), true);
    assert.equal(provider.supports({ runtime: 'java' }, 'src/index.ts'), false);

    const analysis = provider.analyzeProject({ rootDir: dir, objective: 'fix app wiring', targets: ['src/main/java/com/example/App.java'] });
    const summary = provider.summarizeTarget({ rootDir: dir, target: 'src/main/java/com/example/App.java', analysis });

    assert.equal(summary.provider_id, 'java');
    assert.equal(summary.package_name, 'com.example');
    assert.equal(summary.owning_package, 'src/main/java/com/example');
    assert.ok(summary.import_paths.includes('com.example.web.Router'));
    assert.ok(summary.related_tests.includes('src/test/java/com/example/AppTest.java'));
    assert.ok(summary.intelligence.direct_neighbors.includes('src/main/java/com/example/web/Router.java'));
    assert.equal(analysis.validation.find((item) => item.kind === 'build').command, './gradlew compileJava');
  });
});

test('implementation context routes java targets through the default registry', () => {
  withTempDir((dir) => {
    writeFiles(dir, javaFixture());
  }, (dir) => {
    const context = buildImplementationContext({
      rootDir: dir,
      objective: 'fix app wiring',
      targets: ['src/main/java/com/example/App.java'],
    });
    const target = context.targets.find((item) => item.path === 'src/main/java/com/example/App.java');
    assert.equal(context.provider_groups[0].provider_id, 'java');
    assert.equal(context.composite.default_provider_id, 'java');
    assert.equal(target.provider_id, 'java');
  });
});

test('java failure normalization captures compile, import, and surefire failures', () => {
  const compileFailures = normalizeFailures({
    runtime: 'node',
    language: 'javascript',
    provider: 'java-semantic',
    tool: 'build',
    text: 'src/main/java/com/example/App.java:12: error: cannot find symbol',
  });
  const importFailures = normalizeFailures({
    runtime: 'java',
    language: 'java',
    tool: 'build',
    text: 'error: package com.example.missing does not exist',
  });
  const testFailures = normalizeFailures({
    runtime: 'java',
    language: 'java',
    tool: 'test',
    text: '[ERROR] com.example.AppTest Time elapsed: 0.1 s <<< FAILURE!',
  });

  assert.ok(compileFailures.some((item) => item.category === 'compile_error' && item.file === 'src/main/java/com/example/App.java'));
  assert.ok(importFailures.some((item) => item.category === 'import_resolve' && item.symbol === 'com.example.missing'));
  assert.ok(testFailures.some((item) => item.category === 'test_failure' && item.symbol === 'com.example.AppTest'));
});
