#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.opencode']);

function usage() {
  console.log('Usage:');
  console.log('  node scripts/ast-rewrite.js rename-symbol --from <old> --to <new> [--path <dir>] [--dry-run]');
}

function parseArgs(argv) {
  const cmd = argv[2];
  const opts = { _: [] };
  for (let i = 3; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) {
      opts._.push(t);
      continue;
    }
    const k = t.slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith('--')) opts[k] = true;
    else {
      opts[k] = n;
      i += 1;
    }
  }
  return { cmd, opts };
}

function collectFiles(root, acc) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      collectFiles(p, acc);
      continue;
    }
    if (!e.isFile()) continue;
    if (CODE_EXT.has(path.extname(e.name).toLowerCase())) acc.push(p);
  }
}

function gatherReplacements(source, fromName, toName) {
  const edits = [];
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === fromName) {
      edits.push({ start: node.getStart(source), end: node.getEnd(), text: toName });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return edits;
}

function applyEdits(text, edits) {
  if (edits.length === 0) return text;
  const sorted = edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of sorted) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

function renameSymbol(baseDir, fromName, toName, dryRun) {
  const files = [];
  collectFiles(baseDir, files);
  let changedFiles = 0;
  let changedNodes = 0;
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true);
    const edits = gatherReplacements(source, fromName, toName);
    if (edits.length === 0) continue;
    changedFiles += 1;
    changedNodes += edits.length;
    if (!dryRun) {
      const next = applyEdits(original, edits);
      fs.writeFileSync(file, next, 'utf8');
    }
  }
  return { changedFiles, changedNodes };
}

function main() {
  try {
    const { cmd, opts } = parseArgs(process.argv);
    if (!cmd || cmd === '--help' || cmd === 'help') {
      usage();
      process.exit(0);
    }
    if (cmd !== 'rename-symbol') throw new Error(`Unknown command: ${cmd}`);
    const fromName = String(opts.from || '').trim();
    const toName = String(opts.to || '').trim();
    if (!fromName || !toName) throw new Error('rename-symbol requires --from and --to');
    const base = path.resolve(process.cwd(), String(opts.path || '.'));
    const dryRun = opts['dry-run'] === true;
    const res = renameSymbol(base, fromName, toName, dryRun);
    console.log(
      `[ast-rewrite] ${dryRun ? 'DRY-RUN' : 'APPLIED'} files=${res.changedFiles} identifiers=${res.changedNodes} from=${fromName} to=${toName}`
    );
  } catch (err) {
    console.error(`[ast-rewrite] ${err.message}`);
    usage();
    process.exit(1);
  }
}

main();
