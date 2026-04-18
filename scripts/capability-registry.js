#!/usr/bin/env node
const path = require('path');
const { buildCapabilityRegistry, writeCapabilityRegistry } = require('../src/core/capabilities/registry.js');
const { assertNamedContract } = require('../src/shared/contracts.js');

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) opts[key] = true;
    else {
      opts[key] = next;
      i += 1;
    }
  }
  return opts;
}

function main(argv = process.argv) {
  const opts = parseArgs(argv);
  const root = path.resolve(String(opts.root || process.cwd()));
  const checkOnly = opts['no-write'] === true;
  const json = opts.json === true;
  const out = String(opts.write || path.join('capabilities', 'registry.json'));

  const registry = buildCapabilityRegistry(root);
  if (!checkOnly) writeCapabilityRegistry(root, out);

  if (json) {
    assertNamedContract('capability-registry', registry);
    console.log(JSON.stringify(registry, null, 2));
    return;
  }

  console.log(`[capability-registry] total=${registry.counts.total} agents=${registry.counts.agents} skills=${registry.counts.skills} scripts=${registry.counts.scripts} aliases=${registry.counts.aliases} tier1=${registry.counts.by_support_tier?.tier1 || 0} tier2=${registry.counts.by_support_tier?.tier2 || 0}`);
  if (!checkOnly) console.log(`[capability-registry] wrote ${path.relative(root, path.resolve(root, out))}`);
}

module.exports = { main, parseArgs };

if (require.main === module) {
  if (process.env.EOC_LEGACY_WRAPPER !== '1') require('./internal-tools.js').main([process.argv[0], process.argv[1], 'capability-registry', ...process.argv.slice(2)]);
  else main();
}
