const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildCommandRegistry } = require('../src/cli/command-registry.js');

test('P1 publishes ecosystem but keeps bootstrap hidden until its dedicated CLI exists', () => {
  const entries = buildCommandRegistry(process.cwd());
  const scripts = entries.map((entry) => entry.script);
  assert.equal(scripts.includes('bootstrap'), false);
  assert.equal(scripts.includes('ecosystem'), true);
});

test('README documents mode-aware implement automation', () => {
  const body = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');
  assert.match(body, /mode-aware automation/i);
  assert.match(body, /implement runs the scheduler/i);
});
