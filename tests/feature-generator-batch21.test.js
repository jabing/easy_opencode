const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, runNode, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');
const DELIVERY_REPORT = path.join(ROOT, 'scripts', 'delivery-report.js');
const QUALITY_GATE = path.join(ROOT, 'scripts', 'quality-gate.js');

function nodeFeatureFixture() {
  return {
    'package.json': JSON.stringify({
      name: 'feature-delivery-fixture',
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

function writePlan(root, scaffold) {
  const planId = 'plan-feature-delivery';
  const plan = {
    plan_id: planId,
    objective: 'Generate audit-log feature',
    root_dir: root,
    profile: { runtime: 'node', language: 'typescript', framework: 'express', package_manager: 'npm', test_runner: 'npm test', typecheck_tool: 'npm run build' },
    selected_skill: { dir: 'generate-node-feature', level: 'L3', runtime_match: true, task_family: 'feature' },
    scaffold,
    coder_loop: { run_id: null, status: 'green', failed_count: 0, round_count: 0 },
    suggested_commands: [],
  };
  const planDir = path.join(root, '.opencode', 'implementation-plans', planId);
  fs.mkdirSync(planDir, { recursive: true });
  fs.writeFileSync(path.join(planDir, 'plan.json'), JSON.stringify(plan, null, 2));
  fs.mkdirSync(path.join(root, '.opencode', 'implementation-plans'), { recursive: true });
  fs.writeFileSync(path.join(root, '.opencode', 'implementation-plans', 'latest.json'), JSON.stringify({ plan_id: planId }, null, 2));
}

test('delivery-report includes feature delivery readiness for feature tasks', () => {
  withTempDir((dir) => { writeFiles(dir, nodeFeatureFixture()); }, (dir) => {
    const generated = runNodeJson(GENERATE_FEATURE, ['audit-log', '--root', dir, '--skip-verify', '--json'], { cwd: ROOT });
    writePlan(dir, {
      skill: 'generate-node-feature',
      task_family: 'feature',
      outputs: generated.outputs,
      updates: generated.updates,
      feature_name: 'audit-log',
      feature_plan: generated.feature_plan,
      integration_json: generated.integration_json,
      integration_note: generated.integration_note,
      scaffold_policy: generated.scaffold_policy,
    });
    const report = runNodeJson(DELIVERY_REPORT, ['report', '--root', dir, '--json'], { cwd: ROOT });
    assert.ok(report.feature_delivery);
    assert.equal(report.feature_delivery.feature_name, 'audit-log');
    assert.equal(report.feature_delivery.ready, true);
    assert.match(report.feature_delivery.summary, /feature delivery ready: audit-log/);
    const markdown = runNode(DELIVERY_REPORT, ['report', '--root', dir], { cwd: ROOT });
    assert.match(markdown, /## Feature Delivery/);
    assert.match(markdown, /Feature: audit-log/);
  });
});

test('quality-gate reports feature delivery status when last feature artifacts exist', () => {
  withTempDir((dir) => { writeFiles(dir, nodeFeatureFixture()); }, (dir) => {
    runNodeJson(GENERATE_FEATURE, ['audit-log', '--root', dir, '--skip-verify', '--json'], { cwd: ROOT });
    const gate = runNodeJson(QUALITY_GATE, ['--json', '--feature', 'audit-log'], { cwd: dir });
    const featureBundle = gate.results.find((item) => item.check === 'feature.bundle');
    const featureDelivery = gate.results.find((item) => item.check === 'feature.delivery');
    assert.ok(featureBundle);
    assert.ok(featureDelivery);
    assert.equal(featureBundle.status, 'pass');
    assert.equal(featureDelivery.status, 'pass');
    assert.match(featureDelivery.detail, /feature delivery ready: audit-log/);
  });
});
