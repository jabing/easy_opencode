const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const IMPLEMENT_TASK = path.join(ROOT, 'scripts', 'implement-task.js');
const QUALITY_GATE = path.join(ROOT, 'scripts', 'quality-gate.js');

function fixture(extra = {}) {
  return {
    'package.json': JSON.stringify({
      name: 'batch16-node-project',
      scripts: {
        build: 'node -e "process.exit(0)"',
        test: 'node -e "process.exit(0)"',
      },
      dependencies: { express: '^4.19.0' },
    }, null, 2),
    'src/modules/index.ts': '',
    'src/modules/user/user.route.ts': 'export const userRoute = true;\n',
    'src/modules/user/user.service.ts': 'export const userService = true;\n',
    'docs/api/index.md': '# API\n',
    ...extra,
  };
}

test('implement-task routes feature task_family scaffolding through generate-feature', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixture());
  }, (dir) => {
    const result = runNodeJson(IMPLEMENT_TASK, [
      'run',
      '--root', dir,
      '--objective', 'Add audit log feature',
      '--skill', 'generate-node-feature',
      '--scaffold',
      '--no-validate',
      '--no-snapshot',
      '--var', 'name=audit-log',
      '--var', 'subject=AuditLog',
      '--json'
    ], { cwd: ROOT });

    assert.equal(result.selected_skill.task_family, 'feature');
    assert.equal(result.scaffold.feature_plan, '.opencode/feature-plans/audit-log.json');
    assert.equal(result.scaffold.integration_json, '.opencode/feature-bundles/audit-log.integration.json');
    assert.ok(result.scaffold.outputs.includes('src/modules/audit-log/audit-log.route.ts'));
    assert.ok(fs.existsSync(path.join(dir, '.opencode/feature-plans/audit-log.json')));
  });
});

test('quality-gate validates structured feature bundle artifacts when feature is specified', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixture({
      '.opencode/feature-plans/audit-log.json': JSON.stringify({
        feature_name: 'audit-log',
        files_to_generate: [
          'src/modules/audit-log/audit-log.route.ts',
          'tests/modules/audit-log/audit-log.spec.ts',
          'docs/api/audit-log.md',
          '.opencode/feature-bundles/audit-log.integration.md'
        ],
        updates_to_apply: [
          { file: 'src/modules/index.ts', content: "export * from './audit-log/audit-log.route';" }
        ]
      }, null, 2),
      '.opencode/feature-bundles/audit-log.integration.md': '# integration\n',
      '.opencode/feature-bundles/audit-log.integration.json': JSON.stringify({
        feature_name: 'audit-log',
        created_files: [
          'src/modules/audit-log/audit-log.route.ts',
          '.opencode/feature-bundles/audit-log.integration.md'
        ],
        updated_files: []
      }, null, 2)
    }));
  }, (dir) => {
    const result = runNodeJson(QUALITY_GATE, ['--root', dir, '--json', '--feature', 'audit-log'], { cwd: dir });
    const featureCheck = result.results.find((item) => item.check === 'feature.bundle');
    assert.equal(result.gate, 'PASS');
    assert.equal(featureCheck.status, 'pass');
    assert.match(featureCheck.detail, /feature bundle ok: audit-log/);
  });
});
