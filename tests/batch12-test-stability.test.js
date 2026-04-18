const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { withTempDir, writeFiles, runNodeResult } = require('./test-helpers.js');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'test-stability.js');

test('test-stability emits structured summary and supports temp copy', () => {
  withTempDir((root) => {
    writeFiles(root, {
      'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }),
      'bin/npm': '#!/usr/bin/env node\nconst fs=require("fs"); const path=require("path");\nif (process.argv[2] === "test") { console.log("ok from fake npm test"); process.exit(0); }\nconsole.error("unexpected", process.argv.slice(2).join(" ")); process.exit(1);\n',
      'bin/npm.cmd': '@echo off\r\nnode "%~dp0npm" %*\r\n',
    });
    require('fs').chmodSync(path.join(root, 'bin', 'npm'), 0o755);
  }, (root) => {
    const envPath = `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`;
    const result = runNodeResult(SCRIPT, ['--root', root, '--repeat', '2', '--json', '--temp-copy'], {
      cwd: root,
      env: { PATH: envPath },
    });
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.schema_name, 'test_stability_summary');
    assert.equal(summary.workspace_mode, 'temp_copy');
    assert.equal(summary.repeat_count >= 1, true);
    assert.equal(summary.iterations.length >= 1, true);
  });
});
