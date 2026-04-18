const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, runNode, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');
const FEATURE_ACCEPTANCE = path.join(ROOT, 'scripts', 'feature-acceptance.js');
const DELIVERY_REPORT = path.join(ROOT, 'scripts', 'delivery-report.js');
const QUALITY_GATE = path.join(ROOT, 'scripts', 'quality-gate.js');

function nodeFeatureFixture() {
  return {
    'package.json': JSON.stringify({
      name: 'feature-acceptance-fixture',
      version: '1.0.0',
      private: true,
      scripts: {
        build: 'node -e "process.exit(0)"',
        test: 'node -e "process.exit(0)"',
      },
      dependencies: { express: '^4.19.2', zod: '^3.23.8' },
    }, null, 2),
    'src/modules/user/user.route.ts': 'export const userRoute = true;\n',
    'src/modules/user/user.service.ts': 'export const userService = true;\n',
    'src/modules/index.ts': 'export * from "./user/user.route";\n',
    'docs/api/index.md': '# API\n',
  };
}

test('feature-acceptance summarizes ready feature artifacts', () => {
  withTempDir((dir) => { writeFiles(dir, nodeFeatureFixture()); }, (dir) => {
    runNodeJson(GENERATE_FEATURE, ['audit-log', '--root', dir, '--skip-verify', '--json'], { cwd: ROOT });
    const report = runNodeJson(FEATURE_ACCEPTANCE, ['report', '--root', dir, '--feature', 'audit-log', '--json'], { cwd: ROOT });
    assert.equal(report.feature_count, 1);
    assert.equal(report.ready_count, 1);
    assert.equal(report.incomplete_count, 0);
    assert.equal(report.features[0].feature_name, 'audit-log');
    assert.equal(report.features[0].status, 'ready');
    assert.ok(report.features[0].checks.some((item) => item.check === 'feature.bundle' && item.ok));
    assert.ok(report.features[0].checks.some((item) => item.check === 'feature.delivery' && item.ok));
    const human = runNode(FEATURE_ACCEPTANCE, ['report', '--root', dir, '--feature', 'audit-log'], { cwd: ROOT });
    assert.match(human, /Feature acceptance: ready: audit-log/);
    assert.match(human, /\[READY\] audit-log/);
  });
});

test('delivery-report and quality-gate expose feature acceptance summary', () => {
  withTempDir((dir) => { writeFiles(dir, nodeFeatureFixture()); }, (dir) => {
    runNodeJson(GENERATE_FEATURE, ['audit-log', '--root', dir, '--skip-verify', '--json'], { cwd: ROOT });
    const delivery = runNodeJson(DELIVERY_REPORT, ['report', '--root', dir, '--json'], { cwd: ROOT });
    assert.ok(delivery.feature_acceptance);
    assert.equal(delivery.feature_acceptance.ready_count, 1);
    const markdown = runNode(DELIVERY_REPORT, ['report', '--root', dir], { cwd: ROOT });
    assert.match(markdown, /## Feature acceptance/);
    const gate = runNodeJson(QUALITY_GATE, ['--json', '--feature', 'audit-log'], { cwd: dir });
    const acceptance = gate.results.find((item) => item.check === 'feature.acceptance');
    assert.ok(acceptance);
    assert.equal(acceptance.status, 'pass');
    assert.match(acceptance.detail, /ready: audit-log/);
  });
});
