const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runSuite } = require('../src/core/benchmark/suite-runtime.js');

function withTempRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-bench-runtime-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('benchmark suite runtime awaits async createPlan dependencies before evaluating cases', async () => {
  await withTempRoot(async (root) => {
    const caseRoot = path.join(root, 'case');
    fs.mkdirSync(caseRoot, { recursive: true });
    fs.writeFileSync(path.join(caseRoot, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2));
    const suitePath = path.join(root, 'suite.json');
    fs.writeFileSync(suitePath, JSON.stringify({
      name: 'demo-suite',
      cases: [{ id: 'async-pass', root: './case', objective: 'prepare plan', expected: { runtime: 'node', status: 'ready', task_success: true } }],
    }, null, 2));

    const run = await runSuite({ suite: suitePath, root }, {
      detectProjectProfile() {
        return { runtime: 'node', language: 'javascript', framework: 'none', package_manager: 'npm' };
      },
      async createPlan() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          plan: {
            plan_id: 'plan-async',
            selected_skill: { dir: 'demo-skill' },
            coder_loop: { status: 'ready', failed_count: 0, round_count: 1 },
            scaffold: { outputs: ['src/feature.js'], updates: [], integration_status: 'applied' },
          },
        };
      },
      appendEvent() {},
      writeBenchmarkRun() {},
    });

    assert.equal(run.summary.failed, 0);
    assert.equal(run.results[0].passed, true);
    assert.equal(run.results[0].plan.plan_id, 'plan-async');
  });
});

test('benchmark suite runtime records async createPlan rejections as case errors', async () => {
  await withTempRoot(async (root) => {
    const caseRoot = path.join(root, 'case');
    fs.mkdirSync(caseRoot, { recursive: true });
    fs.writeFileSync(path.join(caseRoot, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2));
    const suitePath = path.join(root, 'suite.json');
    fs.writeFileSync(suitePath, JSON.stringify({
      name: 'demo-suite',
      cases: [{ id: 'async-fail', root: './case', objective: 'prepare plan', expected: { runtime: 'node' } }],
    }, null, 2));

    const run = await runSuite({ suite: suitePath, root }, {
      detectProjectProfile() {
        return { runtime: 'node', language: 'javascript', framework: 'none', package_manager: 'npm' };
      },
      async createPlan() {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('synthetic async failure');
      },
      appendEvent() {},
      writeBenchmarkRun() {},
    });

    assert.equal(run.summary.failed, 1);
    assert.equal(run.results[0].passed, false);
    assert.match(run.results[0].error, /synthetic async failure/);
  });
});
