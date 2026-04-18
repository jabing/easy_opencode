const fs = require('fs');
const path = require('path');
const { toCamelCase, toKebabCase, writeFile } = require('./common.js');

/** @typedef {{ name?: string, summary?: string }} RunnerScaffoldOptions */

/** @param {string} rootDir @param {RunnerScaffoldOptions} [options] */
function createRunnerScaffold(rootDir, options = {}) {
  const name = toKebabCase(options.name);
  if (!name) throw new Error('runner name is required');
  const functionName = `detect${toCamelCase(name).replace(/^([a-z])/, (_, ch) => ch.toUpperCase())}Runtime`;
  const srcRunnerPath = path.join(rootDir, 'src', 'core', 'project-profile', 'runners', `${name}.js`);
  const scriptRunnerPath = path.join(rootDir, 'scripts', 'runners', `${name}.js`);
  if (fs.existsSync(srcRunnerPath) || fs.existsSync(scriptRunnerPath)) throw new Error(`runner already exists: ${name}`);
  const summary = String(options.summary || `${name} runtime runner`).trim();
  const coreBody = `/**
 * @param {{ rootDir: string, files: string[] }} context
 * @returns {import('../../../shared/domain.js').RunnerDetectionResult|null}
 */
function ${functionName}(context) {
  return null;
}

module.exports = { detectRuntime: ${functionName}, ${functionName} };
`;
  const scriptBody = `const { detectRuntime, ${functionName} } = require('../../core/src/core/project-profile/runners/${name}.js');

module.exports = { detectRuntime, ${functionName} };
`;
  const testBody = `const test = require('node:test');
const assert = require('node:assert/strict');
const runner = require('../../src/core/project-profile/runners/${name}.js');

test('${name} runner scaffold exports detectRuntime', () => {
  assert.equal(typeof runner.detectRuntime, 'function');
});
`;
  const docBody = `# ${name}

- Type: runner
- Summary: ${summary}
- Contract: return null when not matched, otherwise a RunnerDetectionResult
`;
  const files = [
    writeFile(rootDir, path.relative(rootDir, srcRunnerPath), coreBody),
    writeFile(rootDir, path.relative(rootDir, scriptRunnerPath), scriptBody),
    writeFile(rootDir, path.join('tests', `project-profile-runner-${name}.test.js`), testBody),
    writeFile(rootDir, path.join('docs', 'runners', `${name}.md`), docBody),
  ];
  return { runner: name, files };
}

module.exports = { createRunnerScaffold };
