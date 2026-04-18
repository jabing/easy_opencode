const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPrimitiveDefinition,
  listKnownPrimitives,
  normalizePrimitiveName,
  primitiveToRefactorOperation,
  resolveRefactorPrimitive,
  resolveScaffoldPrimitive,
} = require('../src/core/code-primitives.js');

test('primitive registry normalizes refactor and scaffold aliases', () => {
  assert.equal(normalizePrimitiveName('rename-symbol'), 'rename_symbol');
  assert.equal(normalizePrimitiveName('insert_import'), 'add_import');
  assert.equal(normalizePrimitiveName('patch-framework-entry'), 'patch_framework_entry');
  assert.ok(listKnownPrimitives().includes('register_route'));
});

test('primitive registry maps refactor operations and scaffold updates to canonical ids', () => {
  assert.equal(resolveRefactorPrimitive('add-import'), 'add_import');
  assert.equal(primitiveToRefactorOperation('ensure_export'), 'ensure-export');
  assert.equal(resolveScaffoldPrimitive({ type: 'insert_import' }), 'add_import');
  assert.equal(resolveScaffoldPrimitive({ primitive: 'register_provider' }), 'register_provider');
  const definition = getPrimitiveDefinition('register-route');
  assert.equal(definition.id, 'register_route');
  assert.equal(definition.family, 'framework_wiring');
});
