const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, runNodeResult, withTempDir, writeFiles } = require('./test-helpers.js');
const { readHookPolicy } = require('../src/core/ecosystem/hook-policy.js');

const ROOT = path.resolve(__dirname, '..');
const INSTALL = path.join(ROOT, 'scripts', 'install.js');
const EOC_BIN = path.join(ROOT, 'bin', 'eoc.js');

function seedProject(dir) {
  writeFiles(dir, {
    'package.json': JSON.stringify({
      name: 'fixture-app',
      version: '1.0.0',
      scripts: { test: 'node --test' },
    }, null, 2) + '\n',
    '.github/workflows/ci.yml': 'name: ci\n',
  });
}

test('project install bootstrap writes managed ecosystem state and preserves explicit bundles', () => {
  withTempDir((dir) => seedProject(dir), (dir) => {
    const result = runNodeResult(INSTALL, ['--project', '--yes', '--quiet', '--target', dir, '--bootstrap', '--bundle', 'release-governance'], { cwd: ROOT });
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const ecosystemPath = path.join(dir, '.opencode', 'ecosystem.json');
    assert.equal(fs.existsSync(ecosystemPath), true);

    const ecosystemState = JSON.parse(fs.readFileSync(ecosystemPath, 'utf8'));
    assert.deepEqual(ecosystemState.enabled_bundles, ['release-governance']);
    assert.equal(ecosystemState.applied_bundles.includes('release-governance'), true);
    assert.equal(ecosystemState.applied_bundles.includes('node-service'), true);
    assert.equal(ecosystemState.bootstrap.strategy, 'install-bootstrap');
    assert.equal(Array.isArray(ecosystemState.bootstrap.recommended_bundles), true);
  });
});

test('eoc ecosystem status reports managed state for an installed project', () => {
  withTempDir((dir) => seedProject(dir), (dir) => {
    const install = runNodeResult(INSTALL, ['--project', '--yes', '--quiet', '--target', dir, '--bootstrap', '--bundle', 'release-governance'], { cwd: ROOT });
    assert.equal(install.code, 0, install.stderr || install.stdout);

    const payload = runNodeJson(EOC_BIN, ['ecosystem', 'status', '--json'], { cwd: dir });
    assert.equal(payload.command, 'status');
    assert.deepEqual(payload.ecosystem_state.enabled_bundles, ['release-governance']);
    assert.equal(payload.workspace_profile.recommended_bundles.includes('node-service'), true);
    assert.equal(payload.workspace_profile.recommended_bundles.includes('release-governance'), true);
  });
});

test('hook policy upgrades quality mode when release-governance is active', () => {
  withTempDir((dir) => seedProject(dir), (dir) => {
    const install = runNodeResult(INSTALL, ['--project', '--yes', '--quiet', '--target', dir, '--bootstrap', '--bundle', 'release-governance'], { cwd: ROOT });
    assert.equal(install.code, 0, install.stderr || install.stdout);

    const policy = readHookPolicy(dir);
    assert.equal(policy.bundles.includes('release-governance'), true);
    assert.equal(policy.qualityMode, 'full');
  });
});
