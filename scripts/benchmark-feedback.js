#!/usr/bin/env node
const { detectProjectProfile } = require('../src/core/project-profile.js');
const { resolveTaskFamily } = require('../src/core/skills/taxonomy.js');
const { readLatestPlanId, readPlanById, buildRecovery } = require('../src/control-plane/orchestrator/memory.js');
const { assessBenchmarkFeedback } = require('../src/core/benchmark/feedback.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { assertNamedContract } = require('../src/shared/contracts.js');

function parseArgs(argv) {
  const cmd = argv[2] || 'report';
  const opts = { _: [] };
  for (let i = 3; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) { opts._.push(token); continue; }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { opts[key] = true; continue; }
    opts[key] = next; i += 1;
  }
  return { cmd, opts };
}

function usage() {
  console.log('Usage:');
  console.log(`  ${formatManagedInvocation('benchmark-feedback', ['report', '--json'])}`);
  console.log(`  ${formatManagedInvocation('benchmark-feedback', ['report', '--policy', 'production', '--json'])}`);
  console.log(`  ${formatManagedInvocation('benchmark-feedback', ['report', '--skill', 'add-express-route', '--task-family', 'endpoint', '--json'])}`);
}

function buildInput(rootDir, opts) {
  const profile = detectProjectProfile(rootDir);
  const latestPlanId = opts['plan-id'] || readLatestPlanId(rootDir);
  const plan = latestPlanId ? readPlanById(rootDir, latestPlanId) : null;
  const recovery = buildRecovery(rootDir);
  return {
    objective: opts.objective || (plan ? plan.objective : null) || (recovery.active ? recovery.active.objective : null),
    runtime: opts.runtime || profile.runtime,
    framework: opts.framework || profile.framework,
    skill: opts.skill || (plan && plan.selected_skill ? plan.selected_skill.dir : null) || (recovery.active && recovery.active.selected_skill ? recovery.active.selected_skill : null),
    task_family: opts['task-family'] || opts.taskFamily || (plan && plan.selected_skill ? plan.selected_skill.task_family : null) || resolveTaskFamily(opts.skill || null),
    limit: opts.limit,
    policy: opts.policy || 'standard',
    now: opts.now || null,
  };
}

function printHuman(report) {
  console.log(`Benchmark feedback risk: ${report.risk_level} (score=${report.risk_score}, confidence=${report.confidence})`);
  console.log(`Scope: runtime=${report.scope.runtime} framework=${report.scope.framework} family=${report.scope.task_family}${report.scope.skill ? ` skill=${report.scope.skill}` : ''}`);
  console.log(`Strategy bias: ${report.strategy_bias}`);
  console.log(`Policy: ${report.policy ? report.policy.id : 'standard'}`);
  console.log(`Validation mode: ${report.recommended_validation_mode}`);
  console.log(`Recommended action: ${report.recommended_action}`);
  console.log(`Review gate required: ${report.review_gate_required ? 'yes' : 'no'}`);
  if (report.coverage) console.log(`Coverage: ${report.coverage.status} (${report.coverage.matched_count}/${report.coverage.required_count})`);
  if (report.trend_evidence) console.log(`Trend direction: ${report.trend_evidence.overall_direction}`);
  if (report.release_readiness) console.log(`Release readiness: ${report.release_readiness.status}`);
  if (report.freshness) console.log(`Benchmark freshness: ${report.freshness.status}${report.freshness.age_days !== null && report.freshness.age_days !== undefined ? ` (${report.freshness.age_days} days)` : ''}`);
  if (Array.isArray(report.reasons) && report.reasons.length > 0) {
    console.log('Signals:');
    for (const reason of report.reasons) console.log(`- ${reason}`);
  }
}

function main(argv = process.argv) {
  try {
    const { cmd, opts } = parseArgs(argv);
    const rootDir = String(opts.root || process.cwd());
    if (cmd === 'help' || cmd === '--help' || cmd === '-h') { usage(); return; }
    if (cmd !== 'report') throw new Error(`unknown command: ${cmd}`);
    const report = assessBenchmarkFeedback(rootDir, buildInput(rootDir, opts));
    if (opts.json) {
      assertNamedContract('benchmark-feedback', report);
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      printHuman(report);
    }
  } catch (error) {
    console.error(`[benchmark-feedback] ${error.message}`);
    usage();
    process.exit(1);
  }
}

module.exports = { main, parseArgs, buildInput, printHuman, usage };

if (require.main === module) {
  if (process.env.EOC_LEGACY_WRAPPER !== '1') require('./internal-tools.js').main([process.argv[0], process.argv[1], 'benchmark', 'feedback', ...process.argv.slice(2)]);
  else main();
}
