const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { withTempDir, writeFiles } = require('./test-helpers.js');
const { buildImplementationContext } = require('../src/core/implementation/context.js');
const { runDebugFixLoop } = require('../src/core/repair/debug-fix-loop.js');
const ROOT = path.resolve(__dirname, '..');

function fixtureFiles() {
  return {
    'package.json': JSON.stringify({
      name: 'semantic-paths-fixture',
      version: '1.0.0',
      scripts: { test: 'node --test tests/auth.test.js' },
      type: 'commonjs',
    }, null, 2),
    'src/auth.ts': [
      'export function parseToken(raw) { return raw.trim(); }',
      'export function refreshToken(id) { return parseToken(id) + ":ok"; }',
      '',
    ].join('\n'),
    'src/index.ts': 'export { refreshToken } from "./auth";\n',
    'src/router.ts': 'const { refreshToken } = require("./auth");\nfunction mount() { return refreshToken("x"); }\nmodule.exports = { mount };\n',
    'src/server.ts': 'const { mount } = require("./router");\nfunction start() { return mount(); }\nmodule.exports = { start };\n',
    'tests/auth.test.js': 'const test = require("node:test"); const assert = require("node:assert/strict"); const { refreshToken } = require("../src/auth"); test("refresh", () => assert.equal(refreshToken("a"), "a:ok"));\n',
  };
}

test('implementation context ranks entrypoint paths for semantic targets', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixtureFiles());
  }, (dir) => {
    const context = buildImplementationContext({ rootDir: dir, objective: 'fix refresh token import', targets: ['src/auth.ts'] });
    const target = context.targets.find((item) => item.path === 'src/auth.ts');
    assert.ok(target.semantic.ranked_entrypoint_paths.length > 0);
    assert.ok(target.semantic.ranked_entrypoint_paths.some((item) => item.path === 'src/server.ts'));
    assert.ok(target.semantic.ranked_entrypoint_paths.some((item) => item.path === 'src/router.ts'));
    assert.ok(target.semantic.ranked_entrypoint_paths[0].score >= target.semantic.ranked_entrypoint_paths[target.semantic.ranked_entrypoint_paths.length - 1].score);
  });
});

test('debug-fix-loop returns execution-ready automatic repair summary', () => {
  withTempDir((dir) => {
    writeFiles(dir, fixtureFiles());
  }, (dir) => {
    const result = runDebugFixLoop({
      repoRoot: dir,
      assetRoot: ROOT,
      featureName: 'auth repair',
      verifyCommands: ['node --test tests/auth.test.js'],
      subject: 'auth repair',
    });
    assert.equal(result.ok, true);
    assert.ok(result.patchDecision);
    assert.ok(result.automaticRepair);
    assert.equal(result.automaticRepair.execution_ready, true);
    assert.ok(Array.isArray(result.automaticRepair.verify_commands));
  });
});
