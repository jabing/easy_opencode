const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { applyActionUpdates } = require('../src/core/skills/scaffold/updates.js');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const SKILL_RUNNER = path.join(ROOT, 'scripts', 'skill-runner.js');

test('patch_framework_entry adds Spring Import annotation without inserting a blank separator', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/main/java/com/example/demo/Application.java': [
        'package com.example.demo;',
        '',
        'import org.springframework.boot.autoconfigure.SpringBootApplication;',
        '',
        '@SpringBootApplication',
        'public class Application {',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const updates = applyActionUpdates({
      updates: [
        {
          type: 'patch_framework_entry',
          file: 'src/main/java/com/example/demo/Application.java',
          import_statement: 'import com.example.demo.BillingService;',
          registration_statement: '@org.springframework.context.annotation.Import(BillingService.class)',
          registration_anchor: { regex: '@SpringBootApplication(?:\\([^)]*\\))?', flags: 'm' },
          registration_strategy: 'after_anchor',
          registration_blank_line: false,
          on_missing_registration_anchor: 'append',
        },
      ],
    }, dir, {}, {}, 'apply');

    assert.equal(updates[0].status, 'updated');
    const body = fs.readFileSync(path.join(dir, 'src/main/java/com/example/demo/Application.java'), 'utf8');
    assert.match(body, /import com\.example\.demo\.BillingService;/);
    assert.match(body, /@SpringBootApplication\n@org\.springframework\.context\.annotation\.Import\(BillingService\.class\)\npublic class Application/);
  });
});

test('register_provider inserts Spring bean factory method inside config class', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/main/java/com/example/demo/config/AppConfig.java': [
        'package com.example.demo.config;',
        '',
        'public class AppConfig {',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const updates = applyActionUpdates({
      updates: [
        {
          type: 'register_provider',
          file: 'src/main/java/com/example/demo/config/AppConfig.java',
          import_statement: 'import com.example.demo.BillingService;',
          registration_statement: '@org.springframework.context.annotation.Bean\nBillingService billingService() {\n    return new BillingService();\n}',
          registration_anchor: { regex: 'class\\s+[A-Za-z0-9_]+\\s*\\{', flags: 'm' },
          registration_strategy: 'after_anchor',
          registration_indent_mode: 'anchor_block',
          registration_indent_unit: '    ',
          on_missing_registration_anchor: 'append',
        },
      ],
    }, dir, {}, {}, 'apply');

    assert.equal(updates[0].status, 'updated');
    const body = fs.readFileSync(path.join(dir, 'src/main/java/com/example/demo/config/AppConfig.java'), 'utf8');
    assert.match(body, /import com\.example\.demo\.BillingService;/);
    assert.match(body, /\n    @org\.springframework\.context\.annotation\.Bean\n    BillingService billingService\(\) \{\n        return new BillingService\(\);\n    \}\n/);
  });
});

test('spring scaffold targets framework entry and bean config wiring primitives', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'pom.xml': '<project></project>\n',
      'docs/api/index.md': '# API\n',
      'src/main/java/com/example/demo/Application.java': [
        'package com.example.demo;',
        '',
        'import org.springframework.boot.autoconfigure.SpringBootApplication;',
        '',
        '@SpringBootApplication',
        'public class Application {',
        '}',
        '',
      ].join('\n'),
      'src/main/java/com/example/demo/config/AppConfig.java': [
        'package com.example.demo.config;',
        '',
        'public class AppConfig {',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const result = runNodeJson(SKILL_RUNNER, [
      'scaffold',
      'add-spring-controller',
      '--root', dir,
      '--dry-run',
      '--json',
      '--var', 'name=billing',
      '--var', 'route_path=/billing',
      '--var', 'package_name=com.example.demo',
    ], { cwd: ROOT });

    const frameworkEntry = result.updates.find((item) => item.primitive === 'patch_framework_entry' && item.resolved_file === 'src/main/java/com/example/demo/Application.java');
    const beanConfig = result.updates.find((item) => item.primitive === 'register_provider' && item.resolved_file === 'src/main/java/com/example/demo/config/AppConfig.java');
    assert.ok(frameworkEntry);
    assert.ok(beanConfig);
    assert.equal(frameworkEntry.status, 'would_apply');
    assert.equal(beanConfig.status, 'would_apply');
  });
});
