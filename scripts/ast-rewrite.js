#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
let ts = null;
try {
  ts = require('typescript');
} catch {
  ts = null;
}

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.opencode']);

function usage() {
  console.log('Usage:');
  console.log('  node scripts/ast-rewrite.js rename-at --file <path> --line <n> --col <n> --to <new> [--path <dir>] [--dry-run]');
  console.log('  node scripts/ast-rewrite.js rename-symbol --from <old> --to <new> [--path <dir>] [--dry-run]  # broad fallback');
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

function lineColToOffset(text, line1, col1) {
  const line = Math.max(1, Number(line1));
  const col = Math.max(1, Number(col1));
  const lines = text.split(/\r?\n/);
  if (line > lines.length) throw new Error(`line out of range: ${line}`);
  let offset = 0;
  for (let i = 1; i < line; i++) offset += lines[i - 1].length + 1;
  const lineText = lines[line - 1];
  if (col - 1 > lineText.length) throw new Error(`column out of range: ${col}`);
  return offset + (col - 1);
}

function createLanguageService(baseDir) {
  const files = [];
  collectFiles(baseDir, files);
  const absFiles = files.map((f) => path.resolve(f));
  const versions = new Map(absFiles.map((f) => [f, 1]));
  const content = new Map(absFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]));

  const host = {
    getCompilationSettings: () => ({
      allowJs: true,
      checkJs: false,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      skipLibCheck: true,
      noEmit: true,
    }),
    getScriptFileNames: () => absFiles,
    getScriptVersion: (fileName) => String(versions.get(path.resolve(fileName)) || 1),
    getScriptSnapshot: (fileName) => {
      const key = path.resolve(fileName);
      const text = content.has(key) ? content.get(key) : fs.existsSync(key) ? fs.readFileSync(key, 'utf8') : '';
      return ts.ScriptSnapshot.fromString(text || '');
    },
    getCurrentDirectory: () => baseDir,
    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };

  return {
    service: ts.createLanguageService(host, ts.createDocumentRegistry()),
    content,
  };
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

function renameAt(baseDir, targetFile, line, col, toName, dryRun) {
  const absTarget = path.resolve(targetFile);
  if (!fs.existsSync(absTarget)) throw new Error(`file not found: ${absTarget}`);
  const { service, content } = createLanguageService(baseDir);
  const sourceText = content.get(absTarget) || fs.readFileSync(absTarget, 'utf8');
  const pos = lineColToOffset(sourceText, line, col);
  const info = service.getRenameInfo(absTarget, pos, { allowRenameOfImportPath: false });
  if (!info || !info.canRename) {
    throw new Error(`cannot rename at ${targetFile}:${line}:${col} (${(info && info.localizedErrorMessage) || 'unknown'})`);
  }
  const locations = service.findRenameLocations(absTarget, pos, false, false, false) || [];
  if (locations.length === 0) throw new Error('no rename locations found');

  const editsByFile = new Map();
  for (const loc of locations) {
    const f = path.resolve(loc.fileName);
    const arr = editsByFile.get(f) || [];
    arr.push({
      start: loc.textSpan.start,
      end: loc.textSpan.start + loc.textSpan.length,
      text: toName,
    });
    editsByFile.set(f, arr);
  }

  let changedFiles = 0;
  let changedNodes = 0;
  for (const [file, edits] of editsByFile.entries()) {
    const original = content.get(file) || fs.readFileSync(file, 'utf8');
    changedFiles += 1;
    changedNodes += edits.length;
    if (!dryRun) {
      const next = applyEdits(original, edits);
      fs.writeFileSync(file, next, 'utf8');
    }
  }
  return { changedFiles, changedNodes, symbol: info.displayName || '' };
}

function main() {
  try {
    if (!ts) {
      throw new Error('typescript dependency is required for ast-rewrite. Run `npm install` first.');
    }
    const { cmd, opts } = parseArgs(process.argv);
    if (!cmd || cmd === '--help' || cmd === 'help') {
      usage();
      process.exit(0);
    }
    const base = path.resolve(process.cwd(), String(opts.path || '.'));
    const dryRun = opts['dry-run'] === true;
    if (cmd === 'rename-at') {
      const file = String(opts.file || '').trim();
      const toName = String(opts.to || '').trim();
      const line = Number(opts.line);
      const col = Number(opts.col);
      if (!file || !toName || !Number.isInteger(line) || !Number.isInteger(col)) {
        throw new Error('rename-at requires --file --line --col --to');
      }
      const res = renameAt(base, file, line, col, toName, dryRun);
      console.log(`[ast-rewrite] ${dryRun ? 'DRY-RUN' : 'APPLIED'} files=${res.changedFiles} identifiers=${res.changedNodes} symbol=${res.symbol} to=${toName}`);
      return;
    }
    if (cmd === 'rename-symbol') {
      const fromName = String(opts.from || '').trim();
      const toName = String(opts.to || '').trim();
      if (!fromName || !toName) throw new Error('rename-symbol requires --from and --to');
      const res = renameSymbol(base, fromName, toName, dryRun);
      console.log(
        `[ast-rewrite] ${dryRun ? 'DRY-RUN' : 'APPLIED'} files=${res.changedFiles} identifiers=${res.changedNodes} from=${fromName} to=${toName}`
      );
      return;
    }
    throw new Error(`Unknown command: ${cmd}`);
  } catch (err) {
    console.error(`[ast-rewrite] ${err.message}`);
    usage();
    process.exit(1);
  }
}

module.exports = {
  renameAt,
  renameSymbol,
};

if (require.main === module) {
  main();
}
