const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { collectFiles } = require('../adapters/file-walker.js');

/** @type {any | null} */
let ts = null;
try {
  ts = require('typescript');
} catch {
  ts = null;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage']);
const JS_EXT = new Set(['.js', '.cjs', '.mjs', '.jsx']);
const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts']);
const ALL_EXT = new Set([...JS_EXT, ...TS_EXT]);

/** @param {string} filePath */
function checkJs(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  new vm.Script(text, { filename: filePath });
}

/** @param {string} filePath @param {string} [root] */
function checkTs(filePath, root = process.cwd()) {
  if (!ts) return;
  const text = fs.readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  if (sf.parseDiagnostics && sf.parseDiagnostics.length > 0) {
    const d = sf.parseDiagnostics[0];
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    throw new Error(`${path.relative(root, filePath)}: ${msg}`);
  }
}

/** @typedef {{ ok: boolean, checked: number, failures: string[], skippedTs: number, degraded: boolean }} SyntaxCheckResult */

/** @param {string} [root] @returns {SyntaxCheckResult} */
function runSyntaxCheck(root = process.cwd()) {
  const files = collectFiles(root, { allowedExtensions: ALL_EXT, ignoredDirs: SKIP_DIRS });
  /** @type {string[]} */
  const failures = [];
  let skippedTs = 0;

  for (const file of files) {
    try {
      const ext = path.extname(file).toLowerCase();
      if (JS_EXT.has(ext)) checkJs(file);
      else {
        if (!ts) skippedTs += 1;
        checkTs(file, root);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${path.relative(root, file)}: ${message}`);
    }
  }

  return { ok: failures.length === 0, checked: files.length, failures, skippedTs, degraded: !ts };
}

/** @param {string} [label] */
function main(label = 'syntax-check') {
  const result = runSyntaxCheck();
  if (!result.ok) {
    process.stderr.write(`[${label}] FAIL\n`);
    result.failures.slice(0, 20).forEach((failure) => process.stderr.write(`- ${failure}\n`));
    process.exit(1);
  }
  if (result.degraded) {
    process.stdout.write(`[${label}] PASS (degraded: typescript unavailable) checked=${result.checked} ts_skipped=${result.skippedTs}\n`);
    return;
  }
  process.stdout.write(`[${label}] PASS checked=${result.checked}\n`);
}

module.exports = {
  JS_EXT,
  TS_EXT,
  runSyntaxCheck,
  runTypecheck: runSyntaxCheck,
  main,
};
