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
    ...extra,
  };
}

test('analyze-project-structure detects FastAPI app-router layout', () => {
  withTempDir((dir) => { writeFiles(dir, fastapiFixture()); }, (dir) => {
    const result = runNodeJson(ANALYZE, ['--root', dir, '--json'], { cwd: ROOT });
    assert.equal(result.runtime, 'python');
    assert.equal(result.framework, 'fastapi');
    assert.equal(result.architecture_pattern, 'fastapi-app-router');
    assert.equal(result.source_root, 'app');
    assert.equal(result.module_roots.route, 'app/routers');
    assert.equal(result.test_root, 'tests');
    assert.equal(result.paths.route_index, 'app/main.py');
  });
});

test('generate-feature scaffolds a FastAPI feature bundle in dry-run mode', () => {
  withTempDir((dir) => { writeFiles(dir, fastapiFixture()); }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['audit-log', '--root', dir, '--dry-run', '--json'], { cwd: ROOT });
    assert.equal(result.skill, 'generate-fastapi-feature');
    assert.equal(result.project_structure.architecture_pattern, 'fastapi-app-router');
    assert.deepEqual(new Set(result.outputs), new Set([
      'app/routers/audit_log_controller.py',
      'app/services/audit_log_service.py',
      'app/repositories/audit_log_repository.py',
      'app/schemas/audit_log_schema.py',
      'app/routers/audit_log_router.py',
      'tests/audit_log_test.py',
      'docs/api/audit-log.md',
      '.opencode/feature-bundles/audit-log.integration.md',
    ]));
    const mainImport = result.updates.find((item) => item.file === 'app/main.py' && /from app\.routers\.audit_log_router import router as auditLog_router/.test(item.content));
    const mainInclude = result.updates.find((item) => item.file === 'app/main.py' && /app\.include_router\(auditLog_router\)/.test(item.content));
    assert.ok(mainImport);
    assert.ok(mainInclude);
  });
});
