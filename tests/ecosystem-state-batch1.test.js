const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { withTempDir, writeFiles } = require('./test-helpers.js');

test('loadEcosystemState returns normalized defaults when no managed file exists', () => {
  const { loadEcosystemState } = require('../src/core/ecosystem/state.js');
  withTempDir(() => {}, (dir) => {
    const state = loadEcosystemState(dir);
    assert.deepEqual(state, {
      schema_version: 1,
      applied_bundles: [],
      enabled_bundles: [],
      disabled_bundles: [],
      mode_overrides: {},
      automation_policy_overrides: {},
      bootstrap: null,
      source: 'default',
      file_path: path.join(dir, '.opencode', 'ecosystem.json'),
    });
  });
});

test('loadEcosystemState normalizes persisted arrays and ignores duplicate bundle entries', () => {
  const { loadEcosystemState } = require('../src/core/ecosystem/state.js');
  withTempDir(() => {}, (dir) => {
    writeFiles(dir, {
      '.opencode/ecosystem.json': JSON.stringify({
        schema_version: 1,
        applied_bundles: ['node-service', 'node-service'],
        enabled_bundles: ['release-governance', 'release-governance'],
        disabled_bundles: ['legacy-hooks'],
        mode_overrides: { implement_review_gate: true },
        automation_policy_overrides: { verify: 'fast' },
        bootstrap: { applied_at: '2026-04-18T00:00:00.000Z' },
      }, null, 2),
    });
    const state = loadEcosystemState(dir);
    assert.deepEqual(state.applied_bundles, ['node-service']);
    assert.deepEqual(state.enabled_bundles, ['release-governance']);
    assert.deepEqual(state.disabled_bundles, ['legacy-hooks']);
    assert.equal(state.source, 'managed');
  });
});

test('loadEcosystemState rejects invalid object shapes with a stable error', () => {
  const { loadEcosystemState } = require('../src/core/ecosystem/state.js');
  withTempDir(() => {}, (dir) => {
    fs.mkdirSync(path.join(dir, '.opencode'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.opencode', 'ecosystem.json'), '{"applied_bundles":"node-service"}');
    assert.throws(() => loadEcosystemState(dir), /invalid ecosystem state/i);
  });
});
