#!/usr/bin/env node
const path = require('path');
const { createCheckScaffold } = require('../src/cli/scaffold/check.js');
const { assertNamedContract } = require('../src/shared/contracts.js');

function parseArgs(argv) {
  const positionals = [];
  const flags = { root: process.cwd() };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--root') flags.root = path.resolve(String(argv[++index] || process.cwd()));
    else positionals.push(token);
  }
  return { positionals, flags };
}

function usage() {
  console.log('Usage: node scripts/create-check.js <name> [summary] [--root <repo>]');
}

function main() {
  const { positionals, flags } = parseArgs(process.argv);
  const name = String(positionals[0] || '').trim();
  if (!name) {
    usage();
    process.exit(1);
  }
  const summary = String(positionals.slice(1).join(' ') || `Scaffold check ${name}.`).trim();
  const result = createCheckScaffold(flags.root, { name, summary });
  const payload = { ok: true, files: result.files.map((file) => path.relative(flags.root, file)) };
  assertNamedContract('scaffold-output', payload);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main();
