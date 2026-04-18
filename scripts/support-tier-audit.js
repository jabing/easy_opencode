#!/usr/bin/env node
const path = require('path');
const { buildSupportTierReport } = require('../src/core/support-tiers/report.js');

function parseArgs(argv) {
  const opts = { _: [] };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) opts[key] = true;
    else {
      opts[key] = next;
      index += 1;
    }
  }
  return opts;
}

function main(argv = process.argv) {
  const opts = parseArgs(argv);
  const root = path.resolve(String(opts.root || process.cwd()));
  const report = buildSupportTierReport(root);

  if (opts.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const feature = report.domains.feature_generation;
  const refactor = report.domains.semantic_refactor;
  const wiring = report.domains.framework_wiring;
  console.log(`[support-tier-audit] feature_generation=${feature.support_tier} providers=${feature.provider_count} runtimes=${feature.runtimes.join(',')}`);
  console.log(`[support-tier-audit] semantic_refactor=${refactor.support_tier} languages=${refactor.accepted_languages.join(',')} providers=${refactor.accepted_provider_ids.join(',')}`);
  console.log(`[support-tier-audit] framework_wiring=${wiring.support_tier} skills=${wiring.skills.length} frameworks=${wiring.frameworks.join(',')}`);
}

module.exports = { main, parseArgs };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[support-tier-audit] ${error.message}`);
    process.exit(1);
  }
}
