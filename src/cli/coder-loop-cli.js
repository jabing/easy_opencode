#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildImplementationContext } = require('../core/implementation/context.js');
const { splitCsv, detectProjectProfile } = require('../core/project-profile.js');
const { formatManagedInvocation } = require('../cli/runtime-paths.js');
const { normalizeFailures } = require('../shared/error-normalizers/index.js');
const { analyzeCoderRun } = require('../core/gates/failure-strategy.js');
const { rememberCoderRun } = require('../control-plane/orchestrator/memory.js');
const { appendEvent } = require('../control-plane/observability/index.js');
const { deriveCoderPolicy, derivePolicyInput } = require('../core/implementation/coder-policy.js');
const { executeCommandSync } = require('../control-plane/kernel/executor.js');
const { evaluatePatchFootprint, derivePatchDecision } = require('../core/implementation/edit-engine.js');
const { buildAutomaticRepairPlan } = require('../core/repair/executor.js');
const { collectPatchSurface } = require('../core/git/patch-surface.js');
const { parseCliArgs } = require('../shared/cli/args.js');

/** @typedef {import('../shared/cli/args.js').ParsedCliOptions} ParsedCliOptions */
/** @typedef {import('../shared/error-normalizers/index.js').FailureItem} FailureItem */
/** @typedef {{ kind: string, command: string }} ValidationCheck */
/** @typedef {{ path: string, exports: string[], symbols: string[], related_tests: string[] }} TargetSummary */
/** @typedef {{ runtime: string, language: string, framework: string, package_manager?: string | null, validation?: ValidationCheck[] }} ContextProfile */
/** @typedef {{ context_scope?: string | null, ast_edit_mode?: string | null, strategy_bias?: string | null, target_budget?: number | null, related_test_budget?: number | null, max_failure_items?: number | null }} CoderPolicyLite */
/** @typedef {{ path: string }} CandidateEditFile */
/** @typedef {{ candidate_edit_files?: CandidateEditFile[] }} ChangeSurfaceLite */
/** @typedef {{ profile: ContextProfile, targets: TargetSummary[], related_tests: string[], omitted_targets?: string[], omitted_related_tests?: string[], change_surface?: ChangeSurfaceLite | null, edit_strategy?: Record<string, unknown> | null, task_route?: Record<string, unknown> | null, context_policy?: CoderPolicyLite | null, composite?: { default_provider_id?: string | null } | null }} ImplementationContextLite */
/** @typedef {{ kind: string, command: string, code: number, failures: FailureItem[], output_excerpt: string[] }} CheckResult */
/** @typedef {{ round: number, at: string, checks: CheckResult[] }} CoderRound */
/** @typedef {{ action?: string | null, confidence?: string | number | null, benchmark_feedback?: { risk_level?: string | null } | null, strategy_bias?: string | null, reasons?: string[], suggested_commands?: string[] }} FailureStrategyLite */
/** @typedef {{ verdict?: string | null, touched_files: string[], file_budget?: number | null, unrelated_edit_ratio?: number | string | null, protected_file_violations?: string[], patch_surface?: { unstaged_files?: string[], staged_files?: string[], untracked_files?: string[], deleted_files?: string[], all_touched_files?: string[] } | null }} PatchEvaluationLite */
/** @typedef {{ run_id: string, root_dir: string, objective: string, targets: string[], checks: ValidationCheck[], context: ImplementationContextLite, rounds: CoderRound[], latest_failures: FailureItem[], status: string, context_policy?: CoderPolicyLite | null, created_at: string, updated_at: string, failure_strategy?: FailureStrategyLite | null, current_patch_evaluation?: PatchEvaluationLite | null, repair_recipe?: Record<string, unknown> | null }} CoderRunLite */


function printLine(line = '') {
  process.stdout.write(String(line) + '\n');
}

/** @param {string | null | undefined} rootDir */
function resolveLoopDir(rootDir) {
  return path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'coder-loop');
}

/** @param {string} dir */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function usage() {
  printLine('Usage:');
  printLine(`  ${formatManagedInvocation('coder-loop', ['run', '--objective', '"implement auth refresh flow"', '--targets', 'src/auth.ts,src/auth.test.ts'])}`);
  printLine(`  ${formatManagedInvocation('coder-loop', ['status', '--run-id', '<run-id>'])}`);
  printLine(`  ${formatManagedInvocation('coder-loop', ['next-prompt', '--run-id', '<run-id>'])}`);
  printLine('Commands: run | status | next-prompt');
}

/** @param {string} command @returns {string[]} */
function shellSplit(command) {
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  const parts = [];
  let match;
  while ((match = re.exec(command)) !== null) {
    const value = match[1] || match[2] || match[3] || '';
    parts.push(value.replace(/\\(["'\\])/g, '$1'));
  }
  return parts;
}

/** @param {CoderRunLite | null | undefined} run @returns {PatchEvaluationLite | null} */
function buildCurrentPatchEvaluation(run) {
  if (!run || !run.root_dir) return null;
  const patchSurface = collectPatchSurface(run.root_dir);
  const touchedFiles = patchSurface.all_touched_files || [];
  const route = run.context.edit_strategy || run.context.task_route || {};
  const changeSurface = run.context && run.context.change_surface ? run.context.change_surface : {};
  const evaluation = evaluatePatchFootprint({
    footprint: patchSurface,
    changeSurface,
    route,
    recipe: run.repair_recipe || {},
  });
  return { ...evaluation, touched_files: touchedFiles, patch_surface: patchSurface };
}

function nowIso() {
  return new Date().toISOString();
}

function newRunId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `coder-${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

/** @param {string} runId @param {string | null | undefined} rootDir */
function runPath(runId, rootDir) {
  return path.join(resolveLoopDir(rootDir), `${runId}.json`);
}

/** @param {CoderRunLite} run */
function saveRun(run) {
  const loopDir = resolveLoopDir(run.root_dir);
  ensureDir(loopDir);
  fs.writeFileSync(runPath(run.run_id, run.root_dir), JSON.stringify(run, null, 2) + '\n', 'utf8');
  fs.writeFileSync(
    path.join(loopDir, 'latest.json'),
    JSON.stringify({ run_id: run.run_id, latest_failures: run.latest_failures || [] }, null, 2) + '\n',
    'utf8'
  );
  rememberCoderRun(run);
}

/** @param {string} runId @param {string | null | undefined} rootDir @returns {CoderRunLite} */
function loadRun(runId, rootDir) {
  const file = runPath(runId, rootDir);
  if (!fs.existsSync(file)) throw new Error(`run not found: ${runId}`);
  return /** @type {CoderRunLite} */ (JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** @param {string | null | undefined} rootDir */
function loadLatestRunId(rootDir) {
  return JSON.parse(fs.readFileSync(path.join(resolveLoopDir(rootDir), 'latest.json'), 'utf8')).run_id;
}

/** @param {ImplementationContextLite} context @param {string | boolean | string[] | null | undefined} requestedChecks @returns {ValidationCheck[]} */
function pickChecks(context, requestedChecks) {
  const requestedValue = typeof requestedChecks === 'string' || Array.isArray(requestedChecks) ? requestedChecks : '';
  const requested = new Set(splitCsv(requestedValue).map((item) => item.toLowerCase()));
  const available = context.profile.validation || [];
  if (requested.size === 0) return available;
  return available.filter((item) => requested.has(item.kind));
}

/** @param {string} command @param {string | null | undefined} cwd @param {CoderRunLite | null | undefined} run */
function runCommand(command, cwd, run) {
  const parts = shellSplit(command);
  if (parts.length === 0) return { code: 1, stdout: '', stderr: 'empty command', command };
  const executableName = parts[0] || 'check';
  const result = executeCommandSync({
    command,
    rootDir: run && run.root_dir ? run.root_dir : (cwd || process.cwd()),
    workdir: cwd || process.cwd(),
    runId: run ? `coder-${run.run_id}` : null,
    stepId: `coder-check-${executableName.replace(/[^a-zA-Z0-9._-]+/g, '_')}`,
    executableField: 'check',
    timeoutSec: 600,
    metadata: {
      flow: 'coder-loop',
      objective: run ? run.objective : null,
    },
  });
  return {
    command,
    code: result.exit_code,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

/** @param {CoderRound} round @returns {FailureItem[]} */
function buildRoundSummary(round) {
  /** @type {FailureItem[]} */
  const failures = [];
  for (const check of round.checks) {
    if (check.code !== 0) failures.push(...check.failures);
  }
  return failures;
}

/** @param {ParsedCliOptions} opts @returns {CoderRunLite} */
function createRun(opts) {
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
    benchmark_aware: opts['benchmark-aware'] !== false,
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
    targets: splitCsv((typeof opts.targets === 'string' || Array.isArray(opts.targets) ? opts.targets : (typeof opts.target === 'string' || Array.isArray(opts.target) ? opts.target : ''))),
    mode: String(opts.mode || 'auto'),
    policy,
  });
  /** @type {CoderRunLite} */
  const run = {
    run_id: newRunId(),
    root_dir: rootDir,
    objective,
    targets: context.targets.map((target) => target.path),
    checks: pickChecks(context, opts.checks),
    context,
    rounds: [],
    latest_failures: [],
    status: 'initialized',
    context_policy: policy,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  saveRun(run);
  appendEvent(rootDir, 'coder-loop.run.created', {
    flow: 'implementation',
    run_id: run.run_id,
    objective,
    runtime: context.profile.runtime,
    language: context.profile.language,
    framework: context.profile.framework,
    status: run.status,
    target_count: run.targets.length,
    strategy_bias: policy.strategy_bias,
    context_scope: policy.context_scope,
    ast_edit_mode: policy.ast_edit_mode,
  });
  return run;
}

/** @param {CoderRunLite} run @returns {CoderRound} */
function executeRound(run) {
  /** @type {CoderRound} */
  const round = {
    round: run.rounds.length + 1,
    at: nowIso(),
    checks: [],
  };
  for (const check of run.checks) {
    const result = runCommand(check.command, run.root_dir, run);
    const text = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    /** @type {{ runtime: string, language: string, text: string, tool: string, provider?: string }} */
    const failureInput = {
      runtime: run.context.profile.runtime,
      language: run.context.profile.language,
      text,
      tool: check.kind,
    };
    if (run.context.composite && run.context.composite.default_provider_id) failureInput.provider = run.context.composite.default_provider_id;
    round.checks.push({
      kind: check.kind,
      command: check.command,
      code: result.code,
      failures: result.code === 0 ? [] : normalizeFailures(failureInput),
      output_excerpt: text.split(/\r?\n/).slice(0, 40),
    });
  }
  run.rounds.push(round);
  run.latest_failures = buildRoundSummary(round);
  run.status = run.latest_failures.length === 0 ? 'green' : 'needs_fix';
  run.updated_at = nowIso();
  run.failure_strategy = analyzeCoderRun(/** @type {any} */ (run));
  run.current_patch_evaluation = buildCurrentPatchEvaluation(run);
  saveRun(run);
  appendEvent(run.root_dir, 'coder-loop.round', {
    flow: 'implementation',
    run_id: run.run_id,
    objective: run.objective,
    runtime: run.context.profile.runtime,
    language: run.context.profile.language,
    framework: run.context.profile.framework,
    status: run.status,
    round: round.round,
    failed_count: run.latest_failures.length,
    check_count: round.checks.length,
    strategy_action: run.failure_strategy ? run.failure_strategy.action : null,
    strategy_confidence: run.failure_strategy ? run.failure_strategy.confidence : null,
    benchmark_risk_level: run.failure_strategy && run.failure_strategy.benchmark_feedback ? run.failure_strategy.benchmark_feedback.risk_level : null,
    benchmark_strategy_bias: run.failure_strategy ? run.failure_strategy.strategy_bias : null,
    context_scope: run.context_policy ? run.context_policy.context_scope : null,
    ast_edit_mode: run.context_policy ? run.context_policy.ast_edit_mode : null,
  });
  appendEvent(run.root_dir, 'coder-loop.strategy.assessed', {
    flow: 'implementation',
    run_id: run.run_id,
    objective: run.objective,
    runtime: run.context.profile.runtime,
    language: run.context.profile.language,
    framework: run.context.profile.framework,
    status: run.status,
    action: run.failure_strategy ? run.failure_strategy.action : null,
    confidence: run.failure_strategy ? run.failure_strategy.confidence : null,
    benchmark_risk_level: run.failure_strategy && run.failure_strategy.benchmark_feedback ? run.failure_strategy.benchmark_feedback.risk_level : null,
    benchmark_strategy_bias: run.failure_strategy ? run.failure_strategy.strategy_bias : null,
    context_scope: run.context_policy ? run.context_policy.context_scope : null,
    ast_edit_mode: run.context_policy ? run.context_policy.ast_edit_mode : null,
  });
  return round;
}

/** @param {CoderRunLite} run */
function printStatus(run) {
  printLine(`Run: ${run.run_id}`);
  printLine(`Objective: ${run.objective}`);
  printLine(`Status: ${run.status}`);
  printLine(`Targets: ${run.targets.join(', ') || '(auto)'}`);
  printLine(`Runtime: ${run.context.profile.runtime} / ${run.context.profile.language} / ${run.context.profile.framework}`);
  if (run.failure_strategy) {
    printLine(`Failure strategy: ${run.failure_strategy.action} (confidence=${run.failure_strategy.confidence})`);
  }
  if (run.current_patch_evaluation) {
    const patchSurface = run.current_patch_evaluation.patch_surface || {};
    printLine(`Patch discipline: ${run.current_patch_evaluation.verdict} files=${run.current_patch_evaluation.touched_files.length}/${run.current_patch_evaluation.file_budget || 'n/a'} unrelated=${run.current_patch_evaluation.unrelated_edit_ratio} staged=${(patchSurface.staged_files || []).length} unstaged=${(patchSurface.unstaged_files || []).length} untracked=${(patchSurface.untracked_files || []).length}`);
  }
  if (run.rounds.length === 0) {
    printLine('Rounds: 0');
    return;
  }
  const last = run.rounds[run.rounds.length - 1];
  if (!last) {
    printLine('Rounds: 0');
    return;
  }
  printLine(`Last round: ${last.round} @ ${last.at}`);
  for (const check of last.checks) {
    printLine(`- ${check.kind}: ${check.code === 0 ? 'PASS' : 'FAIL'} (${check.command})`);
    for (const failure of check.failures.slice(0, 5)) {
      const location = failure.file ? `${failure.file}${failure.line ? `:${failure.line}` : ''}` : failure.symbol || 'unknown';
      printLine(`  • ${location} ${failure.message}`);
    }
  }
}

/** @param {CoderRunLite} run @returns {string} */
function buildNextPromptText(run) {
  const failures = run.latest_failures || [];
  const policy = run.context_policy || run.context.context_policy || null;
  const failureLimit = policy && Number(policy.max_failure_items) > 0 ? Number(policy.max_failure_items) : 15;
  const primaryTargets = run.context.targets.map((item) => item.path).join(', ') || '(auto)';
  const lines = [
    '# Repair Brief',
    '',
    `Objective: ${run.objective}`,
    `Targets: ${primaryTargets}`,
    '',
    '## Repo Context',
    `- Runtime: ${run.context.profile.runtime}`,
    `- Language: ${run.context.profile.language}`,
    `- Framework: ${run.context.profile.framework}`,
    `- Package manager: ${run.context.profile.package_manager || 'n/a'}`,
    '',
    '## Coder Policy',
    `- Strategy bias: ${policy ? policy.strategy_bias : 'balanced'}`,
    `- Context scope: ${policy ? policy.context_scope : 'standard'}`,
    `- AST edit mode: ${policy ? policy.ast_edit_mode : 'balanced'}`,
    `- Target budget: ${policy ? policy.target_budget : run.context.targets.length}`,
    `- Related test budget: ${policy ? policy.related_test_budget : run.context.related_tests.length}`,
    '',
    '## Validation Commands',
  ];
  for (const check of run.checks) {
    lines.push(`- ${check.kind}: ${check.command}`);
  }
  lines.push('', '## Target Summaries');
  for (const target of run.context.targets) {
    lines.push(`- ${target.path}: exports=[${target.exports.join(', ')}] symbols=[${target.symbols.join(', ')}] related_tests=[${target.related_tests.join(', ')}]`);
  }
  if ((run.context.omitted_targets || []).length > 0) lines.push(`- Omitted targets by policy: ${(run.context.omitted_targets || []).join(', ')}`);
  if ((run.context.omitted_related_tests || []).length > 0) lines.push(`- Omitted related tests by policy: ${(run.context.omitted_related_tests || []).join(', ')}`);
  lines.push('', '## Failures To Fix');
  if (failures.length === 0) {
    lines.push('- No current failures. Keep the diff minimal and rerun validation after edits.');
  } else {
    for (const failure of failures.slice(0, failureLimit)) {
      const location = failure.file ? `${failure.file}${failure.line ? `:${failure.line}` : ''}` : failure.symbol || 'unknown';
      lines.push(`- [${failure.category}] ${location} — ${failure.message}`);
    }
  }
  lines.push('', '## Patch Discipline');
  const patch = run.current_patch_evaluation || buildCurrentPatchEvaluation(run);
  if (patch) {
    lines.push(`- Current patch verdict: ${patch.verdict}`);
    lines.push(`- Touched files: ${patch.touched_files.join(', ') || '(none)'}`);
    if (patch.patch_surface) {
      lines.push(`- Patch surface: staged=${(patch.patch_surface.staged_files || []).length} unstaged=${(patch.patch_surface.unstaged_files || []).length} untracked=${(patch.patch_surface.untracked_files || []).length} deleted=${(patch.patch_surface.deleted_files || []).length}`);
    }
    lines.push(`- File budget: ${patch.file_budget || 'n/a'}`);
    lines.push(`- Unrelated edit ratio: ${patch.unrelated_edit_ratio}`);
    const protectedViolations = patch.protected_file_violations || [];
    if (protectedViolations.length > 0) lines.push(`- Protected file violations: ${protectedViolations.join(', ')}`);
    const patchGate = derivePatchDecision({ assessment: /** @type {any} */ (patch), recipe: run.repair_recipe || {}, route: run.context.edit_strategy || run.context.task_route || {} });
    lines.push(`- Recommended patch action: ${patchGate.action}`);
    for (const reason of patchGate.reasons.slice(0, 3)) lines.push(`- Patch gate: ${reason}`);
  } else {
    lines.push('- Patch footprint unavailable (likely not a git workspace yet).');
  }
  lines.push('', '## Failure Strategy');
  if (run.failure_strategy) {
    lines.push(`- Recommended action: ${run.failure_strategy.action} (confidence=${run.failure_strategy.confidence})`);
    for (const reason of run.failure_strategy.reasons || []) {
      lines.push(`- Why: ${reason}`);
    }
    const suggestedCommands = run.failure_strategy.suggested_commands || [];
    if (suggestedCommands.length > 0) {
      lines.push('- Suggested commands:');
      for (const command of suggestedCommands.slice(0, 4)) {
        lines.push(`  - ${command}`);
      }
    }
  } else {
    lines.push('- No failure strategy has been computed yet.');
  }
  lines.push('', '## Automatic Repair Executor');
  const patchForAuto = patch || null;
  const patchGateForAuto = patchForAuto ? derivePatchDecision({ assessment: /** @type {any} */ (patchForAuto), recipe: run.repair_recipe || {}, route: run.context.edit_strategy || run.context.task_route || {} }) : { action: 'apply', preferred_files: [] };
  const automaticRepair = buildAutomaticRepairPlan({
    patchDecision: patchGateForAuto,
    currentPatch: patchForAuto || {},
    repairRecipe: run.repair_recipe || {},
    context: run.context || {},
    checks: run.checks || [],
    latestFailures: failures,
  });
  lines.push(`- Mode: ${automaticRepair.mode}`);
  lines.push(`- Summary: ${automaticRepair.summary}`);
  if ((automaticRepair.file_actions.inspect_files || []).length > 0) lines.push(`- Inspect first: ${automaticRepair.file_actions.inspect_files.join(', ')}`);
  if ((automaticRepair.file_actions.restore_files || []).length > 0) lines.push(`- Restore files: ${automaticRepair.file_actions.restore_files.join(', ')}`);
  if ((automaticRepair.verify_commands || []).length > 0) lines.push(`- Focused verify: ${automaticRepair.verify_commands.join(' | ')}`);
  if ((automaticRepair.operations || []).length > 0) lines.push(`- Planned operations: ${automaticRepair.operations.join(', ')}`);
  lines.push('', '## Guardrails');
  lines.push('- Keep edits local to target files and directly related tests.');
  if (run.context && run.context.change_surface && Array.isArray(run.context.change_surface.candidate_edit_files) && run.context.change_surface.candidate_edit_files.length > 0) {
    lines.push(`- Preferred edit files: ${run.context.change_surface.candidate_edit_files.slice(0, 6).map((item) => item.path).join(', ')}`);
  }
  lines.push('- Prefer structure-aware edits where available over broad text replacements.');
  if (policy && policy.ast_edit_mode === 'surgical') lines.push('- In surgical mode, use AST edits with --edit-policy surgical and avoid workspace-wide renames unless forced.');
  if (policy && policy.context_scope === 'narrow') lines.push('- In narrow context mode, do not pull in omitted neighbors until the current failures prove they matter.');
  lines.push('- After editing, rerun the coder loop and stop only when all checks are green.');
  return lines.join('\n');
}

/** @param {CoderRunLite} run */
function printNextPrompt(run) {
  printLine(buildNextPromptText(run));
}

function main() {
  try {
    const { cmd, opts } = parseCliArgs(process.argv, { defaultCommand: 'run', listFlags: ['var'] });
    if (!cmd || cmd === '--help' || cmd === 'help') {
      usage();
      process.exit(0);
    }
    if (cmd === 'run') {
      const run = opts['run-id'] ? loadRun(String(opts['run-id']), String(opts.root || process.cwd())) : createRun(opts);
      const round = executeRound(run);
      const failed = round.checks.filter((check) => check.code !== 0).length;
      printLine(`[coder-loop] run=${run.run_id} round=${round.round} status=${run.status} failed_checks=${failed}`);
      if (opts['emit-prompt']) {
        printLine('');
        printNextPrompt(run);
      }
      return;
    }
    if (cmd === 'status') {
      const run = loadRun(String(opts['run-id'] || loadLatestRunId(String(opts.root || process.cwd()))), String(opts.root || process.cwd()));
      printStatus(run);
      return;
    }
    if (cmd === 'next-prompt') {
      const run = loadRun(String(opts['run-id'] || loadLatestRunId(String(opts.root || process.cwd()))), String(opts.root || process.cwd()));
      printNextPrompt(run);
      return;
    }
    throw new Error(`unknown command: ${cmd}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[coder-loop] ${message}`);
    usage();
    process.exit(1);
  }
}

module.exports = {
  main,
  createRun,
  executeRound,
  loadRun,
  loadLatestRunId,
  buildNextPromptText,
};

if (require.main === module) {
  main();
}
