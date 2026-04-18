#!/usr/bin/env node
const { runManagedScript, formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { buildCommandRegistry } = require('../src/cli/command-registry.js');

function usage() {
  console.log('Usage:');
  console.log(`  ${formatManagedInvocation('<script-name>', ['[...args]'])}`);
  console.log('');
  console.log('Examples:');
  console.log(`  ${formatManagedInvocation('quality-gate')}`);
  console.log(`  ${formatManagedInvocation('quality-gate', ['--full', '--strict'])}`);
  console.log(`  ${formatManagedInvocation('eoc-bridge', ['--packet', 'packet.json'])}`);
}

function main() {
  const scriptName = process.argv[2];
  if (!scriptName || scriptName === '--help' || scriptName === '-h') {
    usage();
    process.exit(scriptName ? 0 : 1);
  }
  const registry = buildCommandRegistry(process.cwd());
  const known = new Set(registry.map((item) => item.script));
  if (!known.has(String(scriptName).replace(/\.js$/i, ''))) {
    console.error(`Unknown managed script: ${scriptName}`);
    console.error('Run `node scripts/command-registry.js --public` to list supported commands.');
    process.exit(1);
  }
  const result = runManagedScript(scriptName, process.argv.slice(3), { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  process.exit(typeof result.status === 'number' ? result.status : 1);
}

main();
