const fs = require('fs');
const path = require('path');
const { toCamelCase, toKebabCase, writeFile } = require('./common.js');

/** @typedef {{ name?: string, summary?: string }} GateScaffoldOptions */

/** @param {string} rootDir @param {GateScaffoldOptions} [options] */
function createGateScaffold(rootDir, options = {}) {
  const name = toKebabCase(options.name);
  if (!name) throw new Error('gate name is required');
  const functionName = `evaluate${toCamelCase(name).replace(/^([a-z])/, (_, ch) => ch.toUpperCase())}Gate`;
  const scriptPath = path.join(rootDir, 'scripts', `${name}.js`);
  const corePath = path.join(rootDir, 'src', 'core', 'gates', `${name}.js`);
  if (fs.existsSync(scriptPath) || fs.existsSync(corePath)) throw new Error(`gate already exists: ${name}`);
  const summary = String(options.summary || `${name} gate`).trim();
  const coreBody = `/**
 * @param {{ evidence?: unknown[] }} [options]
 * @returns {{ gate: string, verdict: 'pass'|'warn'|'fail', summary: string }}
 */
function ${functionName}(options = {}) {
  return { gate: '${name}', verdict: 'pass', summary: ${JSON.stringify(summary)} };
}

module.exports = { ${functionName} };
`;
  const scriptBody = `#!/usr/bin/env node
const { ${functionName} } = require('../../src/core/gates/${name}.js');
const result = ${functionName}({});
process.stdout.write(\`${'${'}JSON.stringify(result, null, 2){'}'}\n\`);
`;
  const testBody = `const test = require('node:test');
const assert = require('node:assert/strict');
const { ${functionName} } = require('../../src/core/gates/${name}.js');

test('${name} gate scaffold emits a stable verdict', () => {
  const result = ${functionName}();
  assert.equal(result.gate, '${name}');
  assert.equal(result.verdict, 'pass');
});
`;
  const docBody = `# ${name}

- Type: gate
- Summary: ${summary}
`;
  const files = [
    writeFile(rootDir, path.relative(rootDir, corePath), coreBody),
    writeFile(rootDir, path.relative(rootDir, scriptPath), scriptBody),
    writeFile(rootDir, path.join('tests', `${name}.test.js`), testBody),
    writeFile(rootDir, path.join('docs', 'gates', `${name}.md`), docBody),
  ];
  fs.chmodSync(scriptPath, 0o755);
  return { gate: name, files };
}

module.exports = { createGateScaffold };
