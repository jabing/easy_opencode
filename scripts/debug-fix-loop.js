#!/usr/bin/env node
const path = require('path');
const { runDebugFixLoop, inferInitialVerifyCommands } = require('../src/core/repair/debug-fix-loop.js');
const { assertNamedContract } = require('../src/shared/contracts.js');

function parseArgs(argv) {
  const opts = { _: [], verify: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (key === 'verify') {
      if (!next || next.startsWith('--')) throw new Error('Missing value for --verify');
      opts.verify.push(next);
      i += 1;
      continue;
    }
    if (!next || next.startsWith('--')) {
      opts[key] = true;
      continue;
    }
    opts[key] = next;
    i += 1;
  }
  return opts;
}

function runDebugLoopCommand(opts) {
  const repoRoot = path.resolve(opts.root || process.cwd());
  const assetRoot = path.resolve(__dirname, '..');
  const featureName = String(opts.feature || opts.name || opts._[0] || '').trim();
  if (!featureName) throw new Error('Feature name is required');
  const verifyCommands = opts.verify.length ? opts.verify : inferInitialVerifyCommands(repoRoot);
  if (!verifyCommands.length) throw new Error('At least one --verify command is required');
  const result = runDebugFixLoop({
    repoRoot,
    assetRoot,
    featureName,
    subject: opts.subject || featureName,
    verifyCommands,
  });
  assertNamedContract('debug-fix-loop', result);
  return result;
}

function main(argv = process.argv) {
  const opts = parseArgs(argv);
  const result = runDebugLoopCommand(opts);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(1);
}

module.exports = { main, parseArgs, runDebugLoopCommand };

try {
  if (require.main === module) {
  if (process.env.EOC_LEGACY_WRAPPER !== '1') require('./internal-tools.js').main([process.argv[0], process.argv[1], 'debug-fix-loop', ...process.argv.slice(2)]);
  else main();
}
} catch (error) {
  console.error(`[debug-fix-loop] ${error.message}`);
  process.exit(1);
}
