const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const ANALYZE = path.join(ROOT, 'scripts', 'analyze-project-structure.js');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');

function goFixture(extra = {}) {
  return {
    'go.mod': ['module example.com/demo', '', 'go 1.22', ''].join('\n'),
    'cmd/api/main.go': ['package main', '', 'import (', '\t"net/http"', '\t"internal/handlers"', ')', '', 'func main() {', '\tmux := http.NewServeMux()', '\thandlers.RegisterHealthRoutes(mux)', '\t_ = mux', '}', ''].join('\n'),
    'internal/handlers/routes.go': 'package handlers\n\nimport "net/http"\n\nfunc RegisterHealthRoutes(mux *http.ServeMux) {}\n',
    'internal/services/health_service.go': 'package services\n\ntype HealthService struct{}\n',
    'internal/models/health_model.go': 'package models\n\ntype HealthRecord struct {\n\tStatus string `json:"status"`\n}\n',
    'docs/api/index.md': '# API\n',
    ...extra,
  };
}

test('analyze-project-structure detects go internal package layout', () => {
  withTempDir((dir) => { writeFiles(dir, goFixture()); }, (dir) => {
    const result = runNodeJson(ANALYZE, ['--root', dir, '--json'], { cwd: ROOT });
    assert.equal(result.runtime, 'go');
    assert.equal(result.architecture_pattern, 'go-internal-packages');
    assert.equal(result.source_root, 'internal');
    assert.equal(result.module_roots.route, 'internal/handlers');
    assert.equal(result.paths.route_index, 'internal/handlers/routes.go');
  });
});

test('generate-feature scaffolds a Go feature bundle in dry-run mode', () => {
  withTempDir((dir) => { writeFiles(dir, goFixture()); }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['audit-log', '--root', dir, '--dry-run', '--with-test', 'true', '--json'], { cwd: ROOT });
    assert.equal(result.skill, 'generate-go-feature');
    assert.equal(result.project_structure.architecture_pattern, 'go-internal-packages');
    assert.deepEqual(new Set(result.outputs), new Set([
      'internal/handlers/audit_log_handler.go',
      'internal/services/audit_log_service.go',
      'internal/repositories/audit_log_repository.go',
      'internal/models/audit_log_model.go',
      'internal/handlers/audit_log_routes.go',
      'internal/handlers/audit_log_test.go',
      'docs/api/audit-log.md',
      '.opencode/feature-bundles/audit-log.integration.md',
    ]));
    const routeImport = result.updates.find((item) => item.file === 'internal/handlers/routes.go' && item.content === '\t"handlers"');
    const registerCall = result.updates.find((item) => item.file === 'internal/handlers/routes.go' && /RegisterAuditLogRoutes\((?:mux|router)\)/.test(item.content));
    assert.ok(registerCall);
  });
});
