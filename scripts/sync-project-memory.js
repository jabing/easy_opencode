#!/usr/bin/env node
const path = require('path');
const { detectProjectProfile } = require('../src/core/project-profile.js');
const { readOrAnalyzeProjectStructure } = require('../src/core/project/structure.js');
const { readOrInferProjectMemory } = require('../src/core/project/memory.js');
const { assertNamedContract } = require('../src/shared/contracts.js');

function runSyncProjectMemory(rootArg = process.cwd()) {
  const root = path.resolve(rootArg);
  const profile = detectProjectProfile(root);
  const structure = readOrAnalyzeProjectStructure(root, profile.runtime, { persist: true });
  const memory = readOrInferProjectMemory(root, profile, structure, { refresh: true, persist: true });
  const payload = { root, memory };
  assertNamedContract('project-memory-sync', payload);
  return payload;
}

function main(argv = process.argv) {
  const payload = runSyncProjectMemory(argv[2] || process.cwd());
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

module.exports = { main, runSyncProjectMemory };

try {
  if (require.main === module) {
  if (process.env.EOC_LEGACY_WRAPPER !== '1') require('./internal-tools.js').main([process.argv[0], process.argv[1], 'sync-project-memory', ...process.argv.slice(2)]);
  else main();
}
} catch (error) {
  console.error(`[sync-project-memory] ${error.message}`);
  process.exit(1);
}
