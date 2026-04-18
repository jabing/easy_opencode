const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { buildCommandRegistry } = require('../src/cli/command-registry.js');
const { buildAudit } = require('../scripts/historical-debt-audit.js');
const { normalizeInvocation } = require('../scripts/internal-tools.js');

test('deprecated internal wrappers are thin wrappers and deletion candidates', () => {
  const root = path.resolve(__dirname, '..');
  const registry = buildCommandRegistry(root);
  const audit = buildAudit(root);
  const candidates = new Map(audit.deletion_candidates.map((item) => [item.script, item]));
  for (const name of ['analyze-project-structure', 'prepare-implementation-context', 'enrich-implementation-context', 'sync-project-memory', 'debug-fix-loop', 'model-route', 'orchestrator-state', 'benchmark-feedback', 'capability-registry', 'skill-runner', 'release-override', 'safe-apply']) {
    const entry = registry.find((item) => item.script === name);
    assert.equal(entry.lifecycle, 'deprecated');
    assert.equal(entry.replacement, 'internal-tools');
    assert.equal(candidates.get(name).thin_wrapper, true);
  }
});

test('internal-tools normalizes new skills and release domains', () => {
  assert.deepEqual(normalizeInvocation(['node', 'scripts/internal-tools.js', 'capability-registry']), {
    domain: 'skills',
    command: 'capability-registry',
    forwarded: ['node', 'scripts/internal-tools.js'],
  });
  assert.deepEqual(normalizeInvocation(['node', 'scripts/internal-tools.js', 'release-override']), {
    domain: 'release',
    command: 'override',
    forwarded: ['node', 'scripts/internal-tools.js'],
  });
});

test('historical debt audit reports merged internal domains', () => {
  const audit = buildAudit(path.resolve(__dirname, '..'));
  const domains = new Map(audit.recommended_internal_merges.map((item) => [item.domain, item.commands]));
  assert.ok(domains.has('skills'));
  assert.ok(domains.get('skills').includes('skill-runner'));
  assert.ok(domains.has('release'));
  assert.ok(domains.get('release').includes('safe-apply'));
});
