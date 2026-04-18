const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('cli entrypoints delegate shared parsing and extracted runtime modules', () => {
  const benchmark = read('src/cli/benchmark-suite-cli.js');
  const implementTask = read('src/cli/implement-task-cli.js');
  const coderLoop = read('src/cli/coder-loop-cli.js');
  const installCli = read('src/cli/install-cli.js');
  const deliveryReport = read('src/cli/delivery-report-cli.js');
  const reviewGate = read('src/cli/review-gate-cli.js');
  const debugFixLoop = read('src/core/repair/debug-fix-loop.js');

  assert.match(benchmark, /\.\.\/shared\/cli\/args\.js/);
  assert.match(benchmark, /\.\.\/core\/benchmark\/suite-runtime\.js/);
  assert.match(implementTask, /\.\.\/shared\/cli\/args\.js/);
  assert.match(implementTask, /\.\.\/core\/implementation\/plan-store\.js/);
  assert.match(implementTask, /\.\.\/core\/implementation\/skill-selection\.js/);
  assert.match(implementTask, /\.\.\/core\/implementation\/scaffold-runner\.js/);
  assert.match(implementTask, /\.\.\/core\/implementation\/plan-renderers\.js/);
  assert.match(coderLoop, /\.\.\/shared\/cli\/args\.js/);

  assert.doesNotMatch(benchmark, /function parseArgs\(/);
  assert.doesNotMatch(implementTask, /function parseArgs\(/);
  assert.doesNotMatch(coderLoop, /function parseArgs\(/);
  assert.match(installCli, /\.\/install-support\.js/);
  assert.match(deliveryReport, /\.\.\/core\/delivery\/report-renderers\.js/);
  assert.match(reviewGate, /\.\.\/core\/gates\/review-report-renderer\.js/);
  assert.match(debugFixLoop, /\.\/repair-helpers\.js/);
});

test('largest cli entrypoints stay below the tightened maintainability budget', () => {
  const budgets = [
    ['src/cli/benchmark-suite-cli.js', 260],
    ['src/cli/implement-task-cli.js', 460],
    ['src/cli/coder-loop-cli.js', 470],
    ['src/cli/install-cli.js', 460],
    ['src/cli/delivery-report-cli.js', 380],
    ['src/cli/review-gate-cli.js', 500],
    ['src/core/repair/debug-fix-loop.js', 320],
  ];
  for (const [rel, maxLines] of budgets) {
    const lineCount = read(rel).trimEnd().split(/\n/).length;
    assert.ok(lineCount <= maxLines, `${rel} expected <= ${maxLines} lines, got ${lineCount}`);
  }
});
