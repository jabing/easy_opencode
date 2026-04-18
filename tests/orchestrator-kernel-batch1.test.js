const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { withTempDir, writeFiles } = require('./test-helpers.js');
const { rememberPlan, buildRecovery, readState } = require('../src/control-plane/orchestrator/memory.js');
const { loadActiveRunRecord, loadRunRecord } = require('../src/control-plane/kernel/run-store.js');

test('batch1 kernel persists unified implementation run and recovery pointers', () => {
  withTempDir((root) => {
    writeFiles(root, {
      'src/app.js': 'console.log("ok")\n',
    });
  }, (root) => {
    const plan = {
      schema_version: '1.1',
      plan_id: 'impl-test-001',
      created_at: '2026-04-13T10:00:00.000Z',
      root_dir: root,
      objective: 'add health check endpoint',
      profile: { runtime: 'node', framework: 'express', language: 'javascript' },
      targets: ['src/app.js'],
      selected_skill: { dir: 'add-express-route', task_family: 'endpoint' },
      skill_candidates: [],
      scaffold: null,
      scaffold_policy: { bundle_mode: 'standard', integration_mode: 'apply' },
      safety: {
        snapshot_id: null,
        snapshot_status: 'skipped_not_git',
        snapshot_reason: 'root is not inside a git repository',
        recovery_baseline: {
          is_git_repo: false,
          branch: null,
          head: null,
          dirty: false,
          target_fingerprints: [],
        },
      },
      coder_loop: {
        run_id: 'coder-001',
        status: 'initialized',
        failed_count: 0,
        round_count: 0,
        checks: [],
        strategy_action: null,
        strategy_confidence: null,
      },
      files: {
        context: '.opencode/implementation-plans/impl-test-001/context.json',
        next_prompt: '.opencode/implementation-plans/impl-test-001/next-prompt.md',
      },
      benchmark_feedback: null,
      execution_policy: {
        strategy_bias: 'balanced',
        validation_mode: 'standard',
      },
      suggested_commands: [],
    };

    const planDir = path.join(root, '.opencode', 'implementation-plans', 'impl-test-001');
    fs.mkdirSync(planDir, { recursive: true });
    fs.writeFileSync(path.join(planDir, 'plan.json'), JSON.stringify(plan, null, 2));

    rememberPlan(plan);

    const legacyState = readState(root);
    assert.equal(legacyState.latest_ids.implementation_plan_id, 'impl-test-001');
    assert.equal(legacyState.latest_ids.kernel_run_id, 'impl-impl-test-001');

    const activeRun = loadActiveRunRecord(root);
    assert.ok(activeRun);
    assert.equal(activeRun.run_id, 'impl-impl-test-001');
    assert.equal(activeRun.workflow, 'implement-task');
    assert.equal(activeRun.source_kind, 'implementation_plan');
    assert.equal(activeRun.pointers.implementation_plan_id, 'impl-test-001');

    const persisted = loadRunRecord(root, 'impl-impl-test-001');
    assert.ok(fs.existsSync(path.join(root, '.opencode', 'kernel', 'events.ndjson')));
    assert.equal(persisted.status, 'created');
    assert.equal(persisted.summary.round_count, 0);

    const recovery = buildRecovery(root);
    assert.equal(recovery.latest_ids.kernel_run_id, 'impl-impl-test-001');
    assert.equal(recovery.active.kernel_run_id, 'impl-impl-test-001');
    assert.equal(recovery.active.plan_id, 'impl-test-001');
  });
});
