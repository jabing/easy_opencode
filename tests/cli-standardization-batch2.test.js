const test = require('node:test');
const assert = require('node:assert/strict');

const { EXIT_CODE, parseCliArgs, resolveRootOption } = require('../src/cli/lib/shared.js');
const { main: projectProfileMain, createUsage } = require('../src/cli/project-profile-cli.js');
const { main: qualityGateMain } = require('../src/cli/quality-gate-cli.js');
const { main: releaseCheckMain } = require('../scripts/release-check.js');

function createStream() {
  let text = '';
  return {
    write(chunk) { text += String(chunk); },
    read() { return text; },
  };
}

test('shared CLI parser preserves flags and positional args', () => {
  const args = parseCliArgs(['node', 'cmd', 'target-dir', '--json', '--policy', 'production']);
  assert.deepEqual(args, { _: ['target-dir'], json: true, policy: 'production' });
});

test('shared root resolver prefers explicit --root and normalizes path', () => {
  const root = resolveRootOption({ root: './demo' }, 'ignored');
  assert.equal(root.endsWith('/demo') || root.endsWith('\\demo'), true);
});

test('project-profile CLI help uses shared usage builder and exits cleanly', () => {
  const stdout = createStream();
  let exitCode = null;
  projectProfileMain({
    argv: ['node', 'project-profile', '--help'],
    stdout,
    stderr: createStream(),
    exit: (code) => { exitCode = code; },
    detectProjectProfile: () => { throw new Error('should not run'); },
  });
  assert.equal(exitCode, EXIT_CODE.OK);
  assert.equal(stdout.read(), createUsage((command, args) => [command].concat(args || []).join(' ')) + '\n');
});

test('quality-gate CLI JSON mode uses shared JSON writer and fail exit code', async () => {
  const stdout = createStream();
  let exitCode = null;
  await qualityGateMain({
    argv: ['node', 'quality-gate', '--json'],
    stdout,
    stderr: createStream(),
    exit: (code) => { exitCode = code; },
  });
  const parsed = JSON.parse(stdout.read());
  assert.equal(typeof parsed.gate, 'string');
  assert.equal(exitCode, parsed.gate === 'PASS' ? EXIT_CODE.OK : EXIT_CODE.FAILED);
});

test('release-check CLI help prints shared usage and exits 0', () => {
  const stdout = createStream();
  let exitCode = null;
  releaseCheckMain({
    argv: ['node', 'release-check', '--help'],
    stdout,
    stderr: createStream(),
    exit: (code) => { exitCode = code; },
  });
  assert.equal(exitCode, EXIT_CODE.OK);
  assert.match(stdout.read(), /Usage:/);
  assert.match(stdout.read(), /release-check --json/);
});
