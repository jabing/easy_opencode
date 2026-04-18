const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');
const { withTempDir, writeFiles } = require('./test-helpers.js');
const { executeCommandSync, executeCommand } = require('../src/control-plane/kernel/executor.js');

const SCHEDULER_SCRIPT = path.join(__dirname, '..', 'scripts', 'eoc-scheduler.js');

function runNode(args, cwd) {
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('batch2 executor sync and async commands emit kernel events and logs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-executor-'));
  try {
    writeFiles(root, { 'src/app.js': 'console.log("ok")\n' });
    const syncLog = path.join(root, '.opencode', 'kernel', 'logs', 'sync.log');
    const syncCtx = path.join(root, '.opencode', 'kernel', 'ctx', 'sync.json');
    const syncResult = executeCommandSync({
      command: 'node --version',
      rootDir: root,
      workdir: root,
      runId: 'run-sync',
      stepId: 'version-check',
      executableField: 'check',
      timeoutSec: 15,
      logFile: syncLog,
      contextFile: syncCtx,
    });
    assert.equal(syncResult.status, 'succeeded');
    assert.equal(syncResult.exit_code, 0);
    assert.ok(fs.existsSync(syncLog));
    assert.ok(fs.existsSync(syncCtx));
    const syncContext = JSON.parse(fs.readFileSync(syncCtx, 'utf8'));
    assert.equal(syncContext.run_id, 'run-sync');
    assert.equal(syncContext.step_id, 'version-check');
    assert.equal(syncContext.field, 'check');
    assert.equal(syncContext.mode, 'sync');
    assert.equal(syncContext.command, 'node --version');
    assert.equal(syncContext.workdir, root);
    assert.equal(syncContext.timeout_sec, 15);
    assert.deepEqual(syncContext.parsed.args, ['--version']);
    assert.match(syncContext.started_at, /^\d{4}-\d{2}-\d{2}T/);

    const asyncLog = path.join(root, '.opencode', 'kernel', 'logs', 'async.log');
    const asyncResult = await executeCommand({
      command: 'node --version',
      rootDir: root,
      workdir: root,
      runId: 'run-async',
      stepId: 'version-check-async',
      executableField: 'check',
      timeoutSec: 15,
      logFile: asyncLog,
    });
    assert.equal(asyncResult.status, 'succeeded');
    assert.equal(asyncResult.exit_code, 0);
    assert.ok(fs.existsSync(asyncLog));

    const events = fs.readFileSync(path.join(root, '.opencode', 'kernel', 'events.ndjson'), 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event.event_type === 'kernel.executor.started' && event.run_id === 'run-sync'));
    assert.ok(events.some((event) => event.event_type === 'kernel.executor.finished' && event.run_id === 'run-async'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('batch2 scheduler uses kernel executor for command and validation steps', () => {
  withTempDir((root) => {
    writeFiles(root, {
      '.opencode/eoc-run/run1.json': JSON.stringify({ run_id: 'run1', root_dir: root }, null, 2) + '\n',
    });
  }, (root) => {
    let result = runNode([SCHEDULER_SCRIPT, 'init', '--run-id', 'run1', '--concurrency', '1'], root);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    result = runNode([
      SCHEDULER_SCRIPT,
      'add-task',
      '--run-id', 'run1',
      '--task-id', 'check_node',
      '--cmd', 'node --version',
      '--validation', 'node --version',
      '--timeout', '15',
      '--retries', '0',
    ], root);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    result = runNode([SCHEDULER_SCRIPT, 'run', '--run-id', 'run1'], root);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const run = JSON.parse(fs.readFileSync(path.join(root, '.opencode', 'eoc-run', 'run1.json'), 'utf8'));
    assert.equal(run.scheduler.status, 'completed');
    assert.equal(run.scheduler.tasks.check_node.status, 'success');

    const taskCtx = path.join(root, '.opencode', 'eoc-run', 'run1', 'tasks', 'check_node', 'context.json');
    assert.ok(fs.existsSync(taskCtx));
    const events = fs.readFileSync(path.join(root, '.opencode', 'kernel', 'events.ndjson'), 'utf8');
    assert.match(events, /kernel.executor.started/);
    assert.match(events, /kernel.executor.finished/);
  });
});
