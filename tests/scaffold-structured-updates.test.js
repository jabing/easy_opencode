const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { applyActionUpdates } = require('../src/core/skills/scaffold/updates.js');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const SKILL_RUNNER = path.join(ROOT, 'scripts', 'skill-runner.js');

test('applyActionUpdates resolves first existing locator candidate and inserts import before anchor', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'docs/index.md': '# API\n',
      'app/api/__init__.py': 'from .existing import router as existing_router\n\n__all__ = ["existing_router"]\n',
    });
  }, (dir) => {
    const updates = applyActionUpdates({
      updates: [
        {
          type: 'ensure_block',
          locator: {
            strategy: 'first_existing',
            candidates: ['docs/api/index.md', 'docs/index.md'],
            default: 'docs/api/index.md',
            create_if_missing: true,
          },
          content: '- [Billing](./billing.md) — `/billing`',
        },
        {
          type: 'insert_import',
          locator: {
            strategy: 'first_existing',
            candidates: ['app/routers/__init__.py', 'app/api/__init__.py'],
            default: 'app/routers/__init__.py',
            only_if_exists: true,
          },
          content: 'from .billing import router as billing_router',
          anchor: { regex: '__all__\\s*=', flags: 'm' },
          on_missing_anchor: 'append',
        },
      ],
    }, dir, {}, {}, 'apply');

    assert.equal(updates[0].resolved_file, 'docs/index.md');
    assert.equal(updates[0].status, 'updated');
    assert.equal(updates[1].resolved_file, 'app/api/__init__.py');
    assert.equal(updates[1].status, 'updated');

    const docsIndex = fs.readFileSync(path.join(dir, 'docs/index.md'), 'utf8');
    assert.match(docsIndex, /Billing/);

    const initPy = fs.readFileSync(path.join(dir, 'app/api/__init__.py'), 'utf8');
    const importIndex = initPy.indexOf('from .billing import router as billing_router');
    const allIndex = initPy.indexOf('__all__ =');
    assert.ok(importIndex >= 0, 'expected generated import to be inserted');
    assert.ok(allIndex >= 0, 'expected __all__ anchor to remain present');
    assert.ok(importIndex < allIndex, 'expected import insertion before __all__ anchor');
  });
});

test('skill-runner scaffold reports locator-aware integration and targets alternate integration files', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'pyproject.toml': '[project]\nname = "sample-python"\nversion = "0.1.0"\ndependencies = ["pytest>=8.0"]\n',
      'docs/index.md': '# API\n',
      'app/api/__init__.py': 'from .existing import router as existing_router\n\n__all__ = ["existing_router"]\n',
    });
  }, (dir) => {
    const result = runNodeJson(SKILL_RUNNER, [
      'scaffold',
      'add-fastapi-endpoint',
      '--root', dir,
      '--dry-run',
      '--json',
      '--var', 'name=billing',
      '--var', 'subject=Billing',
      '--var', 'route_path=/billing',
    ], { cwd: ROOT });

    assert.equal(result.skill, 'add-fastapi-endpoint');
    assert.equal(result.execution_model.locator_aware_integration, true);
    assert.equal(result.execution_model.action_type, 'locator_template_bundle');

    const docsUpdate = result.updates.find((item) => item.resolved_file === 'docs/index.md');
    const routerUpdate = result.updates.find((item) => item.resolved_file === 'app/api/__init__.py');
    assert.ok(docsUpdate, 'expected docs locator to resolve alternate docs index');
    assert.ok(routerUpdate, 'expected router locator to resolve alternate package init');
    assert.equal(docsUpdate.status, 'would_apply');
    assert.equal(routerUpdate.status, 'would_apply');
  });
});
