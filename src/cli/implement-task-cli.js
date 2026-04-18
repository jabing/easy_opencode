#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { detectProjectProfile, splitCsv } = require('../core/project-profile.js');
const { createRun, executeRound, loadRun, loadLatestRunId, buildNextPromptText } = require('./coder-loop-cli.js');
const { rememberPlan } = require('../control-plane/orchestrator/memory.js');
const { getGitRepoState, createSnapshot } = require('../core/project/git-state.js');
const { formatManagedInvocation } = require('./runtime-paths.js');
const { appendEvent } = require('../control-plane/observability/index.js');
const { assessBenchmarkFeedback } = require('../core/benchmark/feedback.js');
const { executeImplementTaskWorkflow } = require('../control-plane/workflows/implement-task.js');
const { recommendTaskRoute } = require('../core/implementation/task-routing.js');
const { parseCliArgs } = require('../shared/cli/args.js');
const {
  nowIso,
  newPlanId,
  resolvePlanDir,
  ensureDir,
  writeJson,
  loadLatestPlanId,
  loadPlan,
  savePlan,
} = require('../core/implementation/plan-store.js');
const {
  appendUnique,
  matchSkills,
  selectSkill,
  summarizeSkillSelection,
} = require('../core/implementation/skill-selection.js');
const { deriveScaffoldPolicy } = require('../core/implementation/scaffold-policy.js');
const { runSkillScaffold } = require('../core/implementation/scaffold-runner.js');
const { buildSuggestedCommands, printPlanSummary } = require('../core/implementation/plan-renderers.js');

/** @typedef {import('../shared/cli/args.js').ParsedCliOptions} ParsedCliOptions */
/** @typedef {import('../control-plane/workflows/implement-task.js').ImplementTaskWorkflowContext} ImplementTaskWorkflowContext */
/** @typedef {ReturnType<typeof createRun>} CoderRunLite */
/** @typedef {ReturnType<typeof executeRound>} CoderRoundLite */
/** @typedef {ReturnType<typeof loadRun>} LoadedCoderRunLite */
/** @typedef {{ strategy_bias?: string, bundle_mode?: string, integration_mode?: string }} ScaffoldPolicyLite */
/** @typedef {{ status?: string, snapshot_id?: string | null, reason?: string | null }} SnapshotLike */
/** @typedef {{ created?: boolean, status?: string, output?: string | null, outputs?: string[] | null, scaffold_policy?: ScaffoldPolicyLite | null }} ScaffoldResultLike */
/** @typedef {{ root_dir: string, plan_id: string, coder_loop: { run_id?: string | null }, workflow?: Record<string, unknown> | null }} PlanPromptRecord */
/** @typedef {{ plan: Record<string, any> & { plan_id: string, root_dir: string }, promptText: string }} CreatePlanArtifactsResult */


function printLine(line = '') {
  process.stdout.write(String(line) + '\n');
}
function usage() {
  printLine('Usage:');
  printLine(`  ${formatManagedInvocation('implement-task', ['run', '--objective', '"add health endpoint"', '--skill', 'add-express-route', '--scaffold', '--var name=health'])}`);
  printLine(`  ${formatManagedInvocation('implement-task', ['run', '--objective', '"add endpoint"', '--scaffold', '--bundle-mode', 'minimal', '--integration-mode', 'plan'])}`);
  printLine(`  ${formatManagedInvocation('implement-task', ['status', '--plan-id', '<plan-id>'])}`);
  printLine(`  ${formatManagedInvocation('implement-task', ['status'])}   # uses latest plan`);
  printLine(`  ${formatManagedInvocation('implement-task', ['next-prompt', '--plan-id', '<plan-id>'])}`);
  printLine(`  ${formatManagedInvocation('implement-task', ['next-prompt'])}   # uses latest plan`);
  printLine(`  ${formatManagedInvocation('implement-task', ['run', '--objective', '"add endpoint"', '--no-snapshot'])}   # disable auto snapshot`);
  printLine(`  ${formatManagedInvocation('implement-task', ['run', '--objective', '"add endpoint"', '--allow-cross-runtime', '--json'])}   # allow cross-runtime skill candidates`);
  printLine('Commands: run | status | next-prompt');
}

/** @param {Record<string, any>} opts @returns {Promise<{ plan: Record<string, any>, promptText: string }>} */
async function createPlan(opts) {
  const assetRoot = path.resolve(__dirname, '..', '..');
  const rootDir = path.resolve(String(opts.root || process.cwd()));
  const objective = String(opts.objective || opts._[0] || '').trim();
  if (!objective) throw new Error('missing objective. Pass --objective "..."');

  const profile = detectProjectProfile(rootDir);
  const selection = selectSkill(assetRoot, { ...opts, objective }, profile);
  const selectedSkill = selection.selected;
  const benchmarkFeedback = assessBenchmarkFeedback(rootDir, {
    objective,
    runtime: profile.runtime,
    framework: profile.framework,
    skill: selectedSkill ? selectedSkill.dir : null,
    task_family: selectedSkill ? selectedSkill.task_family : null,
  });
  const targets = splitCsv((typeof opts.targets === 'string' || Array.isArray(opts.targets) ? opts.targets : (typeof opts.target === 'string' || Array.isArray(opts.target) ? opts.target : '')));
  const taskRoute = recommendTaskRoute({ objective, profile, targets, benchmarkFeedback });
  const scaffoldPolicy = /** @type {ScaffoldPolicyLite} */ (deriveScaffoldPolicy({ ...opts, 'strategy-bias': opts['strategy-bias'] || taskRoute.strategy_bias }, benchmarkFeedback));
  const snapshot = /** @type {SnapshotLike} */ (opts['no-snapshot'] ? { status: 'disabled' } : createSnapshot(rootDir, {
    label: objective,
    allowDirty: Boolean(opts['allow-dirty-snapshot']),
    dryRun: false,
    targets,
  }));

  /** @type {ImplementTaskWorkflowContext & { assetRoot: string, objective: string, targets: string[], scaffoldPolicy: ScaffoldPolicyLite, workflowTraceId?: string | null, scaffold?: ScaffoldResultLike | null, run?: CoderRunLite, round?: CoderRoundLite | null, latestRun?: LoadedCoderRunLite | null, plan?: Record<string, any> | null, promptText?: string | null }} */
  const workflowContext = {
    opts,
    assetRoot,
    rootDir,
    objective,
    profile,
    selection,
    selectedSkill,
    benchmarkFeedback,
    targets,
    scaffoldPolicy,
    snapshot,
    runScaffold() {
      if (!selectedSkill) throw new Error('No skill selected or matched for --scaffold');
      if (!selectedSkill.executable) throw new Error(`Selected skill is not executable: ${selectedSkill.dir}`);
      const scaffold = /** @type {ScaffoldResultLike} */ (runSkillScaffold(assetRoot, selectedSkill.dir, {
        ...opts,
        root: rootDir,
        objective,
        'strategy-bias': scaffoldPolicy.strategy_bias,
        'bundle-mode': scaffoldPolicy.bundle_mode,
        'integration-mode': scaffoldPolicy.integration_mode,
        'benchmark-aware': true,
      }, selectedSkill ? selectedSkill.task_family : null));
      for (const output of (Array.isArray(scaffold.outputs) ? scaffold.outputs : [scaffold.output])) {
        appendUnique(targets, output);
      }
      appendEvent(rootDir, 'implement-task.scaffold', {
        flow: 'implementation',
        objective,
        runtime: profile.runtime,
        language: profile.language,
        framework: profile.framework,
        skill: selectedSkill.dir,
        status: scaffold.created ? 'created' : (scaffold.status || 'completed'),
        output: scaffold.output || null,
        outputs: Array.isArray(scaffold.outputs) ? scaffold.outputs : (scaffold.output ? [scaffold.output] : []),
        scaffold_strategy_bias: scaffold.scaffold_policy ? scaffold.scaffold_policy.strategy_bias : scaffoldPolicy.strategy_bias,
        bundle_mode: scaffold.scaffold_policy ? scaffold.scaffold_policy.bundle_mode : scaffoldPolicy.bundle_mode,
        integration_mode: scaffold.scaffold_policy ? scaffold.scaffold_policy.integration_mode : scaffoldPolicy.integration_mode,
      });
      return scaffold;
    },
    createCoderRun() {
      return createRun({ _: [], var: [],
        objective,
        root: rootDir,
        targets: targets.join(','),
        checks: opts.checks || '',
        mode: String(opts.mode || 'auto'),
        skill: selectedSkill ? selectedSkill.dir : '',
        'task-family': selectedSkill ? selectedSkill.task_family : '',
        'benchmark-aware': true,
        'strategy-bias': taskRoute.strategy_bias || benchmarkFeedback.strategy_bias || '',
        'context-scope': taskRoute.context_budget === 'narrow' ? 'narrow' : (taskRoute.context_budget === 'broad' ? 'broad' : 'standard'),
        'ast-edit-mode': taskRoute.edit_mode === 'expansive' ? 'broad' : (taskRoute.edit_mode === 'localized' ? 'balanced' : 'surgical'),
      });
    },
    executeCoderRound: executeRound,
    loadCoderRun: loadRun,
    /** @returns {CreatePlanArtifactsResult} */
    writePlanArtifacts() {
      const latestRun = workflowContext.latestRun || loadRun(workflowContext.run ? workflowContext.run.run_id : '', rootDir);
      const promptText = buildNextPromptText(latestRun) + '\n';
      const planId = newPlanId();
      const planRoot = path.join(resolvePlanDir(rootDir), planId);
      ensureDir(planRoot);
      const contextRel = path.join('.opencode', 'implementation-plans', planId, 'context.json').replace(/\\/g, '/');
      const promptRel = path.join('.opencode', 'implementation-plans', planId, 'next-prompt.md').replace(/\\/g, '/');
      writeJson(path.join(planRoot, 'context.json'), latestRun.context);
      fs.writeFileSync(path.join(planRoot, 'next-prompt.md'), promptText, 'utf8');
      const recoveryBaseline = getGitRepoState(rootDir, latestRun.targets);
      /** @type {Record<string, any>} */
      const plan = {
        schema_version: '1.1',
        plan_id: planId,
        created_at: nowIso(),
        root_dir: rootDir,
        objective,
        profile,
        targets: latestRun.targets,
        selected_skill: summarizeSkillSelection(selectedSkill),
        skill_candidates: selection.candidates || [],
        skill_selection_report: selection.report || null,
        scaffold: workflowContext.scaffold || null,
        scaffold_policy: scaffoldPolicy,
        safety: {
          snapshot_id: snapshot.snapshot_id || null,
          snapshot_status: snapshot.status || 'unknown',
          snapshot_reason: snapshot.reason || null,
          recovery_baseline: recoveryBaseline,
        },
        coder_loop: {
          run_id: latestRun.run_id,
          status: latestRun.status,
          failed_count: (latestRun.latest_failures || []).length,
          round_count: latestRun.rounds.length,
          checks: ((/** @type {CoderRoundLite | null | undefined} */ (workflowContext.round) ? /** @type {CoderRoundLite} */ (workflowContext.round).checks : []) || []).map((check) => ({ kind: check.kind, command: check.command, code: check.code })),
          strategy_action: latestRun.failure_strategy ? latestRun.failure_strategy.action : null,
          strategy_confidence: latestRun.failure_strategy ? latestRun.failure_strategy.confidence : null,
        },
        files: {
          context: contextRel,
          next_prompt: promptRel,
        },
        workflow: {
          workflow_id: 'implement-task',
          trace_id: workflowContext.workflowTraceId || null,
        },
        benchmark_feedback: benchmarkFeedback,
        task_route: taskRoute,
        execution_policy: {
          strategy_bias: benchmarkFeedback.strategy_bias,
          validation_mode: benchmarkFeedback.recommended_validation_mode,
          review_gate_required: benchmarkFeedback.review_gate_required,
          benchmark_risk_level: benchmarkFeedback.risk_level,
          benchmark_risk_score: benchmarkFeedback.risk_score,
          context_scope: latestRun.context_policy ? latestRun.context_policy.context_scope : null,
          ast_edit_mode: latestRun.context_policy ? latestRun.context_policy.ast_edit_mode : null,
          scaffold_bundle_mode: scaffoldPolicy.bundle_mode,
          scaffold_integration_mode: scaffoldPolicy.integration_mode,
        },
        suggested_commands: [],
      };
      plan.suggested_commands = buildSuggestedCommands(plan);
      savePlan(/** @type {{ root_dir: string, plan_id: string }} */ (plan));
      rememberPlan(plan);
      appendEvent(rootDir, 'implement-task.plan.created', {
        flow: 'implementation',
        plan_id: plan.plan_id,
        coder_run_id: latestRun.run_id,
        objective,
        runtime: profile.runtime,
        language: profile.language,
        framework: profile.framework,
        status: plan.coder_loop.status,
        skill: plan.selected_skill ? plan.selected_skill.dir : null,
        task_family: plan.selected_skill ? plan.selected_skill.task_family || null : null,
        rejected_skill_candidates: plan.skill_selection_report && plan.skill_selection_report.totals ? plan.skill_selection_report.totals.rejected : 0,
        failed_count: plan.coder_loop.failed_count,
        snapshot_status: plan.safety.snapshot_status,
        benchmark_risk_level: benchmarkFeedback.risk_level,
        benchmark_risk_score: benchmarkFeedback.risk_score,
        benchmark_strategy_bias: benchmarkFeedback.strategy_bias,
        context_scope: latestRun.context_policy ? latestRun.context_policy.context_scope : null,
        ast_edit_mode: latestRun.context_policy ? latestRun.context_policy.ast_edit_mode : null,
        scaffold_bundle_mode: scaffoldPolicy.bundle_mode,
        scaffold_integration_mode: scaffoldPolicy.integration_mode,
      });
      appendEvent(rootDir, 'benchmark-feedback.assessed', {
        flow: 'implementation',
        objective,
        runtime: profile.runtime,
        framework: profile.framework,
        skill: plan.selected_skill ? plan.selected_skill.dir : null,
        task_family: plan.selected_skill ? plan.selected_skill.task_family || null : null,
        rejected_skill_candidates: plan.skill_selection_report && plan.skill_selection_report.totals ? plan.skill_selection_report.totals.rejected : 0,
        status: benchmarkFeedback.risk_level,
        benchmark_risk_score: benchmarkFeedback.risk_score,
        benchmark_strategy_bias: benchmarkFeedback.strategy_bias,
        context_scope: latestRun.context_policy ? latestRun.context_policy.context_scope : null,
        ast_edit_mode: latestRun.context_policy ? latestRun.context_policy.ast_edit_mode : null,
        scaffold_bundle_mode: scaffoldPolicy.bundle_mode,
        scaffold_integration_mode: scaffoldPolicy.integration_mode,
      });
      return { plan: /** @type {Record<string, any> & { plan_id: string, root_dir: string }} */ (plan), promptText };
    },
  };

  const { context, trace } = /** @type {{ context: ImplementTaskWorkflowContext & { plan?: (Record<string, any> & { plan_id?: string, root_dir?: string, workflow?: Record<string, any> | null }) | null, promptText?: string | null, workflowTraceId?: string | null }, trace: { trace_id: string } }} */ (/** @type {unknown} */ (await executeImplementTaskWorkflow(workflowContext)));
  context.workflowTraceId = trace.trace_id;
  if (context.plan && context.plan.workflow) context.plan.workflow.trace_id = trace.trace_id;
  if (context.plan && context.plan.root_dir && context.plan.plan_id) savePlan(/** @type {{ root_dir: string, plan_id: string }} */ (context.plan));
  return { plan: context.plan || {}, promptText: context.promptText || '' };
}

/** @param {PlanPromptRecord} plan */
function printPromptForPlan(plan) {
  const run = loadRun(String(plan.coder_loop.run_id || loadLatestRunId(plan.root_dir)), plan.root_dir);
  process.stdout.write(buildNextPromptText(run) + '\n');
}

async function main() {
  try {
    const { cmd, opts } = parseCliArgs(process.argv, { defaultCommand: 'run', listFlags: ['var'] });
    if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
      usage();
      process.exit(0);
    }
    if (cmd === 'run') {
      const { plan, promptText } = await createPlan(opts);
      if (opts.json) {
        process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
      } else {
        printPlanSummary(plan);
      }
      if (opts['emit-prompt']) {
        if (!opts.json) printLine('');
        process.stdout.write(promptText);
      }
      return;
    }
    if (cmd === 'status') {
      const plan = loadPlan(String(opts['plan-id'] || opts.plan || opts._[0] || ''), String(opts.root || process.cwd()));
      if (opts.json) process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
      else printPlanSummary(plan);
      return;
    }
    if (cmd === 'next-prompt') {
      const plan = loadPlan(String(opts['plan-id'] || opts.plan || opts._[0] || ''), String(opts.root || process.cwd()));
      printPromptForPlan(plan);
      return;
    }
    throw new Error(`unknown command: ${cmd}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[implement-task] ${message}`);
    usage();
    process.exit(1);
  }
}

module.exports = {
  main,
  createPlan,
  loadPlan,
  loadLatestPlanId,
  savePlan,
  matchSkills,
};

if (require.main === module) {
  main();
}
