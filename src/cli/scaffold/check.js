const fs = require('fs');
const path = require('path');
const { toCamelCase, toKebabCase, writeFile } = require('./common.js');

/** @typedef {{ name?: string, summary?: string }} CheckScaffoldOptions */

/** @param {string} rootDir @param {CheckScaffoldOptions} [options] */
function createCheckScaffold(rootDir, options = {}) {
  const name = toKebabCase(options.name);
  if (!name) throw new Error('check name is required');
  const functionName = `run${toCamelCase(name).replace(/^([a-z])/, (_, ch) => ch.toUpperCase())}Check`;
  const scriptPath = path.join(rootDir, 'scripts', `${name}.js`);
  const corePath = path.join(rootDir, 'src', 'core', 'checks', `${name}.js`);
  if (fs.existsSync(scriptPath) || fs.existsSync(corePath)) throw new Error(`check already exists: ${name}`);
  const summary = String(options.summary || `${name} check`).trim();
  const coreBody = `/**
 * @param {{ rootDir?: string }} [options]
 * @returns {{ check: string, status: 'pass'|'warn'|'fail', detail: string }}
 */
function ${functionName}(options = {}) {
  return { check: '${name}', status: 'pass', detail: ${JSON.stringify(summary)} };
}

module.exports = { ${functionName} };
`;
  const scriptBody = `#!/usr/bin/env node
const { ${functionName} } = require('../../src/core/checks/${name}.js');
const result = ${functionName}({ rootDir: process.cwd() });
process.stdout.write(\`${'${'}JSON.stringify(result, null, 2){'}'}\n\`);
`;
  const testBody = `const test = require('node:test');
const assert = require('node:assert/strict');
const { ${functionName} } = require('../../src/core/checks/${name}.js');

test('${name} check scaffold emits a stable result', () => {
  const result = ${functionName}();
  assert.equal(result.check, '${name}');
  assert.equal(result.status, 'pass');
});
`;
  const docBody = `# ${name}

- Type: check
- Summary: ${summary}
`;
  const files = [
    writeFile(rootDir, path.relative(rootDir, corePath), coreBody),
    writeFile(rootDir, path.relative(rootDir, scriptPath), scriptBody),
    writeFile(rootDir, path.join('tests', `${name}.test.js`), testBody),
    writeFile(rootDir, path.join('docs', 'checks', `${name}.md`), docBody),
  ];
  fs.chmodSync(scriptPath, 0o755);
  return { check: name, files };
}

module.exports = { createCheckScaffold };
