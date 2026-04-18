const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildCommandRegistry } = require('../src/cli/command-registry.js');

test('P2 publishes bootstrap alongside ecosystem on the public managed surface', () => {
  const entries = buildCommandRegistry(process.cwd());
  const scripts = entries.map((entry) => entry.script);
  assert.equal(scripts.includes('bootstrap'), true);
  assert.equal(scripts.includes('ecosystem'), true);
});

test('README documents mode-aware implement automation and bootstrap workflow', () => {
  const body = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');
  assert.match(body, /mode-aware automation/i);
  assert.match(body, /implement runs the scheduler/i);
  assert.match(body, /eoc bootstrap/i);
});
