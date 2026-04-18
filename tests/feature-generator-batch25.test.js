const test = require('node:test');
const assert = require('node:assert/strict');
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
    ...extra,
  };
}

test('generate-feature returns provider metadata for tier1 dry-run generation', () => {
  withTempDir((dir) => { writeFiles(dir, fastapiFixture()); }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['audit-log', '--root', dir, '--dry-run', '--json'], { cwd: ROOT });
    assert.equal(result.feature_provider.skill, 'generate-fastapi-feature');
    assert.equal(result.feature_provider.support_tier, 'tier1');
    assert.equal(result.feature_support.detected.framework, 'fastapi');
    assert.deepEqual(new Set(result.feature_support.supported_runtimes), new Set(['node', 'python', 'go']));
  });
});
