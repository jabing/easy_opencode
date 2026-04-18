const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_DIR = path.join(ROOT, 'src', 'shared', 'contracts');

test('shared contract validators stay under type-check rather than ts-nocheck', () => {
  for (const name of fs.readdirSync(CONTRACT_DIR).filter((item) => item.endsWith('.js'))) {
    const content = fs.readFileSync(path.join(CONTRACT_DIR, name), 'utf8');
    assert.doesNotMatch(content, /@ts-nocheck/, `${name} should participate in typecheck`);
  }
});
