const test = require('node:test');
const assert = require('node:assert/strict');

test('language registry resolves repository default and target-scoped providers', async () => {
  const { createRegistry } = require('../src/core/languages/registry.js');
  const registry = createRegistry([
    {
      id: 'node',
      supports(profile, target) {
        return profile.runtime === 'node' || /\.tsx?$/.test(target || '');
      },
    },
    {
      id: 'python',
      supports(profile, target) {
        return profile.runtime === 'python' || /\.py$/.test(target || '');
      },
    },
  ]);
  const profile = { runtime: 'node', framework: 'unknown' };
  assert.equal(registry.resolveDefault(profile).id, 'node');
  assert.equal(registry.resolveTarget(profile, 'app/main.py').id, 'python');
  assert.equal(registry.resolveTarget(profile, 'src/index.ts').id, 'node');
});

test('language registry prefers target-only provider over repo-default-capable provider', async () => {
  const { createRegistry } = require('../src/core/languages/registry.js');
  const registry = createRegistry([
    {
      id: 'node',
      supports(profile, target) {
        return profile.runtime === 'node' || /\.tsx?$/.test(target || '');
      },
    },
    {
      id: 'python',
      supports(profile, target) {
        return /\.py$/.test(target || '');
      },
    },
  ]);
  const profile = { runtime: 'node', framework: 'unknown' };
  assert.equal(registry.resolveTarget(profile, 'app/main.py').id, 'python');
});

test('language registry fails closed for unsupported targets', async () => {
  const { createRegistry } = require('../src/core/languages/registry.js');
  const registry = createRegistry([
    {
      id: 'node',
      supports(profile, target) {
        return profile.runtime === 'node' && target == null;
      },
    },
  ]);
  assert.throws(() => registry.resolveTarget({ runtime: 'node' }, 'app/main.py'), /unsupported target: app\/main\.py/);
});

test('language registry rejects invalid providers and missing defaults', async () => {
  const { createRegistry } = require('../src/core/languages/registry.js');
  assert.throws(() => createRegistry([{ id: 'broken' }]), /invalid language provider/);
  const registry = createRegistry([
    {
      id: 'python',
      supports(profile, target) {
        return /\.py$/.test(target || '');
      },
    },
  ]);
  assert.throws(() => registry.resolveDefault({ runtime: 'node' }), /no default language provider/);
});

test('language registry groups mixed targets by provider in encounter order', async () => {
  const { createRegistry } = require('../src/core/languages/registry.js');
  const registry = createRegistry([
    {
      id: 'node',
      supports(profile, target) {
        return /\.tsx?$/.test(target || '');
      },
    },
    {
      id: 'python',
      supports(profile, target) {
        return /\.py$/.test(target || '');
      },
    },
  ]);
  const groups = registry.resolveTargetGroups({ runtime: 'node' }, ['app/main.py', 'src/index.ts', 'app/other.py']);
  assert.deepEqual(groups, [
    { provider_id: 'python', targets: ['app/main.py', 'app/other.py'] },
    { provider_id: 'node', targets: ['src/index.ts'] },
  ]);
});
