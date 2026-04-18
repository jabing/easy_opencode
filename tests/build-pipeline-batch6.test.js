const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runBuildPipeline, REQUIRED_PACKED_FILES, FORBIDDEN_PACKED_PREFIXES, validatePackedContents } = require('../src/core/build/pipeline.js');
const { runInternalScript } = require('../src/core/quality/script-checks.js');

const ROOT = path.resolve(__dirname, '..');

test('build pipeline creates a publishable tarball with validated packed contents', () => {
  const result = runBuildPipeline(ROOT);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'production-pipeline');
  const checkMap = Object.fromEntries(result.checks.map((item) => [item.name, item]));
  assert.equal(checkMap['repo-check'].ok, true);
  assert.equal(checkMap['package-tarball'].ok, true);
  assert.equal(checkMap['packed-contents'].ok, true);
  assert.ok(result.artifact);
  assert.ok(result.artifact.files > 0);
  assert.ok(result.artifact.unpackedSize > 0);
});

test('validatePackedContents enforces required assets, bins, and forbidden runtime state', () => {
  const fakePayload = [{
    filename: 'easy-opencode.tgz',
    files: [
      ...REQUIRED_PACKED_FILES.map((file) => ({ path: file, size: 1 })),
      { path: 'bin/eoc.js', size: 1 },
      { path: 'bin/eoc-install.js', size: 1 },
      { path: 'bin/eoc-script.js', size: 1 },
      { path: `${FORBIDDEN_PACKED_PREFIXES[0]}state.json`, size: 1 },
    ],
  }];
  const validation = validatePackedContents(ROOT, fakePayload);
  assert.equal(validation.ok, false);
  assert.deepEqual(validation.missing, []);
  assert.equal(validation.present_forbidden.length, 1);
  assert.match(validation.present_forbidden[0], /^\.opencode\//);
});

test('quality internal build script uses the production build pipeline', async () => {
  const result = await runInternalScript('build', true, ROOT);
  assert.ok(result);
  assert.equal(result.code, 0);
  assert.match(result.output, /mode=production-pipeline/);
  assert.match(result.output, /files=/);
});
