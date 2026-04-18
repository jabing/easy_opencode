const test = require('node:test');
const assert = require('node:assert/strict');
const { runCommand } = require('../src/adapters/process-runner.js');

test('process runner returns command metric and duration', async () => {
  const result = await runCommand(process.execPath, ['-e', 'console.log("ok")'], { timeoutMs: 5000 });
  assert.equal(result.code, 0);
  assert.equal(result.timedOut, false);
  assert.match(result.output, /ok/);
  assert.equal(result.metric.command, process.execPath);
  assert.ok(result.durationMs >= 0);
  assert.equal(result.metric.exitCode, 0);
});

test('process runner truncates oversized output', async () => {
  const result = await runCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(200))'], { timeoutMs: 5000, maxOutputBytes: 50 });
  assert.equal(result.code, 0);
  assert.equal(result.truncated, true);
  assert.match(result.output, /\[output truncated\]$/);
});

test('process runner reports spawn errors without hanging cleanup', async () => {
  const result = await runCommand('command-that-does-not-exist-eoc', [], { timeoutMs: 500 });
  assert.equal(result.code, 1);
  assert.equal(result.timedOut, false);
  assert.match(result.output, /failed to spawn external command/i);
  assert.equal(result.metric.exitCode, 1);
});

test('process runner marks timed out commands and returns non-zero exit', async () => {
  const result = await runCommand(process.execPath, ['-e', 'setTimeout(() => console.log("late"), 2000)'], { timeoutMs: 50 });
  assert.equal(result.timedOut, true);
  assert.notEqual(result.code, 0);
  assert.equal(result.metric.timedOut, true);
});

test('process runner preserves non-zero exit code for failed commands', async () => {
  const result = await runCommand(process.execPath, ['-e', 'process.stderr.write("boom\\n"); process.exit(7)'], { timeoutMs: 5000 });
  assert.equal(result.code, 7);
  assert.equal(result.timedOut, false);
  assert.match(result.output, /boom/);
  assert.equal(result.metric.exitCode, 7);
});
