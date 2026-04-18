#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { buildCommandRegistry } = require('../src/cli/command-registry.js');

const INTERNAL_DOMAIN_RECOMMENDATIONS = {
  project: ['analyze-project-structure', 'sync-project-memory'],
  context: ['prepare-implementation-context', 'enrich-implementation-context'],
  debug: ['debug-fix-loop'],
  routing: ['model-route'],
  orchestrator: ['orchestrator-state'],
  benchmark: ['benchmark-feedback'],
  skills: ['capability-registry', 'skill-runner'],
  release: ['release-override', 'safe-apply'],
};

function isThinWrapper(scriptPath) {
  const text = fs.readFileSync(scriptPath, 'utf8');
  return text.includes("process.env.EOC_LEGACY_WRAPPER !== '1'") && text.includes("require('./internal-tools.js').main(");
}

function buildAudit(rootDir = process.cwd()) {
  const entries = buildCommandRegistry(rootDir);
  const scriptsDir = path.join(rootDir, 'scripts');
  const deletion_candidates = entries
    .filter((entry) => entry.lifecycle === 'deprecated' && entry.replacement === 'internal-tools')
    .map((entry) => ({
      script: entry.script,
      replacement: entry.replacement,
      thin_wrapper: isThinWrapper(path.join(scriptsDir, `${entry.script}.js`)),
      can_delete_after_alias_migration: isThinWrapper(path.join(scriptsDir, `${entry.script}.js`)),
    }))
    .sort((a, b) => a.script.localeCompare(b.script));
  const recommended_internal_merges = Object.entries(INTERNAL_DOMAIN_RECOMMENDATIONS).map(([domain, commands]) => ({ domain, commands }));
  return {
    generated_at: new Date().toISOString(),
    deletion_candidates,
    recommended_internal_merges,
    summary: {
      deletion_candidate_count: deletion_candidates.length,
      thin_wrapper_count: deletion_candidates.filter((item) => item.thin_wrapper).length,
      domain_count: recommended_internal_merges.length,
    },
  };
}

function writeMarkdown(report) {
  const lines = [
    '# Historical debt cleanup audit',
    '',
    `Generated at: ${report.generated_at}`,
    '',
    '## Deletion candidates',
    '',
  ];
  for (const item of report.deletion_candidates) {
    lines.push(`- ${item.script}: replacement=${item.replacement}, thin_wrapper=${item.thin_wrapper ? 'yes' : 'no'}, can_delete_after_alias_migration=${item.can_delete_after_alias_migration ? 'yes' : 'no'}`);
  }
  lines.push('', '## Recommended internal-tools domains', '');
  for (const item of report.recommended_internal_merges) lines.push(`- ${item.domain}: ${item.commands.join(', ')}`);
  return `${lines.join('\n')}\n`;
}

function main(argv = process.argv) {
  const json = argv.includes('--json');
  const write = argv.includes('--write');
  const report = buildAudit(process.cwd());
  if (write) {
    const outPath = path.join(process.cwd(), 'docs', 'historical-debt-cleanup.md');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, writeMarkdown(report), 'utf8');
    if (!json) console.log(`[historical-debt-audit] wrote ${path.relative(process.cwd(), outPath)}`);
  }
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
  else process.stdout.write(writeMarkdown(report));
}

module.exports = { buildAudit, writeMarkdown, isThinWrapper, INTERNAL_DOMAIN_RECOMMENDATIONS, main };

if (require.main === module) main();
