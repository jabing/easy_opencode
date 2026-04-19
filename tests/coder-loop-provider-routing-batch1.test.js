const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { withTempDir, writeFiles } = require('./test-helpers.js');
const { buildImplementationContext } = require('../src/core/implementation/context.js');
const { summarizeJsTsFile } = require('../src/core/project-profile.js');
const { createNodeProvider } = require('../src/core/languages/providers/node.js');

function fixtureFiles() {
  return {
    'package.json': JSON.stringify({
      name: 'provider-routing-fixture',
      version: '1.0.0',
      scripts: { test: 'node --test tests/auth.test.js' },
      type: 'commonjs',
    }, null, 2),
    'src/auth.ts': [
      'import { parseToken } from "./tokens";',
      'export function refreshToken(id) {',
      '  return parseToken(id) + ":ok";',
      '}',
      '',
    ].join('\n'),
    'src/tokens.ts': 'export function parseToken(raw) { return raw.trim(); }\n',
    'app/main.py': [
      'from .helpers import render_token',
      '',
      'def refresh_token(user_id):',
      '    return render_token(user_id)',
      '',
    ].join('\n'),
    'app/helpers.py': [
      'def render_token(value):',
      '    return value.strip()',
      '',
    ].join('\n'),
    'tests/auth.test.js': 'const test = require("node:test");\n',
  };
}

function createFakePythonProvider() {
  return {
    id: 'python',
    supports(profile, target) {
      return /\.py$/i.test(String(target || ''));
    },
    analyzeProject({ targets }) {
      return {
        provider_id: 'python',
        target_count: Array.isArray(targets) ? targets.length : 0,
      };
    },
    summarizeTarget({ target, analysis }) {
      return {
        provider_id: 'python',
        target,
        language: 'python',
        analysis_provider_id: analysis ? analysis.provider_id : null,
      };
    },
  };
}

test('implementation context preserves the node baseline summary for js/ts targets', () => {
  withTempDir((dir) => writeFiles(dir, fixtureFiles()), (dir) => {
    const context = buildImplementationContext({ rootDir: dir, objective: 'fix refresh token bug', targets: ['src/auth.ts'] });
    const baseline = summarizeJsTsFile(dir, 'src/auth.ts');
    const target = context.targets.find((item) => item.path === 'src/auth.ts');

    assert.equal(context.provider_groups.length, 1);
    assert.equal(context.provider_groups[0].provider_id, 'node');
    assert.equal(context.composite.enabled, false);
    assert.equal(context.composite.default_provider_id, 'node');
    assert.equal(target.provider_id, 'node');
    assert.deepEqual(target.imports, baseline.imports);
    assert.deepEqual(target.exports, baseline.exports);
    assert.deepEqual(target.symbols, baseline.symbols);
    assert.equal(target.line_count, baseline.line_count);
    assert.ok(target.related_tests.includes('tests/auth.test.js'));
    assert.ok(target.intelligence.primary_symbols.includes('refreshToken'));
    assert.ok(target.semantic);
  });
});

test('implementation context groups mixed targets by provider and carries provider ids onto target summaries', () => {
  withTempDir((dir) => writeFiles(dir, fixtureFiles()), (dir) => {
    const nodeProvider = createNodeProvider();
    const pythonProvider = createFakePythonProvider();
    const registry = {
      providers: [nodeProvider, pythonProvider],
      resolveTarget(profile, target) {
        if (pythonProvider.supports(profile, target)) return pythonProvider;
        return nodeProvider;
      },
      resolveTargetGroups(profile, targets = []) {
        const grouped = new Map();
        for (const target of targets) {
          const provider = this.resolveTarget(profile, target);
          const bucket = grouped.get(provider.id) || [];
          bucket.push(target);
          grouped.set(provider.id, bucket);
        }
        return Array.from(grouped.entries()).map(([provider_id, groupedTargets]) => ({ provider_id, targets: groupedTargets }));
      },
    };

    const context = buildImplementationContext({
      rootDir: dir,
      objective: 'fix refresh token import',
      targets: ['app/main.py', 'src/auth.ts', 'app/helpers.py'],
      registry,
    });

    const pythonTarget = context.targets.find((item) => item.path === 'app/main.py');
    const nodeTarget = context.targets.find((item) => item.path === 'src/auth.ts');

    assert.deepEqual(context.provider_groups, [
      { provider_id: 'python', targets: ['app/main.py', 'app/helpers.py'], target_count: 2, related_tests: [] },
      { provider_id: 'node', targets: ['src/auth.ts'], target_count: 1, related_tests: ['tests/auth.test.js'] },
    ]);
    assert.equal(context.composite.enabled, true);
    assert.equal(context.composite.provider_count, 2);
    assert.deepEqual(context.composite.provider_ids, ['python', 'node']);
    assert.equal(context.composite.default_provider_id, 'python');
    assert.equal(pythonTarget.provider_id, 'python');
    assert.equal(pythonTarget.analysis_provider_id, 'python');
    assert.equal(nodeTarget.provider_id, 'node');
    assert.ok(Array.isArray(context.semantic_index.targets));
  });
});
