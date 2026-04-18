const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeFiles } = require('./test-helpers.js');
const { defineWorkflow, executeWorkflow, resolveTracePath } = require('../src/control-plane/workflow/engine.js');
const { createPlan } = require('../src/cli/implement-task-cli.js');
const { implementTaskWorkflow } = require('../src/control-plane/workflows/implement-task.js');
const { eocUltraworkWorkflow } = require('../src/control-plane/workflows/eoc-ultrawork.js');

function withTempRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-workflow-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('batch4 workflow engine persists trace with step statuses', async () => {
  await withTempRoot(async (root) => {
    writeFiles(root, { 'src/app.js': 'console.log("ok")\n' });
    const workflow = defineWorkflow({
      id: 'demo-workflow',
      steps: [
        { id: 'one', run: async (ctx) => ({ context: { count: (ctx.count || 0) + 1 }, summary: 'first done' }) },
        { id: 'two', when: (ctx) => ctx.count === 1, run: async (ctx) => ({ context: { count: ctx.count + 1 }, summary: 'second done' }) },
        { id: 'three', when: () => false, run: async () => ({ summary: 'should not run' }) },
      ],
    });
    const result = await executeWorkflow(workflow, {
      rootDir: root,
      traceId: 'demo-trace',
      context: { rootDir: root, count: 0 },
    });
    assert.equal(result.context.count, 2);
    assert.equal(result.trace.status, 'succeeded');
    assert.equal(result.trace.steps[0].status, 'succeeded');
    assert.equal(result.trace.steps[1].status, 'succeeded');
    assert.equal(result.trace.steps[2].status, 'skipped');
    const tracePath = resolveTracePath(root, 'demo-workflow', 'demo-trace');
    assert.ok(fs.existsSync(tracePath));
    const persisted = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
    assert.equal(persisted.steps.length, 3);
  });
});

test('batch4 implement-task writes workflow trace metadata and trace file', async () => {
  await withTempRoot(async (root) => {
    writeFiles(root, {
      'package.json': JSON.stringify({ name: 'demo-app', version: '1.0.0', scripts: { test: 'node --version' } }, null, 2) + '\n',
      'src/index.js': 'module.exports = 1;\n',
    });
    const result = await createPlan({
      _: [],
      root,
      objective: 'prepare implementation plan',
      'no-validate': true,
      'no-snapshot': true,
    });
    assert.ok(result.plan.plan_id);
    assert.equal(result.plan.workflow.workflow_id, 'implement-task');
    assert.ok(result.plan.workflow.trace_id);
    const tracePath = resolveTracePath(root, 'implement-task', result.plan.workflow.trace_id);
    assert.ok(fs.existsSync(tracePath));
    const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
    assert.equal(trace.workflow_id, 'implement-task');
    assert.ok(trace.steps.some((step) => step.step_id === 'create-coder-run' && step.status === 'succeeded'));
    assert.ok(trace.steps.some((step) => step.step_id === 'write-plan-artifacts' && step.status === 'succeeded'));
  });
});

test('batch4 workflow descriptors expose implement-task and ultrawork step graphs', () => {
  assert.equal(implementTaskWorkflow.id, 'implement-task');
  assert.ok(implementTaskWorkflow.steps.length >= 7);
  assert.equal(eocUltraworkWorkflow.id, 'eoc-ultrawork');
  assert.ok(eocUltraworkWorkflow.steps.some((step) => step.id === 'gate-4-5'));
});


test('batch4 workflow engine persists intermediate snapshots and rejects promise summaries', async () => {
  await withTempRoot(async (root) => {
    const workflow = defineWorkflow({
      id: 'snapshot-workflow',
      steps: [
        { id: 'one', run: async () => ({ summary: 'first complete' }) },
        {
          id: 'two',
          run: async (_ctx, meta) => {
            const persisted = JSON.parse(fs.readFileSync(resolveTracePath(root, 'snapshot-workflow', meta.traceId), 'utf8'));
            assert.equal(persisted.steps[0].status, 'succeeded');
            assert.equal(persisted.steps[1].status, 'running');
            return { summary: 'second complete' };
          },
        },
      ],
    });
    const result = await executeWorkflow(workflow, { rootDir: root, traceId: 'snapshot-trace', context: { rootDir: root } });
    assert.equal(result.trace.status, 'succeeded');

    const invalid = defineWorkflow({
      id: 'invalid-workflow',
      steps: [{ id: 'bad', run: async () => ({ summary: Promise.resolve('bad') }) }],
    });
    await assert.rejects(() => executeWorkflow(invalid, { rootDir: root, traceId: 'invalid-trace', context: { rootDir: root } }), /returned a Promise as summary/);
  });
});
