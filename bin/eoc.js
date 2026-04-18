#!/usr/bin/env node
const { runManagedScript } = require('../src/cli/runtime-paths.js');
const { getMode, listModes, setMode } = require('../src/control-plane/product/modes.js');
const { buildMainCommandPlan, listMainCommands } = require('../src/control-plane/product/main-commands.js');
const path = require('path');
const { buildCommandRegistry } = require('../src/cli/command-registry.js');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
function printUsage() {
  console.log('Easy OpenCode main commands');
  console.log('');
  console.log('Usage:');
  console.log('  eoc <plan|implement|test|review|ship|doctor> [...args]');
  console.log('  eoc mode');
  console.log('  eoc mode set <solo|team|platform>');
  console.log('  eoc commands [--public|--all]');
  console.log('');
  console.log('Modes:');
  for (const mode of listModes()) console.log(`  - ${mode.id}: ${mode.description}`);
}
function printCommands(options = {}) {
  const showAll = options.showAll === true;
  const showPublic = options.showPublic === true;
  console.log('Main commands:');
  for (const item of listMainCommands()) console.log(`  - ${item.id}: ${item.description}`);
  if (!showAll && !showPublic) return;
  const entries = buildCommandRegistry(PACKAGE_ROOT).filter((item) => {
    if (showAll) return true;
    return item.surface === 'public' && item.tier !== 'internal';
  });
  console.log('');
  console.log(showAll ? 'All managed commands:' : 'Public managed commands:');
  for (const entry of entries) {
    const lifecycle = entry.lifecycle === 'stable' ? '' : ` ${entry.lifecycle}`;
    console.log(`  - ${entry.script} [${entry.tier}${lifecycle}]${entry.supports_json ? ' --json' : ''}: ${entry.summary}`);
  }
}
function printMode(mode) { console.log(`Mode: ${mode.id}`); console.log(`Defaults: quality=${mode.defaults.quality_mode} release=${mode.defaults.release_policy} review_quality_gate=${mode.defaults.review_with_quality_gate}`); }
function runSingle(script, args) { const result = runManagedScript(script, args, { stdio: 'inherit' }); if (result.error) throw result.error; return typeof result.status === 'number' ? result.status : 1; }
function runDoctor(plan) { let finalCode = 0; for (const run of plan.runs) { const code = runSingle(run.script, run.args); if (code !== 0) finalCode = code; } return finalCode; }
function main() {
  const argv = process.argv.slice(2); const command = argv[0];
  if (!command || command === '--help' || command === '-h' || command === 'help') { printUsage(); process.exit(command ? 0 : 1); }
  if (command === 'commands') {
    const flags = new Set(argv.slice(1));
    printCommands({ showAll: flags.has('--all'), showPublic: flags.has('--public') });
    process.exit(0);
  }
  if (command === 'mode') { const sub = argv[1] || 'get'; if (sub === 'get') { printMode(getMode(process.cwd())); process.exit(0); } if (sub === 'set') { const targetMode = argv[2]; if (!targetMode) { console.error('Missing mode. Expected: solo | team | platform'); process.exit(1); } const mode = setMode(process.cwd(), targetMode); printMode(mode); process.exit(0); } console.error(`Unknown mode subcommand: ${sub}`); process.exit(1); }
  const plan = buildMainCommandPlan(command, argv.slice(1), { rootDir: process.cwd() });
  const exitCode = plan.command === 'doctor' ? runDoctor(plan) : runSingle(plan.runs[0].script, plan.runs[0].args);
  process.exit(exitCode);
}
main();
