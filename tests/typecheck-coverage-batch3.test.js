const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readTsconfigFiles() {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tsconfig.json'), 'utf8'));
  return new Set(config.files || []);
}

test('batch3 typecheck covers kernel observability and workflow support modules', () => {
  const files = readTsconfigFiles();
  for (const file of [
    'src/core/checks/build-check.js',
    'src/core/checks/metadata-check.js',
    'src/core/checks/metadata-shared.js',
    'src/shared/error-normalizers/index.js',
    'src/control-plane/kernel/event-log.js',
    'src/control-plane/kernel/events/event-bus.js',
    'src/control-plane/kernel/events/event-store.js',
    'src/control-plane/kernel/run-store.js',
    'src/control-plane/kernel/state-machine.js',
    'src/control-plane/observability/index.js',
    'src/control-plane/workflow/engine.js',
  ]) {
    assert.equal(files.has(file), true, `expected ${file} in tsconfig coverage`);
  }
});
