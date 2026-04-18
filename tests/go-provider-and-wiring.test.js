const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { resolveProvider, runRefactorOperation } = require('../src/core/refactor/service.js');
const { applyActionUpdates } = require('../src/core/skills/scaffold/updates.js');
const { runNodeJson, runNodeResult, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const AST_REWRITE = path.join(ROOT, 'scripts', 'ast-rewrite.js');
const SKILL_RUNNER = path.join(ROOT, 'scripts', 'skill-runner.js');

test('resolveProvider chooses go semantic provider for go rename-symbol projects', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': 'package handlers\n\nfunc legacyRoute() string {\n\treturn legacyRouteName\n}\n\nvar legacyRouteName = "legacyRoute"\n',
    });
  }, (dir) => {
    const provider = resolveProvider('rename-symbol', { baseDir: dir });
    assert.equal(provider.id, 'go-semantic');
  });
});

test('runRefactorOperation applies go semantic rename without touching comments or strings', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': [
        'package handlers',
        '',
        '// legacyHandlerName should stay in comments',
        'func legacyHandler() string {',
        '\tlabel := "legacyHandlerName should stay in strings"',
        '\treturn legacyHandlerName + label',
        '}',
        '',
        'var legacyHandlerName = "legacyHandler"',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const result = runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'legacyHandlerName',
      toName: 'modernHandlerName',
      dryRun: false,
    });
    assert.equal(result.provider_id, 'go-semantic');
    assert.equal(result.execution_mode, 'indexed_symbol');
    assert.equal(result.changedFiles, 1);
    const body = fs.readFileSync(path.join(dir, 'internal/handlers/routes.go'), 'utf8');
    assert.match(body, /modernHandlerName/);
    assert.match(body, /legacyHandlerName should stay in comments/);
    assert.match(body, /"legacyHandlerName should stay in strings"/);
  });
});





test('runRefactorOperation applies go indexed rename-symbol across package files while skipping local shadows', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': [
        'package handlers',
        '',
        'func legacyRoute() string {',
        '\treturn "ok"',
        '}',
        '',
      ].join('\n'),
      'internal/handlers/wiring.go': [
        'package handlers',
        '',
        'func useRoutes() string {',
        '\tlegacyRoute := func() string { return "shadow" }',
        '\t_ = legacyRoute',
        '\treturn legacyRoute()',
        '}',
        '',
        'func callRealRoute() string {',
        '\treturn legacyRoute()',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const result = runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'legacyRoute',
      toName: 'modernRoute',
      dryRun: false,
    });
    assert.equal(result.provider_id, 'go-semantic');
    assert.equal(result.execution_mode, 'indexed_symbol');
    assert.equal(result.changedFiles, 2);
    const routesBody = fs.readFileSync(path.join(dir, 'internal/handlers/routes.go'), 'utf8');
    const wiringBody = fs.readFileSync(path.join(dir, 'internal/handlers/wiring.go'), 'utf8');
    assert.match(routesBody, /func modernRoute\(\) string/);
    assert.match(wiringBody, /return modernRoute\(\)/);
    assert.match(wiringBody, /legacyRoute := func\(\) string/);
    assert.match(wiringBody, /_ = legacyRoute/);
    assert.ok(!/return legacyRoute\(\)/.test((wiringBody.split('func callRealRoute')[1] || '')));
  });
});



test('runRefactorOperation blocks go indexed rename-symbol when declarations are ambiguous across packages', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': 'package handlers\n\nfunc legacyRoute() string { return "handlers" }\n',
      'internal/admin/routes.go': 'package admin\n\nfunc legacyRoute() string { return "admin" }\n',
    });
  }, (dir) => {
    assert.throws(() => runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'legacyRoute',
      toName: 'modernRoute',
      dryRun: false,
    }), /ambiguous/i);
  });
});

test('runRefactorOperation blocks go indexed rename-symbol on package declaration collisions', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': [
        'package handlers',
        '',
        'func legacyRoute() string {',
        '\treturn modernRoute()',
        '}',
        '',
        'func modernRoute() string {',
        '\treturn "ok"',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    assert.throws(() => runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'legacyRoute',
      toName: 'modernRoute',
      dryRun: false,
    }), /collide/i);
  });
});

test('runRefactorOperation blocks go rename-at local collisions inside a function scope', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': [
        'package handlers',
        '',
        'func first() string {',
        '\tlegacyName := "local"',
        '\tcurrentName := "existing"',
        '\treturn legacyName + currentName',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const file = path.join(dir, 'internal/handlers/routes.go');
    assert.throws(() => runRefactorOperation('rename-at', {
      baseDir: dir,
      file,
      line: 4,
      col: 3,
      toName: 'currentName',
      dryRun: false,
    }), /collide/i);
  });
});
test('runRefactorOperation applies go rename-at within a single function scope', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': [
        'package handlers',
        '',
        'var legacyName = "package"',
        '',
        'func first() string {',
        '\tlegacyName := "local"',
        '\treturn legacyName',
        '}',
        '',
        'func second() string {',
        '\treturn legacyName',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const file = path.join(dir, 'internal/handlers/routes.go');
    const result = runRefactorOperation('rename-at', {
      baseDir: dir,
      file,
      line: 6,
      col: 3,
      toName: 'localName',
      dryRun: false,
    });
    assert.equal(result.provider_id, 'go-semantic');
    assert.equal(result.execution_mode, 'indexed_symbol');
    const body = fs.readFileSync(file, 'utf8');
    assert.match(body, /localName := "local"/);
    assert.match(body, /return localName/);
    assert.match(body, /var legacyName = "package"/);
    assert.ok(body.includes('func second() string {\n\treturn legacyName'));
  });
});

test('runRefactorOperation applies go semantic add-import, remove-import, and ensure-export', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': [
        'package handlers',
        '',
        'import (',
        '\t"fmt"',
        ')',
        '',
        'func healthHandler() string {',
        '\treturn fmt.Sprint("ok")',
        '}',
        '',
      ].join('\n'),
      'internal/handlers/routes_test.go': [
        'package handlers',
        '',
        'func useHealth() {',
        '\t_ = healthHandler',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const file = path.join(dir, 'internal/handlers/routes.go');
    const addImportResult = runRefactorOperation('add-import', {
      file,
      moduleName: 'github.com/gin-gonic/gin',
      importName: 'gin',
      dryRun: false,
    });
    assert.equal(addImportResult.provider_id, 'go-semantic');

    const removeImportResult = runRefactorOperation('remove-import', {
      file,
      moduleName: 'fmt',
      dryRun: false,
    });
    assert.equal(removeImportResult.provider_id, 'go-semantic');

    const ensureExportResult = runRefactorOperation('ensure-export', {
      file,
      name: 'healthHandler',
      dryRun: false,
    });
    assert.equal(ensureExportResult.provider_id, 'go-semantic');

    const body = fs.readFileSync(file, 'utf8');
    const testBody = fs.readFileSync(path.join(dir, 'internal/handlers/routes_test.go'), 'utf8');
    assert.match(body, /"github.com\/gin-gonic\/gin"/);
    assert.doesNotMatch(body, /\n\t"fmt"\n/);
    assert.match(body, /func HealthHandler\(/);
    assert.match(testBody, /HealthHandler/);
  });
});

test('ast-rewrite CLI reports go semantic provider selection', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': 'package handlers\n\nfunc legacyRoute() string {\n\treturn legacyRoute\n}\n',
    });
  }, (dir) => {
    const providersResult = runNodeResult(AST_REWRITE, ['providers'], { cwd: ROOT });
    assert.equal(providersResult.code, 0);
    assert.match(providersResult.stdout, /go-semantic/);

    const rewriteResult = runNodeResult(AST_REWRITE, [
      'rename-symbol',
      '--from', 'legacyRoute',
      '--to', 'modernRoute',
      '--path', dir,
    ], { cwd: ROOT });

    assert.equal(rewriteResult.code, 0);
    assert.match(rewriteResult.stdout, /provider=go-semantic/);
    assert.match(rewriteResult.stdout, /mode=indexed_symbol/);
  });
});

test('register_route and register_provider respect go block indentation when wiring into bootstrap files', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'internal/http/routes.go': [
        'package http',
        '',
        'func RegisterRoutes(mux *ServeMux) {',
        '}',
        '',
      ].join('\n'),
      'internal/services/registry.go': [
        'package services',
        '',
        'func RegisterProviders(registry *Registry) {',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const updates = applyActionUpdates({
      updates: [
        {
          type: 'register_route',
          file: 'internal/http/routes.go',
          registration_statement: 'RegisterBillingRoutes(mux)',
          registration_anchor: { regex: 'func\\s+RegisterRoutes\\([^)]*\\)\\s*\\{', flags: 'm' },
          registration_strategy: 'after_anchor',
          registration_indent_mode: 'anchor_block',
          registration_indent_unit: '\t',
          on_missing_registration_anchor: 'append',
        },
        {
          type: 'register_provider',
          file: 'internal/services/registry.go',
          registration_statement: 'RegisterBillingProvider(registry)',
          registration_anchor: { regex: 'func\\s+RegisterProviders\\([^)]*\\)\\s*\\{', flags: 'm' },
          registration_strategy: 'after_anchor',
          registration_indent_mode: 'anchor_block',
          registration_indent_unit: '\t',
          on_missing_registration_anchor: 'append',
        },
      ],
    }, dir, {}, {}, 'apply');

    assert.equal(updates[0].status, 'updated');
    assert.equal(updates[1].status, 'updated');
    const routeBody = fs.readFileSync(path.join(dir, 'internal/http/routes.go'), 'utf8');
    const serviceBody = fs.readFileSync(path.join(dir, 'internal/services/registry.go'), 'utf8');
    assert.match(routeBody, /\n\tRegisterBillingRoutes\(mux\)\n/);
    assert.match(serviceBody, /\n\tRegisterBillingProvider\(registry\)\n/);
  });
});

test('go handler scaffold targets shared route bootstrap wiring primitives', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': ['module example.com/demo', '', 'go 1.22', ''].join('\n'),
      'docs/http/index.md': '# HTTP\n',
      'internal/http/routes.go': [
        'package http',
        '',
        'func RegisterRoutes(mux *ServeMux) {',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const result = runNodeJson(SKILL_RUNNER, [
      'scaffold',
      'add-go-handler',
      '--root', dir,
      '--dry-run',
      '--json',
      '--var', 'name=billing',
      '--var', 'subject=Billing',
      '--var', 'route_path=/billing',
    ], { cwd: ROOT });

    const routeBootstrap = result.updates.find((item) => item.primitive === 'register_route' && item.resolved_file === 'internal/http/routes.go');
    assert.ok(routeBootstrap);
    assert.equal(routeBootstrap.status, 'would_apply');
  });
});
