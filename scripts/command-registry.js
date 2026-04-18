#!/usr/bin/env node
const path = require('path');
const { buildCommandRegistry, buildMainEntryRegistry, validateCommandRegistry, DEPRECATION_POLICY } = require('../src/cli/command-registry.js');
const { assertNamedContract } = require('../src/shared/contracts.js');

function parseArgs(argv) {
  const positionals = [];
  const flags = { json: false, public: false, internal: false, validate: false, main: false, tier: null, root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') flags.json = true;
    else if (token === '--public') flags.public = true;
    else if (token === '--internal') flags.internal = true;
    else if (token === '--validate') flags.validate = true;
    else if (token === '--main') flags.main = true;
    else if (token === '--tier') flags.tier = String(argv[++index] || '').trim() || null;
    else if (token === '--root') flags.root = path.resolve(String(argv[++index] || process.cwd()));
    else positionals.push(token);
  }
  return { positionals, flags };
}

function usage() {
  console.log('Usage: node scripts/command-registry.js [list|validate|compatibility] [--json] [--public|--internal] [--tier <core|governance|internal>] [--main]');
}

function filterEntries(entries, flags) {
  let results = entries.slice();
  if (flags.public) results = results.filter((entry) => entry.surface === 'public');
  if (flags.internal) results = results.filter((entry) => entry.surface !== 'public');
  if (flags.tier) results = results.filter((entry) => entry.tier === flags.tier);
  return results;
}

function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const command = positionals[0] || (flags.validate ? 'validate' : 'list');
  if (command === '--help' || command === '-h' || command === 'help') {
    usage();
    process.exit(0);
  }
  if (command === 'compatibility') {
    const payload = {
      schema_name: 'command_compatibility_policy',
      schema_version: '1.0',
      policy: DEPRECATION_POLICY,
      entries: buildCommandRegistry(flags.root).map((entry) => ({ script: entry.script, lifecycle: entry.lifecycle, compatibility: entry.compatibility, replacement: entry.replacement })),
    };
    if (flags.json) {
      assertNamedContract('command-compatibility', payload);
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      console.log('[command-registry] compatibility policy');
      for (const entry of payload.entries) console.log(`- ${entry.script}: lifecycle=${entry.lifecycle} compatibility=${entry.compatibility}${entry.replacement ? ` replacement=${entry.replacement}` : ''}`);
    }
    process.exit(0);
  }
  if (command === 'validate') {
    const result = validateCommandRegistry(flags.root);
    if (flags.json) {
      assertNamedContract('command-registry-validation', result);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else if (result.ok) {
      console.log(`[command-registry] ok entries=${result.entries.length} main=${result.main_entries.length}`);
    } else {
      for (const error of result.errors) console.error(`[command-registry] ERROR ${error}`);
    }
    process.exit(result.ok ? 0 : 1);
  }
  if (command !== 'list') {
    usage();
    process.exit(1);
  }
  const entries = filterEntries(buildCommandRegistry(flags.root), flags);
  const payload = flags.main ? buildMainEntryRegistry() : entries;
  if (flags.json) {
    const report = { schema_name: 'command_registry', schema_version: '1.0', entries: payload };
    assertNamedContract('command-registry', report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(0);
  }
  const heading = flags.main ? 'Main commands' : 'Managed commands';
  console.log(heading);
  for (const entry of payload) {
    const aliases = entry.aliases && entry.aliases.length ? ` aliases=${entry.aliases.join(',')}` : '';
    const surface = entry.surface ? ` ${entry.surface}` : '';
    const tier = entry.tier ? ` ${entry.tier}` : '';
    const name = entry.script || entry.command;
    console.log(`- ${name}:${tier}${surface}${aliases}`);
  }
}

main();
