const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
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
    'internal/handlers/routes.go': 'package handlers\n\nimport (\n\t"github.com/gin-gonic/gin"\n)\n\nfunc RegisterRoutes(router gin.IRouter) {}\n',
    'internal/services/health_service.go': 'package services\n\ntype HealthService struct{}\n',
    'internal/models/health_model.go': 'package models\n\ntype HealthRecord struct {\n\tStatus string `json:"status"`\n}\n',
    'docs/api/index.md': '# API\n',
    '.opencode/project-memory.json': JSON.stringify({ auth_strategy: 'jwt' }, null, 2),
    ...extra,
  };
}

test('semantic planning uses auth namespace for auth-like features', () => {
  withTempDir((dir) => { writeFiles(dir, fastapiFixture()); }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['auth-login', '--root', dir, '--dry-run', '--json'], { cwd: ROOT });
    assert.equal(result.skill, 'generate-fastapi-feature');
    const routePreview = result.preview.find((item) => item.output === 'app/routers/auth_login_router.py');
    assert.ok(routePreview.body.includes('prefix="/auth/login"'));
    assert.ok(routePreview.body.includes('Depends(require_auth_login_access)'));
  });
});

test('feature generation applies language-aware structured entrypoint updates', () => {
  withTempDir((dir) => { writeFiles(dir, fastapiFixture()); }, (dir) => {
    runNodeJson(GENERATE_FEATURE, ['auth-login', '--root', dir, '--skip-verify', '--json'], { cwd: ROOT });
    const mainBody = fs.readFileSync(path.join(dir, 'app/main.py'), 'utf8');
    assert.match(mainBody, /from app\.routers\.auth_login_router import router as authLoginRouter/);
    assert.match(mainBody, /app = FastAPI\(\)\napp\.include_router\(authLoginRouter\)/);
  });

  withTempDir((dir) => { writeFiles(dir, ginFixture()); }, (dir) => {
    runNodeJson(GENERATE_FEATURE, ['auth-login', '--root', dir, '--skip-verify', '--json'], { cwd: ROOT });
    const routesBody = fs.readFileSync(path.join(dir, 'internal/handlers/routes.go'), 'utf8');
    assert.match(routesBody, /RegisterAuthLoginRoutes\(router\)/);
  });
});

test('project memory stores semantic history and feature relations after generation', () => {
  withTempDir((dir) => { writeFiles(dir, fastapiFixture()); }, (dir) => {
    runNodeJson(GENERATE_FEATURE, ['auth-login', '--root', dir, '--skip-verify', '--json'], { cwd: ROOT });
    const memory = JSON.parse(fs.readFileSync(path.join(dir, '.opencode/project-memory.json'), 'utf8'));
    assert.ok(Array.isArray(memory.semantic_feature_history));
    assert.equal(memory.semantic_feature_history.at(-1).family, 'auth');
    assert.equal(memory.last_feature_generation.semantic_family, 'auth');
    assert.ok(memory.feature_relations.auth);
    assert.ok(memory.feature_relations.auth.related_features.includes('login'));
  });
});
