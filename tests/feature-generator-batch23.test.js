const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const ANALYZE = path.join(ROOT, 'scripts', 'analyze-project-structure.js');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');

function fastapiFixture(extra = {}) {
  return {
    'pyproject.toml': ['[project]','name = "fastapi-demo"','version = "0.1.0"','dependencies = ["fastapi", "pydantic", "pytest"]',''].join('\n'),
    'app/main.py': ['from fastapi import FastAPI','','app = FastAPI()',''].join('\n'),
    'app/routers/users_router.py': 'from fastapi import APIRouter\n\nrouter = APIRouter(prefix="/users")\n',
    'app/services/users_service.py': 'class UsersService:\n    pass\n',
    'app/schemas/users_schema.py': 'from pydantic import BaseModel\n\nclass UsersPayload(BaseModel):\n    name: str\n',
    'tests/test_health.py': 'def test_health():\n    assert True\n',
    'docs/api/index.md': '# API\n',
    '.opencode/project-memory.json': JSON.stringify({ auth_strategy: 'jwt' }, null, 2),
    ...extra,
  };
}

function ginFixture(extra = {}) {
  return {
    'go.mod': ['module example.com/demo', '', 'go 1.22', '', 'require github.com/gin-gonic/gin v1.10.0', ''].join('\n'),
    'internal/handlers/routes.go': 'package handlers\n\nimport "github.com/gin-gonic/gin"\n\nfunc RegisterRoutes(router gin.IRouter) {}\n',
    'internal/services/health_service.go': 'package services\n\ntype HealthService struct{}\n',
    'internal/models/health_model.go': 'package models\n\ntype HealthRecord struct {\n\tStatus string `json:"status"`\n}\n',
    'docs/api/index.md': '# API\n',
    '.opencode/project-memory.json': JSON.stringify({ auth_strategy: 'jwt' }, null, 2),
    ...extra,
  };
}

function mixedNodeFixture() {
  return {
    'package.json': JSON.stringify({
      name: 'mixed-layout-demo',
      version: '1.0.0',
      private: true,
      scripts: { build: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' },
      dependencies: { express: '^4.19.2' },
    }, null, 2),
    'src/modules/user/user.route.ts': 'export const userRoute = true;\n',
    'src/modules/user/user.service.ts': 'export const userService = true;\n',
    'src/routes/health.route.ts': 'export const healthRoute = true;\n',
    'src/controllers/health.controller.ts': 'export const healthController = true;\n',
    'docs/api/index.md': '# API\n',
  };
}

test('analyze-project-structure switches to conservative decision mode for mixed node layouts', () => {
  withTempDir((dir) => { writeFiles(dir, mixedNodeFixture()); }, (dir) => {
    const result = runNodeJson(ANALYZE, ['--root', dir, '--json'], { cwd: ROOT });
    assert.equal(result.runtime, 'node');
    assert.equal(result.mixed_architecture, true);
    assert.equal(result.decision_mode, 'conservative');
    assert.match(result.decision_reasons.join(' '), /conservative feature-scoped output paths/);
  });
});

test('generate-feature emits verify schema and DI-aware FastAPI code', () => {
  withTempDir((dir) => { writeFiles(dir, fastapiFixture()); }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['audit-log', '--root', dir, '--dry-run', '--json'], { cwd: ROOT });
    assert.equal(result.skill, 'generate-fastapi-feature');
    assert.equal(result.verify_schema.runtime, 'python');
    assert.equal(result.verify_schema.build, 'python -m compileall .');
    assert.equal(result.verify_schema.test, 'python -m pytest -q');
    assert.equal(result.verify_schema.lint, 'python -m ruff check .');
    assert.equal(result.verify_schema.typecheck, 'python -m mypy .');
    const routePreview = result.preview.find((item) => item.output === 'app/routers/audit_log_router.py');
    const controllerPreview = result.preview.find((item) => item.output === 'app/routers/audit_log_controller.py');
    const servicePreview = result.preview.find((item) => item.output === 'app/services/audit_log_service.py');
    const testPreview = result.preview.find((item) => item.output === 'tests/audit_log_test.py');
    assert.ok(routePreview.body.includes('Depends(get_audit_log_controller)'));
    assert.ok(routePreview.body.includes('dependencies=[Depends(require_audit_log_access)]'));
    assert.ok(controllerPreview.body.includes('from fastapi import Depends'));
    assert.ok(controllerPreview.body.includes('def get_audit_log_controller('));
    assert.ok(servicePreview.body.includes('def get_audit_log_service('));
    assert.ok(testPreview.body.includes('TestClient(app)'));
    assert.ok(testPreview.body.includes('response = client.post("/audit-log"'));
  });
});

test('generate-feature emits verify schema and middleware-aware Go routes', () => {
  withTempDir((dir) => { writeFiles(dir, ginFixture()); }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['audit-log', '--root', dir, '--dry-run', '--with-test', 'true', '--json'], { cwd: ROOT });
    assert.equal(result.skill, 'generate-go-feature');
    assert.equal(result.verify_schema.runtime, 'go');
    assert.equal(result.verify_schema.build, 'go build ./...');
    assert.equal(result.verify_schema.test, 'go test ./...');
    assert.equal(result.verify_schema.format, 'gofmt -w .');
    assert.equal(result.verify_schema.typecheck, 'go build ./...');
    const routePreview = result.preview.find((item) => item.output === 'internal/handlers/audit_log_routes.go');
    assert.ok(routePreview.body.includes('group := router.Group("/audit-log")'));
    assert.ok(routePreview.body.includes('group.Use(AuditLogMiddleware())'));
    assert.ok(routePreview.body.includes('group.Use(AuditLogRequireAuth())'));
    assert.ok(routePreview.body.includes('func AuditLogMiddleware() gin.HandlerFunc'));
    assert.ok(routePreview.body.includes('func AuditLogRequireAuth() gin.HandlerFunc'));
  });
});
