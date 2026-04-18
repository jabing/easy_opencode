#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { buildLspProductionReadinessReport } = require('../src/core/refactor/lsp-production-readiness.js');

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

function formatLanguageLine(result) {
  const status = result.claim_ready ? 'READY' : (result.validation_passed ? 'HARDENING' : 'PENDING');
  const identity = result.server_identity || 'missing';
  const command = result.server_command || 'unset';
  const discovery = result.server_discovery_mode || 'default';
  const matrix = `${Number(result.scenario_pass_count || 0)}/${Number(result.scenario_count || 0)}`;
  const reasons = Array.isArray(result.reasons) && result.reasons.length > 0 ? ` reasons=${result.reasons.join(',')}` : '';
  const blockers = Array.isArray(result.claim_blockers) && result.claim_blockers.length > 0
    ? ` blockers=${result.claim_blockers.map((entry) => entry.kind).join(',')}`
    : '';
  return `[lsp-production-readiness] ${result.language}=${status} stage=${result.readiness_stage || 'unknown'} provider=${result.provider_id} server=${command} identity=${identity} discovery=${discovery} matrix=${matrix} validation=${result.validation_passed === true ? 'pass' : (result.validation_attempted ? 'fail' : 'skipped')}${reasons}${blockers}`;
}

function main(argv = process.argv) {
  const opts = parseArgs(argv);
  const root = path.resolve(String(opts.root || process.cwd()));
  const report = buildLspProductionReadinessReport(root, {
    assumeRealServer: opts['assume-real-server'] === true,
  });
  const outputPath = opts.write
    ? path.resolve(root, String(opts.write))
    : (opts['write-default'] === true ? path.join(root, '.opencode', 'observability', 'lsp-production-readiness.json') : '');

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  }

  if (opts.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  console.log(`[lsp-production-readiness] production_claim_ready=${report.production_claim_ready} ready=${report.claimable_languages.join(',') || '-'} pending=${report.pending_languages.join(',') || '-'} blocked=${report.summary.verification_blocked_languages.join(',') || '-'} go_matrix=${report.summary.scenario_matrix.go.passed}/${report.summary.scenario_matrix.go.total} java_matrix=${report.summary.scenario_matrix.java.passed}/${report.summary.scenario_matrix.java.total}`);
  for (const language of ['go', 'java']) console.log(formatLanguageLine(report.languages[language]));
  if (outputPath) console.log(`[lsp-production-readiness] wrote ${path.relative(root, outputPath)}`);
  return report.production_claim_ready ? 0 : 1;
}

module.exports = { main, parseArgs };

if (require.main === module) {
  try {
    const code = main();
    if (code !== 0) process.exit(code);
  } catch (error) {
    console.error(`[lsp-production-readiness] ${error.message}`);
    process.exit(1);
  }
}
