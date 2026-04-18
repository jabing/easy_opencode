#!/usr/bin/env node
const path = require('path');
const { detectProjectProfile } = require('../src/core/project-profile.js');
const { analyzeProjectStructure, writeProjectStructure } = require('../src/core/project/structure.js');
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
    if (!next || next.startsWith('--')) {
      opts[key] = true;
      continue;
    }
    opts[key] = next;
    i += 1;
  }
  return opts;
}

function runAnalyzeProjectStructure(root = process.cwd()) {
  const repoRoot = path.resolve(root);
  const profile = detectProjectProfile(repoRoot);
  const structure = analyzeProjectStructure(repoRoot, profile.runtime || 'node');
  const outputPath = writeProjectStructure(repoRoot, structure);
  const payload = { ...structure, output_path: path.relative(repoRoot, outputPath).replace(/\\/g, '/') };
  assertNamedContract('analyze-project-structure', payload);
  return payload;
}

function main(argv = process.argv) {
  if (process.env.EOC_LEGACY_WRAPPER !== '1') {
    require('./internal-tools.js').main([argv[0], argv[1], 'analyze-project-structure', ...argv.slice(2)]);
    return;
  }
  const opts = parseArgs(argv);
  const root = path.resolve(opts.root || process.cwd());
  const payload = runAnalyzeProjectStructure(root);
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`[analyze-project-structure] wrote ${payload.output_path}`);
}

module.exports = { main, runAnalyzeProjectStructure };

try {
  if (require.main === module) main();
} catch (error) {
  console.error(`[analyze-project-structure] ${error.message}`);
  process.exit(1);
}
