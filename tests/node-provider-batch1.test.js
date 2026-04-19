const test = require('node:test');
const assert = require('node:assert/strict');
const { withTempDir, writeFiles } = require('./test-helpers.js');
const { summarizeJsTsFile } = require('../src/core/project-profile.js');
const { createNodeProvider } = require('../src/core/languages/providers/node.js');

test('node provider preserves baseline JS/TS summaries while adding provider metadata', () => {
  const provider = createNodeProvider();

  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'node-provider-fixture', type: 'commonjs' }, null, 2),
      'src/tokens.ts': 'export function parseToken(raw) { return raw.trim(); }\n',
      'src/auth.ts': [
        'import { parseToken } from "./tokens";',
        '',
        'export function refreshToken(id) {',
        '  return parseToken(id) + ":ok";',
        '}',
        '',
      ].join('\n'),
      'tests/auth.test.js': 'const test = require("node:test");\n',
    });
  }, (dir) => {
    assert.equal(provider.supports({ runtime: 'node' }, 'src/auth.ts'), true);
    assert.equal(provider.supports({ runtime: 'unknown' }, 'src/auth.ts'), true);
    assert.equal(provider.supports({ runtime: 'node' }, 'docs/readme.md'), false);

    const analysis = provider.analyzeProject({ rootDir: dir, objective: 'fix refresh token', targets: ['src/auth.ts'] });
    const summary = provider.summarizeTarget({ rootDir: dir, target: 'src/auth.ts', analysis });
    const baseline = summarizeJsTsFile(dir, 'src/auth.ts');

    assert.equal(summary.provider_id, 'node');
    assert.deepEqual(summary.imports, baseline.imports);
    assert.deepEqual(summary.exports, baseline.exports);
    assert.deepEqual(summary.symbols, baseline.symbols);
    assert.equal(summary.line_count, baseline.line_count);
    assert.ok(summary.related_tests.includes('tests/auth.test.js'));
    assert.ok(summary.intelligence.primary_symbols.includes('refreshToken'));
    assert.ok(summary.intelligence.direct_neighbors.includes('src/tokens.ts'));
  });
});
