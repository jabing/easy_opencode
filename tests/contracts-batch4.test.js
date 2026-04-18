const test = require('node:test');
const assert = require('node:assert/strict');

const { assertProjectProfileContract, assertQualityGateContract, assertReleaseCheckContract } = require('../src/shared/contracts.js');
const { main: projectProfileMain } = require('../src/cli/project-profile-cli.js');
const { main: qualityGateMain } = require('../src/cli/quality-gate-cli.js');
const { main: releaseCheckMain } = require('../scripts/release-check.js');

function createStream() {
  let text = '';
  return {
    write(chunk) { text += String(chunk); },
    read() { return text; },
  };
}

test('project-profile contract validator rejects malformed payloads', () => {
  assert.throws(
    () => assertProjectProfileContract({ runtime: 'node', language: 'js', framework: 'node', confidence: 'high', validation: [{}] }),
    /validation\[0\]\.kind/
  );
});

test('quality-gate contract validator accepts current CLI JSON payload', async () => {
  const stdout = createStream();
  await qualityGateMain({
    argv: ['node', 'quality-gate', '--json'],
    stdout,
    stderr: createStream(),
    exit: () => {},
  });
  const parsed = JSON.parse(stdout.read());
  assert.doesNotThrow(() => assertQualityGateContract(parsed));
});

test('release-check contract validator accepts current CLI JSON payload', () => {
  const stdout = createStream();
  releaseCheckMain({
    argv: ['node', 'release-check', '--json'],
    stdout,
    stderr: createStream(),
    exit: () => {},
  });
  const parsed = JSON.parse(stdout.read());
  assert.doesNotThrow(() => assertReleaseCheckContract(parsed));
});

test('project-profile CLI validates contract before emitting JSON', () => {
  const stdout = createStream();
  const stderr = createStream();
  let exitCode = null;
  projectProfileMain({
    argv: ['node', 'project-profile', '--json'],
    stdout,
    stderr,
    exit: (code) => { exitCode = code; },
    detectProjectProfile: () => ({ runtime: 'node', language: 'javascript', framework: 'node', confidence: 'medium', validation: [{ kind: 'build' }] }),
  });
  assert.equal(exitCode, 1);
  assert.equal(stdout.read(), '');
  assert.match(stderr.read(), /project-profile\.validation\[0\]\.command/);
});
