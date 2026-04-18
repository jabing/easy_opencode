const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const { runLintBridge, runBuildBridge } = require('../src/core/checks/validation-bridges.js');

test('package scripts expose explicit repository validation commands with compatibility bridges', () => {
  assert.equal(pkg.scripts['check:metadata'], 'node scripts/check-metadata.js');
  assert.equal(pkg.scripts['check:repo'], 'node scripts/check-repo.js');
  assert.equal(pkg.scripts['lint:legacy'], 'node scripts/metadata-check.js');
  assert.equal(pkg.scripts['build:legacy'], 'node scripts/build-check.js');
  assert.equal(pkg.scripts.lint, 'node scripts/lint.js');
  assert.equal(pkg.scripts.build, 'node scripts/build.js');
});

test('lint bridge combines metadata and syntax validation results', () => {
  const result = runLintBridge('/tmp/repo', {
    runMetadataCheck(root) {
      assert.equal(root, '/tmp/repo');
      return { ok: true, detail: 'metadata ok' };
    },
    runSyntaxCheck(root) {
      assert.equal(root, '/tmp/repo');
      return { ok: true, checked: 17, failures: [], skippedTs: 0, degraded: false };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'compatibility-bridge');
  assert.deepEqual(result.checks.map((item) => item.name), ['metadata-check', 'syntax-check']);
  assert.equal(result.checks[1].detail, 'checked=17');
});

test('build bridge combines repo consistency and pack dry-run validation', () => {
  const result = runBuildBridge('/tmp/repo', {
    runBuildCheck(root) {
      assert.equal(root, '/tmp/repo');
      return { ok: true, missing: [], reasons: [] };
    },
    runPackDryRun(root) {
      assert.equal(root, '/tmp/repo');
      return { ok: true, command: 'npm pack --dry-run', status: 0, stdout: '', stderr: '' };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'compatibility-bridge');
  assert.deepEqual(result.checks.map((item) => item.name), ['repo-check', 'pack-dry-run']);
  assert.match(result.checks[1].detail, /npm pack --dry-run/);
});
