const test = require('node:test');
const assert = require('node:assert/strict');
const { withTempDir, writeFiles } = require('./test-helpers.js');
const { createGoProvider } = require('../src/core/languages/providers/go.js');
const { normalizeFailures } = require('../src/shared/error-normalizers/index.js');

test('go provider summarizes package and import graph hints with related tests', () => {
  const provider = createGoProvider();

  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/shared/helpers.go': [
        'package shared',
        '',
        'func SharedName(value string) string {',
        '\treturn value',
        '}',
        '',
      ].join('\n'),
      'internal/handlers/routes.go': [
        'package handlers',
        '',
        'import (',
        '\t"fmt"',
        '\t"example.com/demo/internal/shared"',
        ')',
        '',
        'type RouteHandler struct {}',
        '',
        'func HandleRoute() string {',
        '\treturn fmt.Sprintf("%s", shared.SharedName("ok"))',
        '}',
        '',
      ].join('\n'),
      'internal/handlers/routes_test.go': [
        'package handlers',
        '',
        'func TestHandleRoute(t *testing.T) {}',
        '',
      ].join('\n'),
      'internal/handlers/routes_integration_test.go': [
        'package handlers',
        '',
        'func TestHandleRouteIntegration(t *testing.T) {}',
        '',
      ].join('\n'),
      'internal/shared/helpers_test.go': [
        'package shared',
        '',
        'func TestSharedName(t *testing.T) {}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    assert.equal(provider.supports({ runtime: 'go' }, 'internal/handlers/routes.go'), true);
    assert.equal(provider.supports({ runtime: 'node' }, 'internal/handlers/routes.go'), true);
    assert.equal(provider.supports({ runtime: 'go' }, 'docs/readme.md'), false);

    const analysis = provider.analyzeProject({ rootDir: dir, objective: 'update handler wiring', targets: ['internal/handlers/routes.go'] });
    const summary = provider.summarizeTarget({ rootDir: dir, target: 'internal/handlers/routes.go', analysis });

    assert.equal(summary.provider_id, 'go');
    assert.equal(summary.package_name, 'handlers');
    assert.equal(summary.package_dir, 'internal/handlers');
    assert.equal(summary.module_path, 'example.com/demo');
    assert.equal(summary.import_path, 'example.com/demo/internal/handlers');
    assert.ok(summary.imports.some((item) => item.includes('fmt')));
    assert.ok(summary.imports.some((item) => item.includes('example.com/demo/internal/shared')));
    assert.ok(summary.import_hints.includes('example.com/demo/internal/shared'));
    assert.ok(summary.package_hints.includes('internal/handlers'));
    assert.ok(summary.package_hints.includes('example.com/demo/internal/handlers'));
    assert.ok(summary.related_tests.includes('internal/handlers/routes_test.go'));
    assert.ok(summary.related_tests.includes('internal/handlers/routes_integration_test.go'));
    assert.ok(summary.intelligence.direct_neighbors.includes('internal/shared/helpers.go'));
    assert.ok(Array.isArray(analysis.go_packages));
    assert.ok(analysis.package_hints.includes('example.com/demo/internal/handlers'));
    assert.ok(analysis.import_hints.includes('example.com/demo/internal/shared'));
    assert.ok(analysis.target_summaries['internal/handlers/routes.go']);
  });
});

test('go failure normalization routes through provider hints before runtime labels', () => {
  const compileFailure = normalizeFailures({
    runtime: 'node',
    language: 'javascript',
    provider: 'go-semantic',
    tool: 'build',
    text: 'internal/handlers/routes.go:12:5: undefined: shared',
  });
  assert.ok(compileFailure.some((item) => item.category === 'compile_error' && item.file === 'internal/handlers/routes.go'));
  assert.ok(compileFailure.some((item) => item.category === 'compile_error' && item.message === 'undefined: shared'));

  const heuristicFailure = normalizeFailures({
    runtime: 'node',
    language: 'javascript',
    tool: 'build',
    text: 'internal/handlers/routes.go:12:5: undefined: shared',
  });
  assert.ok(heuristicFailure.some((item) => item.category === 'compile_error' && item.file === 'internal/handlers/routes.go'));
  assert.ok(heuristicFailure.some((item) => item.category === 'compile_error' && item.message === 'undefined: shared'));

  const testFailure = normalizeFailures({
    runtime: 'node',
    language: 'javascript',
    provider: 'go-semantic',
    tool: 'test',
    text: '--- FAIL: TestHandleRoute (0.00s)',
  });
  assert.equal(testFailure.length, 1);
  assert.equal(testFailure[0].category, 'test_failure');
  assert.equal(testFailure[0].symbol, 'TestHandleRoute');
  assert.equal(testFailure[0].message, 'Go test failed');
});
