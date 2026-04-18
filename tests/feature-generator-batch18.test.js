const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { withTempDir, writeFiles } = require('./test-helpers.js');
const { updateMemoryFromFeatureResult } = require('../src/core/project/memory.js');
const { deriveGenerationHints, derivePlanningHints } = require('../src/core/feature/feedback.js');
const { detectProjectProfile } = require('../src/core/project-profile.js');

test('project memory records adaptive module preferences and generation history', () => {
  const base = {
    coding_style: 'functional',
    preferred_feature_shape: ['route', 'controller', 'service', 'repository', 'schema', 'test', 'docs'],
  };

  const success = updateMemoryFromFeatureResult(base, {
    feature_name: 'audit-log',
    enabled_modules: ['route', 'controller', 'service', 'schema', 'docs'],
    implementation_style: 'functional',
    shape_strategy: 'project-guided',
    status: 'success',
  });

  assert.equal(success.module_preference_stats.docs.success, 1);
  assert.equal(success.module_preference_stats.repository.disabled, 1);
  assert.equal(success.generation_history.length, 1);
  assert.equal(success.last_feature_generation.status, 'success');

  const failed = updateMemoryFromFeatureResult(success, {
    feature_name: 'audit-log-retry',
    enabled_modules: ['route', 'controller', 'service', 'schema', 'test'],
    implementation_style: 'functional',
    shape_strategy: 'memory-guided',
    status: 'failure',
  });

  assert.equal(failed.module_preference_stats.test.failure, 1);
  assert.equal(failed.generation_history.length, 2);
  assert.equal(failed.last_feature_generation.status, 'failure');
  assert.ok(Array.isArray(failed.last_feature_generation.adaptive_preferred_shape));
});

test('planning hints suppress repeatedly failing test modules and optional repository module by history', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: 'batch18-node-project',
        scripts: {
          build: 'node -e "process.exit(0)"',
          test: 'node -e "process.exit(0)"',
        },
        dependencies: { express: '^4.19.0' },
      }, null, 2),
      'src/modules/users/users.route.ts': 'export const usersRoute = true;\n',
      'src/modules/users/users.service.ts': 'export const usersService = true;\n',
      'docs/api/index.md': '# API\n',
    });
  }, (dir) => {
    const profile = detectProjectProfile(dir);
    const memory = {
      coding_style: 'functional',
      test_framework: 'node:test',
      module_preference_stats: {
        repository: { enabled: 0, disabled: 3, success: 0, failure: 0 },
        test: { enabled: 2, disabled: 3, success: 0, failure: 2 },
        docs: { enabled: 4, disabled: 0, success: 4, failure: 0 },
      },
      generation_history: [
        { feature_name: 'one', status: 'failure', enabled_modules: ['route', 'controller', 'service', 'schema', 'test'] },
        { feature_name: 'two', status: 'failure', enabled_modules: ['route', 'controller', 'service', 'schema', 'test'] },
      ],
    };

    const generation = deriveGenerationHints(memory);
    assert.equal(generation.test_module_bias, 'suppress-by-history');
    assert.equal(generation.feature_history_count, 2);

    const planning = derivePlanningHints(dir, profile, memory, {});
    assert.equal(planning.with_test, false);
    assert.equal(planning.with_repository, false);
    assert.equal(planning.shape_strategy, 'memory-guided');
    assert.ok(planning.preferred_feature_shape.indexOf('docs') < planning.preferred_feature_shape.indexOf('test'));
    assert.ok(planning.reasons.some((item) => /previous generated test modules repeatedly failed verification/.test(item)));
  });
});
