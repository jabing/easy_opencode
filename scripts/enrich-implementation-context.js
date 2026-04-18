#!/usr/bin/env node
const path = require('path');
const { buildImplementationContext } = require('../src/core/implementation/context.js');
const { assertNamedContract } = require('../src/shared/contracts.js');

function runEnrichImplementationContext(rootArg = process.cwd()) {
  const root = path.resolve(rootArg);
  const context = buildImplementationContext({ rootDir: root, objective: 'enrich implementation context' });
  const payload = { root, context };
  assertNamedContract('implementation-context-envelope', payload);
  return payload;
}

function main(argv = process.argv) {
  const payload = runEnrichImplementationContext(argv[2] || process.cwd());
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

module.exports = { main, runEnrichImplementationContext };

try {
  if (require.main === module) {
  if (process.env.EOC_LEGACY_WRAPPER !== '1') require('./internal-tools.js').main([process.argv[0], process.argv[1], 'enrich-implementation-context', ...process.argv.slice(2)]);
  else main();
}
} catch (error) {
  console.error(`[enrich-implementation-context] ${error.message}`);
  process.exit(1);
}
