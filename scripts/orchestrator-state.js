#!/usr/bin/env node
const { buildRecovery, writeState } = require('../src/control-plane/orchestrator/memory.js');
const { appendEvent } = require('../src/control-plane/observability/index.js');
const { clearActiveRunRecord } = require('../src/control-plane/kernel/run-store.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { assertNamedContract } = require('../src/shared/contracts.js');

function parseArgs(argv) {
  const cmd = argv[2] || 'recover';
  const opts = { _: [] };
  for (let i = 3; i < argv.length; i++) {
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
  return { cmd, opts };
}

function usage() {
  console.log('Usage:');
  console.log(`  ${formatManagedInvocation('orchestrator-state', ['recover', '--json'])}`);
  console.log(`  ${formatManagedInvocation('orchestrator-state', ['status'])}`);
  console.log(`  ${formatManagedInvocation('orchestrator-state', ['clear'])}`);
  console.log(`  ${formatManagedInvocation('safe-apply', ['status'])}`);
}

function printRecovery(recovery) {
  console.log(`Recoverable state: ${recovery.has_recoverable_state ? 'yes' : 'no'}`);
  console.log(`Active flow: ${recovery.active_flow || 'none'}`);
  if (!recovery.has_recoverable_state || !recovery.active) return;
  console.log(`Objective: ${recovery.active.objective || '(unknown)'}`);
  if (recovery.active.plan_id) console.log(`Plan: ${recovery.active.plan_id}`);
  if (recovery.active.coder_run_id) console.log(`Coder loop: ${recovery.active.coder_run_id}`);
  if (recovery.active.eoc_run_id) console.log(`EOC run: ${recovery.active.eoc_run_id}`);
  if (recovery.active.gate) console.log(`Gate: ${recovery.active.gate}`);
  console.log(`Status: ${recovery.active.status || 'unknown'}`);
  if (typeof recovery.active.failed_count === 'number') console.log(`Failed items: ${recovery.active.failed_count}`);
  if (typeof recovery.active.round_count === 'number') console.log(`Rounds: ${recovery.active.round_count}`);
  if (recovery.recovery_assessment) {
    console.log(`Resume confidence: ${recovery.recovery_assessment.confidence_score}`);
    console.log(`Recommended action: ${recovery.recovery_assessment.recommended_action}`);
    if (Array.isArray(recovery.recovery_assessment.reasons) && recovery.recovery_assessment.reasons.length > 0) {
      console.log('Recovery warnings:');
      for (const item of recovery.recovery_assessment.reasons) console.log(`- ${item}`);
    }
    if (recovery.recovery_assessment.snapshot_id) console.log(`Snapshot: ${recovery.recovery_assessment.snapshot_id}`);
  }
  if (recovery.benchmark_feedback) {
    console.log(`Benchmark risk: ${recovery.benchmark_feedback.risk_level} (score=${recovery.benchmark_feedback.risk_score}, confidence=${recovery.benchmark_feedback.confidence})`);
    console.log(`Strategy bias: ${recovery.benchmark_feedback.strategy_bias}`);
    console.log(`Validation mode: ${recovery.benchmark_feedback.recommended_validation_mode}`);
    if (Array.isArray(recovery.benchmark_feedback.reasons) && recovery.benchmark_feedback.reasons.length > 0) {
      console.log('Benchmark signals:');
      for (const item of recovery.benchmark_feedback.reasons.slice(0, 6)) console.log(`- ${item}`);
    }
  }
  if (Array.isArray(recovery.commands) && recovery.commands.length > 0) {
    console.log('Suggested commands:');
    for (const command of recovery.commands) console.log(`- ${command}`);
  }
}

function main(argv = process.argv) {
  try {
    const { cmd, opts } = parseArgs(argv);
    const rootDir = String(opts.root || process.cwd());
    if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
      usage();
      process.exit(0);
    }
    if (cmd === 'clear') {
      writeState(rootDir, { active_flow: null, latest_ids: {}, active: null });
      clearActiveRunRecord(rootDir);
      console.log('[orchestrator-state] cleared');
      return;
    }
    if (cmd === 'recover' || cmd === 'status') {
      const recovery = buildRecovery(rootDir);
      appendEvent(rootDir, 'orchestrator.recovery.checked', {
        flow: recovery.active_flow || 'none',
        status: recovery.has_recoverable_state ? 'available' : 'empty',
        recommended_action: recovery.recovery_assessment ? recovery.recovery_assessment.recommended_action : null,
        confidence_score: recovery.recovery_assessment ? recovery.recovery_assessment.confidence_score : null,
        objective: recovery.active ? recovery.active.objective || null : null,
        benchmark_risk_level: recovery.benchmark_feedback ? recovery.benchmark_feedback.risk_level : null,
        benchmark_strategy_bias: recovery.benchmark_feedback ? recovery.benchmark_feedback.strategy_bias : null,
      });
      if (opts.json) {
        assertNamedContract('orchestrator-state', recovery);
        process.stdout.write(JSON.stringify(recovery, null, 2) + '\n');
      } else {
        printRecovery(recovery);
      }
      return;
    }
    throw new Error(`unknown command: ${cmd}`);
  } catch (error) {
    console.error(`[orchestrator-state] ${error.message}`);
    usage();
    process.exit(1);
  }
}

module.exports = { main, parseArgs, usage, printRecovery };

if (require.main === module) {
  if (process.env.EOC_LEGACY_WRAPPER !== '1') require('./internal-tools.js').main([process.argv[0], process.argv[1], 'orchestrator', 'state', ...process.argv.slice(2)]);
  else main();
}
