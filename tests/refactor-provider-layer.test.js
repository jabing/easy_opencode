const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { describeProviders, resolveProvider, runRefactorOperation } = require('../src/core/refactor/service.js');
const { runNodeResult, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const AST_REWRITE = path.join(ROOT, 'scripts', 'ast-rewrite.js');

test('provider catalog exposes typescript, python, go, and fallback providers', () => {
  const catalog = describeProviders();
  const ids = catalog.map((item) => item.id).sort();
  assert.deepEqual(ids, ['go-semantic', 'java-semantic', 'python-semantic', 'text-fallback', 'typescript-semantic']);
  const python = catalog.find((item) => item.id === 'python-semantic');
  const go = catalog.find((item) => item.id === 'go-semantic');
  const java = catalog.find((item) => item.id === 'java-semantic');
  assert.ok(python);
  assert.ok(go);
  assert.ok(java);
  assert.match(python.execution_mode, /semantic_ast/);
  assert.equal(go.execution_mode, 'indexed_symbol');
  assert.equal(java.execution_mode, 'indexed_symbol');
});

test('resolveProvider chooses python semantic provider for python rename-symbol projects', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'app/main.py': 'def old_name():\n    return old_name\n',
    });
  }, (dir) => {
    const provider = resolveProvider('rename-symbol', { baseDir: dir });
    assert.equal(provider.id, 'python-semantic');
  });
});

test('runRefactorOperation applies python semantic rename without touching comments or strings', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'app/main.py': [
        'def old_name():',
        '    # old_name should stay in comments',
        '    label = "old_name should stay in strings"',
        '    return old_name',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const result = runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'old_name',
      toName: 'new_name',
      dryRun: false,
    });
    assert.equal(result.provider_id, 'python-semantic');
    assert.equal(result.execution_mode, 'semantic_ast');
    assert.equal(result.changedFiles, 1);
    const body = fs.readFileSync(path.join(dir, 'app/main.py'), 'utf8');
    assert.match(body, /def new_name\(\):/);
    assert.match(body, /return new_name/);
    assert.match(body, /# old_name should stay in comments/);
    assert.match(body, /"old_name should stay in strings"/);
  });
});

test('runRefactorOperation applies python semantic add-import and ensure-export', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'app/models/__init__.py': 'from .existing import Existing\n\n__all__ = ["Existing"]\n',
    });
  }, (dir) => {
    const file = path.join(dir, 'app/models/__init__.py');
    const importResult = runRefactorOperation('add-import', {
      file,
      moduleName: '.billing',
      importName: 'Billing',
      dryRun: false,
    });
    assert.equal(importResult.provider_id, 'python-semantic');

    const exportResult = runRefactorOperation('ensure-export', {
      file,
      name: 'Billing',
      dryRun: false,
    });
    assert.equal(exportResult.provider_id, 'python-semantic');

    const body = fs.readFileSync(file, 'utf8');
    assert.match(body, /from \.billing import Billing/);
    assert.match(body, /__all__ = \["Existing", "Billing"\]/);
  });
});


test('resolveProvider chooses java semantic provider for java rename-symbol projects', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/main/java/com/example/demo/BillingService.java': 'package com.example.demo;\n\nclass BillingService {\n  String legacyName() {\n    return legacyNameValue;\n  }\n\n  String legacyNameValue = "legacyName";\n}\n',
    });
  }, (dir) => {
    const provider = resolveProvider('rename-symbol', { baseDir: dir });
    assert.equal(provider.id, 'java-semantic');
  });
});

test('runRefactorOperation applies java semantic rename without touching comments or strings', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/main/java/com/example/demo/BillingService.java': [
        'package com.example.demo;',
        '',
        'class BillingService {',
        '  // legacyNameValue should stay in comments',
        '  String legacyName() {',
        '    String label = "legacyNameValue should stay in strings";',
        '    return legacyNameValue + label;',
        '  }',
        '',
        '  String legacyNameValue = "legacyName";',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const result = runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'legacyNameValue',
      toName: 'modernNameValue',
      dryRun: false,
    });
    assert.equal(result.provider_id, 'java-semantic');
    assert.equal(result.execution_mode, 'token_aware');
    const body = fs.readFileSync(path.join(dir, 'src/main/java/com/example/demo/BillingService.java'), 'utf8');
    assert.match(body, /modernNameValue/);
    assert.match(body, /legacyNameValue should stay in comments/);
    assert.match(body, /"legacyNameValue should stay in strings"/);
  });
});



test('runRefactorOperation applies java rename-at within a single method scope', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/main/java/com/example/demo/BillingService.java': [
        'package com.example.demo;',
        '',
        'class BillingService {',
        '  private String legacyName = "field";',
        '',
        '  String first() {',
        '    String legacyName = "local";',
        '    return legacyName;',
        '  }',
        '',
        '  String second() {',
        '    return legacyName;',
        '  }',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const file = path.join(dir, 'src/main/java/com/example/demo/BillingService.java');
    const result = runRefactorOperation('rename-at', {
      baseDir: dir,
      file,
      line: 7,
      col: 13,
      toName: 'localName',
      dryRun: false,
    });
    assert.equal(result.provider_id, 'java-semantic');
    assert.equal(result.execution_mode, 'indexed_symbol');
    const body = fs.readFileSync(file, 'utf8');
    assert.match(body, /String localName = "local";/);
    assert.match(body, /return localName;/);
    assert.match(body, /private String legacyName = "field";/);
    assert.ok(body.includes('String second() {\n    return legacyName;'));
  });
});

test('runRefactorOperation applies java semantic add-import, remove-import, and ensure-export', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/main/java/com/example/demo/BillingService.java': [
        'package com.example.demo;',
        '',
        'import java.util.Map;',
        '',
        'class BillingService {',
        '  Map<String, Object> payload() {',
        '    return Map.of();',
        '  }',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const file = path.join(dir, 'src/main/java/com/example/demo/BillingService.java');
    const addImportResult = runRefactorOperation('add-import', {
      file,
      moduleName: 'org.springframework.context.annotation',
      importName: 'Bean',
      dryRun: false,
    });
    assert.equal(addImportResult.provider_id, 'java-semantic');

    const removeImportResult = runRefactorOperation('remove-import', {
      file,
      moduleName: 'java.util',
      importName: 'Map',
      dryRun: false,
    });
    assert.equal(removeImportResult.provider_id, 'java-semantic');

    const ensureExportResult = runRefactorOperation('ensure-export', {
      file,
      name: 'BillingService',
      kind: 'class',
      dryRun: false,
    });
    assert.equal(ensureExportResult.provider_id, 'java-semantic');

    const body = fs.readFileSync(file, 'utf8');
    assert.match(body, /import org\.springframework\.context\.annotation\.Bean;/);
    assert.doesNotMatch(body, /import java\.util\.Map;/);
    assert.match(body, /public class BillingService/);
  });
});





test('runRefactorOperation blocks java indexed rename-symbol when type declarations are ambiguous across packages', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/main/java/com/example/demo/BillingService.java': 'package com.example.demo;\n\npublic class BillingService {}\n',
      'src/main/java/com/example/api/BillingService.java': 'package com.example.api;\n\npublic class BillingService {}\n',
    });
  }, (dir) => {
    assert.throws(() => runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'BillingService',
      toName: 'AccountService',
      dryRun: false,
    }), /ambiguous/i);
  });
});

test('runRefactorOperation blocks java indexed rename-symbol on target type collisions', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/main/java/com/example/demo/BillingService.java': 'package com.example.demo;\n\npublic class BillingService {}\n',
      'src/main/java/com/example/demo/AccountService.java': 'package com.example.demo;\n\npublic class AccountService {}\n',
    });
  }, (dir) => {
    assert.throws(() => runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'BillingService',
      toName: 'AccountService',
      dryRun: false,
    }), /collide/i);
  });
});
test('runRefactorOperation applies java indexed rename-symbol across declaration and import graph', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/main/java/com/example/demo/BillingService.java': [
        'package com.example.demo;',
        '',
        'public class BillingService {',
        '  BillingService create() {',
        '    return new BillingService();',
        '  }',
        '}',
        '',
      ].join('\n'),
      'src/main/java/com/example/demo/BillingController.java': [
        'package com.example.demo;',
        '',
        'class BillingController {',
        '  BillingService service = new BillingService();',
        '',
        '  String label() {',
        '    String BillingService = "shadow";',
        '    return BillingService;',
        '  }',
        '}',
        '',
      ].join('\n'),
      'src/main/java/com/example/api/BillingEndpoint.java': [
        'package com.example.api;',
        '',
        'import com.example.demo.BillingService;',
        '',
        'class BillingEndpoint {',
        '  BillingService service() {',
        '    return new BillingService();',
        '  }',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const result = runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'BillingService',
      toName: 'AccountService',
      dryRun: false,
    });
    assert.equal(result.provider_id, 'java-semantic');
    assert.equal(result.execution_mode, 'indexed_symbol');
    assert.equal(result.changedFiles, 3);
    const serviceBody = fs.readFileSync(path.join(dir, 'src/main/java/com/example/demo/BillingService.java'), 'utf8');
    const controllerBody = fs.readFileSync(path.join(dir, 'src/main/java/com/example/demo/BillingController.java'), 'utf8');
    const endpointBody = fs.readFileSync(path.join(dir, 'src/main/java/com/example/api/BillingEndpoint.java'), 'utf8');
    assert.match(serviceBody, /public class AccountService/);
    assert.match(serviceBody, /return new AccountService\(\);/);
    assert.match(controllerBody, /AccountService service = new AccountService\(\);/);
    assert.match(controllerBody, /String BillingService = "shadow";/);
    assert.match(endpointBody, /import com\.example\.demo\.AccountService;/);
    assert.match(endpointBody, /AccountService service\(\)/);
  });
});



test('runRefactorOperation blocks java rename-at local collisions inside a method scope', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/main/java/com/example/demo/BillingService.java': [
        'package com.example.demo;',
        '',
        'public class BillingService {',
        '  String label() {',
        '    String legacyName = "old";',
        '    String currentName = "new";',
        '    return legacyName + currentName;',
        '  }',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const file = path.join(dir, 'src/main/java/com/example/demo/BillingService.java');
    assert.throws(() => runRefactorOperation('rename-at', {
      baseDir: dir,
      file,
      line: 5,
      col: 12,
      toName: 'currentName',
      dryRun: false,
    }), /collide/i);
  });
});
test('runRefactorOperation applies java rename-at on a class declaration across related files', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/main/java/com/example/demo/BillingService.java': [
        'package com.example.demo;',
        '',
        'public class BillingService {',
        '  BillingService create() {',
        '    return new BillingService();',
        '  }',
        '}',
        '',
      ].join('\n'),
      'src/main/java/com/example/api/BillingEndpoint.java': [
        'package com.example.api;',
        '',
        'import com.example.demo.BillingService;',
        '',
        'class BillingEndpoint {',
        '  BillingService service() {',
        '    return new BillingService();',
        '  }',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const file = path.join(dir, 'src/main/java/com/example/demo/BillingService.java');
    const result = runRefactorOperation('rename-at', {
      baseDir: dir,
      file,
      line: 3,
      col: 14,
      toName: 'AccountService',
      dryRun: false,
    });
    assert.equal(result.provider_id, 'java-semantic');
    assert.equal(result.execution_mode, 'indexed_symbol');
    const serviceBody = fs.readFileSync(file, 'utf8');
    const endpointBody = fs.readFileSync(path.join(dir, 'src/main/java/com/example/api/BillingEndpoint.java'), 'utf8');
    assert.match(serviceBody, /public class AccountService/);
    assert.match(endpointBody, /import com\.example\.demo\.AccountService;/);
    assert.match(endpointBody, /return new AccountService\(\);/);
  });
});

test('ast-rewrite CLI reports java semantic provider selection', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/main/java/com/example/demo/BillingService.java': 'package com.example.demo;\n\nclass BillingService {\n  String legacyName() {\n    return legacyName;\n  }\n}\n',
    });
  }, (dir) => {
    const providersResult = runNodeResult(AST_REWRITE, ['providers'], { cwd: ROOT });
    assert.equal(providersResult.code, 0);
    assert.match(providersResult.stdout, /java-semantic/);

    const rewriteResult = runNodeResult(AST_REWRITE, [
      'rename-symbol',
      '--from', 'legacyName',
      '--to', 'modernName',
      '--path', dir,
    ], { cwd: ROOT });

    assert.equal(rewriteResult.code, 0);
    assert.match(rewriteResult.stdout, /provider=java-semantic/);
    assert.match(rewriteResult.stdout, /mode=token_aware/);
  });
});

test('ast-rewrite CLI reports python semantic provider selection', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'service/main.py': 'def legacy_name():\n    return legacy_name\n',
    });
  }, (dir) => {
    const providersResult = runNodeResult(AST_REWRITE, ['providers'], { cwd: ROOT });
    assert.equal(providersResult.code, 0);
    assert.match(providersResult.stdout, /python-semantic/);

    const rewriteResult = runNodeResult(AST_REWRITE, [
      'rename-symbol',
      '--from', 'legacy_name',
      '--to', 'modern_name',
      '--path', dir,
    ], { cwd: ROOT });

    assert.equal(rewriteResult.code, 0);
    assert.match(rewriteResult.stdout, /provider=python-semantic/);
    assert.match(rewriteResult.stdout, /mode=semantic_ast/);
  });
});
