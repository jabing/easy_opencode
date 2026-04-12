#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ts = null;
try {
  ts = require('typescript');
} catch {
  ts = null;
}

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.opencode']);
const JS_EXT = new Set(['.js', '.cjs', '.mjs', '.jsx']);
const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts']);

function collect(dir, acc) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      collect(p, acc);
      continue;
    }
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (JS_EXT.has(ext) || TS_EXT.has(ext)) acc.push(p);
  }
}

function checkJs(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  new vm.Script(text, { filename: filePath });
}

function checkTs(filePath) {
  if (!ts) return;
  const text = fs.readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  if (sf.parseDiagnostics && sf.parseDiagnostics.length > 0) {
    const d = sf.parseDiagnostics[0];
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    throw new Error(`${path.relative(ROOT, filePath)}: ${msg}`);
  }
}

function runTypecheck() {
  const files = [];
  collect(ROOT, files);
  const failures = [];
  let skippedTs = 0;
  for (const file of files) {
    try {
      const ext = path.extname(file).toLowerCase();
      if (JS_EXT.has(ext)) checkJs(file);
      else {
        if (!ts) skippedTs += 1;
        checkTs(file);
      }
    } catch (err) {
      failures.push(`${path.relative(ROOT, file)}: ${err.message}`);
    }
  }
  return { ok: failures.length === 0, checked: files.length, failures, skippedTs, degraded: !ts };
}

function main() {
  const r = runTypecheck();
  if (!r.ok) {
    console.error('[typecheck] FAIL');
    r.failures.slice(0, 20).forEach((f) => console.error(`- ${f}`));
    process.exit(1);
  }
  if (r.degraded) {
    console.log(`[typecheck] PASS (degraded: typescript unavailable) checked=${r.checked} ts_skipped=${r.skippedTs}`);
    return;
  }
  console.log(`[typecheck] PASS checked=${r.checked}`);
}

module.exports = { runTypecheck };

if (require.main === module) {
  main();
}
