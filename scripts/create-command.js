#!/usr/bin/env node
const path = require('path');
const { createCommandScaffold } = require('../src/cli/scaffold/command.js');
const { assertNamedContract } = require('../src/shared/contracts.js');

function parseArgs(argv) {
  const positionals = [];
  const flags = { root: process.cwd(), summary: null };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--root') flags.root = path.resolve(String(argv[++index] || process.cwd()));
    else if (token === '--summary') flags.summary = String(argv[++index] || '').trim() || null;
    else positionals.push(token);
  }
  return { positionals, flags };
}

function usage() {
  console.log('Usage: node scripts/create-command.js <command-name> [summary] [--summary <text>] [--root <repo>]');
}

function main() {
  const { positionals, flags } = parseArgs(process.argv);
  const commandName = String(positionals[0] || '').trim();
  if (!commandName) {
    usage();
    process.exit(1);
  }
  const summary = String(flags.summary || positionals.slice(1).join(' ') || `Run ${commandName} workflow.`).trim();
  const result = createCommandScaffold(flags.root, { name: commandName, summary });
  const payload = { ok: true, command: result.command, files: result.files.map((file) => path.relative(flags.root, file)) };
  assertNamedContract('scaffold-output', payload);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main();
