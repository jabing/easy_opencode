const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { applyActionUpdates } = require('../src/core/skills/scaffold/updates.js');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const SKILL_RUNNER = path.join(ROOT, 'scripts', 'skill-runner.js');

test('ensure_module_export manages python imports and __all__', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'app/models/__init__.py': 'from .existing import Existing\n\n__all__ = ["Existing"]\n',
    });
  }, (dir) => {
    const updates = applyActionUpdates({
      updates: [
        {
          type: 'ensure_module_export',
          file: 'app/models/__init__.py',
          import_statement: 'from .billing import Billing',
          export_name: 'Billing',
        },
      ],
    }, dir, {}, {}, 'apply');

    assert.equal(updates[0].primitive, 'ensure_module_export');
    assert.equal(updates[0].status, 'updated');
    const body = fs.readFileSync(path.join(dir, 'app/models/__init__.py'), 'utf8');
    assert.match(body, /from \.billing import Billing/);
    assert.match(body, /__all__ = \["Existing", "Billing"\]/);
  });
});

test('register_route respects python block indentation when wiring into a function registry', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'app/api/routes.py': [
        'from fastapi import FastAPI',
        '',
        'def register_routes(app: FastAPI):',
        '    pass',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const updates = applyActionUpdates({
      updates: [
        {
          type: 'register_route',
          file: 'app/api/routes.py',
          import_statement: 'from .billing import router as billing_router',
          import_anchor: { regex: 'def\\s+register_routes', flags: 'm' },
          registration_statement: 'app.include_router(billing_router, prefix="/billing")',
          registration_anchor: { regex: 'def\\s+register_routes\\([^)]*\\):', flags: 'm' },
          registration_strategy: 'after_anchor',
          registration_indent_mode: 'auto',
          on_missing_registration_anchor: 'append',
        },
      ],
    }, dir, {}, {}, 'apply');

    assert.equal(updates[0].status, 'updated');
    const body = fs.readFileSync(path.join(dir, 'app/api/routes.py'), 'utf8');
    assert.match(body, /from \.billing import router as billing_router/);
    assert.match(body, /\n    app\.include_router\(billing_router, prefix="\/billing"\)/);
  });
});

test('fastapi scaffold targets framework entry wiring and python module export candidates', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'pyproject.toml': '[project]\nname = "sample-python"\nversion = "0.1.0"\ndependencies = ["pytest>=8.0"]\n',
      'docs/index.md': '# API\n',
      'app/routers/__init__.py': 'from .existing import router as existing_router\n\n__all__ = ["existing_router"]\n',
      'app/main.py': 'from fastapi import FastAPI\n\napp = FastAPI()\n',
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

    const moduleExport = result.updates.find((item) => item.primitive === 'ensure_module_export' && item.resolved_file === 'app/routers/__init__.py');
    const frameworkEntry = result.updates.find((item) => item.primitive === 'patch_framework_entry' && item.resolved_file === 'app/main.py');
    assert.ok(moduleExport);
    assert.ok(frameworkEntry);
    assert.equal(moduleExport.status, 'would_apply');
    assert.equal(frameworkEntry.status, 'would_apply');
  });
});

test('django scaffold targets package exports and admin registration primitives', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'pyproject.toml': '[project]\nname = "sample-python"\nversion = "0.1.0"\n',
      'docs/index.md': '# Models\n',
      'app/models/__init__.py': 'from .existing import Existing\n\n__all__ = ["Existing"]\n',
      'app/admin.py': [
        'from django.contrib import admin',
        '',
        'from .models.existing import Existing',
        '',
        '@admin.register(Existing)',
        'class ExistingAdmin(admin.ModelAdmin):',
        '    pass',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const result = runNodeJson(SKILL_RUNNER, [
      'scaffold',
      'add-django-model',
      '--root', dir,
      '--dry-run',
      '--json',
      '--var', 'subject=BillingRecord',
      '--var', 'app_label=app',
    ], { cwd: ROOT });

    const moduleExport = result.updates.find((item) => item.primitive === 'ensure_module_export' && item.resolved_file === 'app/models/__init__.py');
    const adminRegistration = result.updates.find((item) => item.primitive === 'register_provider' && item.resolved_file === 'app/admin.py');
    assert.ok(moduleExport);
    assert.ok(adminRegistration);
    assert.equal(moduleExport.status, 'would_apply');
    assert.equal(adminRegistration.status, 'would_apply');
  });
});
