#!/usr/bin/env node
const path = require('path');
const { buildFeatureAcceptanceSummary } = require('../src/core/feature/acceptance.js');
const { assertNamedContract } = require('../src/shared/contracts.js');

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      opts[key] = true;
      continue;
    }
    opts[key] = next;
    i += 1;
  }
  return opts;
}

function printHuman(summary) {
  console.log(`Feature acceptance: ${summary.summary}`);
  console.log(`Features: ${summary.feature_count} | Ready: ${summary.ready_count} | Incomplete: ${summary.incomplete_count}`);
  if (summary.last_feature_generation) console.log(`Last feature: ${summary.last_feature_generation}`);
  for (const item of summary.features) {
    console.log(`\n[${item.status.toUpperCase()}] ${item.feature_name}`);
    for (const check of item.checks) {
      console.log(`- ${check.ok ? 'OK' : 'MISS'} ${check.check}: ${check.detail}`);
    }
  }
}

function main() {
  try {
    const opts = parseArgs(process.argv);
    const command = String(opts._[0] || 'report');
    if (command !== 'report') throw new Error(`unknown command: ${command}`);
    const root = path.resolve(String(opts.root || process.cwd()));
    const summary = buildFeatureAcceptanceSummary(root, opts.feature || opts['feature-name']);
    if (opts.json) {
      assertNamedContract('feature-acceptance', summary);
      process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    }
    else printHuman(summary);
  } catch (error) {
    console.error(`[feature-acceptance] ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();
