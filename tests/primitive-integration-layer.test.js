const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { applyActionUpdates } = require('../src/core/skills/scaffold/updates.js');
const { withTempDir, writeFiles } = require('./test-helpers.js');

test('register_route applies import and route wiring using shared primitives', () => {
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
          on_missing_registration_anchor: 'append',
        },
      ],
    }, dir, {}, {}, 'apply');

    assert.equal(updates[0].primitive, 'register_route');
    assert.equal(updates[0].status, 'updated');
    const body = fs.readFileSync(path.join(dir, 'app/api/routes.py'), 'utf8');
    assert.match(body, /from \.billing import router as billing_router/);
    assert.match(body, /app\.include_router\(billing_router, prefix="\/billing"\)/);
    assert.ok(body.indexOf('from .billing import router as billing_router') < body.indexOf('def register_routes'));
    assert.ok(body.indexOf('app.include_router(billing_router, prefix="/billing")') > body.indexOf('def register_routes'));
  });
});

test('patch_framework_entry applies import, registration, and export segments with structured metadata', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/app.ts': [
        "import express from 'express';",
        '',
        'const app = express();',
        '',
        'export function buildApp() {',
        '  return app;',
        '}',
        '',
      ].join('\n'),
    });
  }, (dir) => {
    const updates = applyActionUpdates({
      updates: [
        {
          type: 'patch_framework_entry',
          file: 'src/app.ts',
          import_statement: "import { billingRouter } from './billing.js';",
          registration_statement: "app.use('/billing', billingRouter);",
          registration_anchor: { regex: 'const\\s+app\\s*=\\s*express\\(\\);', flags: 'm' },
          registration_strategy: 'after_anchor',
          export_statement: 'export { billingRouter };',
          export_anchor: { regex: 'export\\s+function\\s+buildApp', flags: 'm' },
          export_strategy: 'before_anchor',
        },
      ],
    }, dir, {}, {}, 'apply');

    assert.equal(updates[0].primitive, 'patch_framework_entry');
    assert.equal(updates[0].status, 'updated');
    assert.ok(Array.isArray(updates[0].segments));
    assert.equal(updates[0].segments.length, 3);
    const body = fs.readFileSync(path.join(dir, 'src/app.ts'), 'utf8');
    assert.match(body, /import \{ billingRouter \} from '\.\/billing\.js';/);
    assert.match(body, /app\.use\('\/billing', billingRouter\);/);
    assert.match(body, /export \{ billingRouter \};/);
    assert.ok(body.indexOf("app.use('/billing', billingRouter);") > body.indexOf('const app = express();'));
    assert.ok(body.indexOf('export { billingRouter };') < body.indexOf('export function buildApp'));
  });
});
