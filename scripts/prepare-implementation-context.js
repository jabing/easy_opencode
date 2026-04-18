#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { buildImplementationContext } = require('../src/core/implementation/context.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { splitCsv, detectProjectProfile } = require('../src/core/project-profile.js');
const { deriveCoderPolicy, derivePolicyInput } = require('../src/core/implementation/coder-policy.js');
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
    } else {
      opts[key] = next;
      i += 1;
    }
  }
  return opts;
}

function usage() {
  console.log('Usage:');
  console.log(`  ${formatManagedInvocation('prepare-implementation-context', ['--objective', '"implement auth refresh flow"', '--targets', 'src/auth.ts,src/auth.test.ts', '--out', '.opencode/implementation/auth.json'])}`);
  console.log(`  ${formatManagedInvocation('prepare-implementation-context', ['--objective', '"fix order total bug"', '--targets', 'src/orders/service.ts', '--strategy-bias', 'conservative', '--json'])}`);
  console.log(`  ${formatManagedInvocation('prepare-implementation-context', ['--objective', '"add endpoint"', '--skill', 'add-express-route', '--task-family', 'endpoint', '--benchmark-aware', '--json'])}`);
}

function buildPreparedContext(opts) {
  const objective = String(opts.objective || opts._[0] || '').trim();
  if (!objective) throw new Error('missing objective. Pass --objective "..."');
  const rootDir = path.resolve(String(opts.root || process.cwd()));
  const profile = detectProjectProfile(rootDir);
  const policy = deriveCoderPolicy(derivePolicyInput(rootDir, {
    objective,
    runtime: profile.runtime,
    framework: profile.framework,
    skill: opts.skill,
    task_family: opts['task-family'],
    benchmark_aware: opts['benchmark-aware'] === true,
    benchmark_limit: opts['benchmark-limit'],
    strategy_bias: opts['strategy-bias'],
    context_scope: opts['context-scope'],
    target_budget: opts['target-budget'],
    related_test_budget: opts['related-test-budget'],
    ast_edit_mode: opts['ast-edit-mode'],
    ast_max_files: opts['ast-max-files'],
    ast_max_identifiers: opts['ast-max-identifiers'],
  }));
  const context = buildImplementationContext({
    rootDir,
    objective,
    targets: splitCsv(opts.targets || opts.target || ''),
    mode: String(opts.mode || 'auto'),
    policy,
  });
  assertNamedContract('implementation-context', context);
  return context;
}

function main(argv = process.argv) {
  try {
    const opts = parseArgs(argv);
    if (opts.help || opts.h) {
      usage();
      process.exit(0);
    }
    const context = buildPreparedContext(opts);
    const text = JSON.stringify(context, null, 2) + '\n';
    if (opts.out) {
      const outPath = path.resolve(process.cwd(), String(opts.out));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, text, 'utf8');
      console.log(`[prepare-implementation-context] wrote ${outPath}`);
    }
    if (!opts.out || opts.json) process.stdout.write(text);
  } catch (error) {
    console.error(`[prepare-implementation-context] ${error.message}`);
    usage();
    process.exit(1);
  }
}

module.exports = { main, parseArgs, buildPreparedContext };

if (require.main === module) {
  if (process.env.EOC_LEGACY_WRAPPER !== '1') require('./internal-tools.js').main([process.argv[0], process.argv[1], 'prepare-implementation-context', ...process.argv.slice(2)]);
  else main();
}
