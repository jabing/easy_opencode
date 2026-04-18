const test = require('node:test');
const assert = require('node:assert/strict');

test('preset registry exposes stable built-in presets and resolves bundle plans', () => {
  const {
    getPreset,
    listPresets,
    resolvePresetBundles,
  } = require('../src/core/ecosystem/presets.js');

  const presets = listPresets();
  assert.deepEqual(presets.map((item) => item.id), [
    'node-solo',
    'node-team',
    'node-platform',
    'release-governance',
  ]);

  for (const preset of presets) {
    assert.equal(typeof preset.summary, 'string');
    assert.ok(preset.summary.length > 0);
    assert.equal(typeof preset.mode, 'string');
    assert.ok(Array.isArray(preset.bundles));
    assert.ok(Array.isArray(preset.explanation));
    assert.deepEqual(getPreset(preset.id), preset);
  }

  const teamResolution = resolvePresetBundles(['node-team']);
  assert.deepEqual(teamResolution.presets, ['node-team']);
  assert.deepEqual(teamResolution.bundles, ['node-service', 'release-governance', 'lsp-refactor']);
  assert.deepEqual(teamResolution.unknown_presets, []);
  assert.match(teamResolution.explanation.join('\n'), /preset:node-team/);

  const mixedResolution = resolvePresetBundles(['node-platform', 'missing-preset', 'release-governance']);
  assert.deepEqual(mixedResolution.presets, ['node-platform', 'release-governance']);
  assert.deepEqual(mixedResolution.bundles, ['node-service', 'release-governance', 'lsp-refactor', 'mcp-devtools']);
  assert.deepEqual(mixedResolution.unknown_presets, ['missing-preset']);
  assert.match(mixedResolution.explanation.join('\n'), /unknown:missing-preset/);
});
