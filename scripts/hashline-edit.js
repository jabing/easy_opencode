#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');

function usage() {
  console.log('Usage:');
  console.log(`  ${formatManagedInvocation('hashline-edit', ['annotate', '--file', '<path>'])}`);
  console.log(`  ${formatManagedInvocation('hashline-edit', ['apply', '--file', '<path>', '--patch', '<json>'])}`);
  console.log('');
  console.log('Patch JSON format:');
  console.log('{ "edits": [ { "line": 12, "hash": "abc123ef", "text": "new line content" } ] }');
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

function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

function shortHash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 8);
}

function annotate(filePath) {
  const lines = readLines(filePath);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const tag = shortHash(`${lineNo}|${lines[i]}`);
    console.log(`${lineNo}#${tag}| ${lines[i]}`);
  }
}

function applyPatch(filePath, patchPath) {
  const absPatch = path.resolve(process.cwd(), patchPath);
  if (!fs.existsSync(absPatch)) throw new Error(`Patch file not found: ${absPatch}`);
  const patch = JSON.parse(fs.readFileSync(absPatch, 'utf8'));
  const edits = Array.isArray(patch.edits) ? patch.edits : [];
  if (edits.length === 0) throw new Error('Patch must contain non-empty edits array.');

  const lines = readLines(filePath);
  const byLine = new Map();
  for (const edit of edits) {
    const line = Number(edit.line);
    const hash = String(edit.hash || '').trim();
    if (!Number.isInteger(line) || line < 1 || line > lines.length) {
      throw new Error(`Invalid line in patch: ${edit.line}`);
    }
    if (!hash) throw new Error(`Missing hash for line ${line}`);
    if (byLine.has(line)) throw new Error(`Duplicate edit for line ${line}`);
    byLine.set(line, {
      line,
      hash,
      text: String(edit.text ?? ''),
    });
  }

  for (const edit of byLine.values()) {
    const actual = shortHash(`${edit.line}|${lines[edit.line - 1]}`);
    if (actual !== edit.hash) {
      throw new Error(
        `Hash mismatch at line ${edit.line}. expected=${edit.hash} actual=${actual}. File changed; re-annotate before applying.`
      );
    }
  }

  for (const edit of byLine.values()) {
    lines[edit.line - 1] = edit.text;
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log(`Applied ${byLine.size} guarded edits to ${filePath}`);
}

function main() {
  try {
    const { cmd, opts } = parseArgs(process.argv);
    if (!cmd || cmd === '--help' || cmd === 'help') {
      usage();
      process.exit(0);
    }
    const file = opts.file ? path.resolve(process.cwd(), String(opts.file)) : '';
    if (!file || !fs.existsSync(file)) throw new Error(`File not found: ${file || '(missing --file)'}`);

    if (cmd === 'annotate') {
      annotate(file);
      return;
    }
    if (cmd === 'apply') {
      if (!opts.patch) throw new Error('Missing --patch for apply.');
      applyPatch(file, String(opts.patch));
      return;
    }
    throw new Error(`Unknown command: ${cmd}`);
  } catch (err) {
    console.error(`[hashline-edit] ${err.message}`);
    usage();
    process.exit(1);
  }
}

main();
