/** @param {any[]} [items] */
function unique(items = []) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

/** @param {{ checks?: any[], relatedTests?: string[], profile?: any, failureKinds?: string[] }} [input] */
function deriveMinimalVerifyCommands({ checks = [], relatedTests = [], profile = {}, failureKinds = [] } = {}) {
  /** @type {string[]} */
  const commands = [];
  const runtime = String(profile.runtime || 'unknown');
  const related = unique(relatedTests).slice(0, 4);
  if (runtime === 'node' && related.length > 0) commands.push(`node --test ${related.join(' ')}`);
  if (runtime === 'python' && related.length > 0) commands.push(`pytest ${related.join(' ')}`);
  if (runtime === 'go' && related.length > 0) {
    const dirs = unique(related.map((file) => String(file).split('/').slice(0, -1).join('/') || '.'));
    commands.push(...dirs.map((dir) => `go test ./${dir}`));
  }
  for (const check of checks || []) {
    if (check && check.command) commands.push(String(check.command));
  }
  if ((failureKinds || []).includes('lint_or_format')) {
    const lint = commands.find((command) => /\blint\b|eslint|prettier|biome/.test(command));
    if (lint) return unique([lint, ...commands]).slice(0, 4);
  }
  return unique(commands).slice(0, 4);
}

/** @param {{ patchDecision?: any, currentPatch?: any, repairRecipe?: any, context?: any, latestFailures?: any[] }} [input] */
function deriveFileActions({ patchDecision = {}, currentPatch = {}, repairRecipe = {}, context = {}, latestFailures = [] } = {}) {
  const preferredFiles = unique(((patchDecision && patchDecision.preferred_files) || []).concat((((repairRecipe || {}).patch_guard || {}).preferred_files || []))).slice(0, 8);
  const touched = unique(currentPatch.touched_files || []);
  const protectedViolations = unique(currentPatch.protected_file_violations || []);
  const restoreFiles = touched.filter((file) => protectedViolations.includes(file) || (preferredFiles.length > 0 && !preferredFiles.includes(file)));
  const targetFiles = unique((context.targets || []).map((/** @type {{ path?: string }} */ item) => item.path));
  const failureFiles = unique((latestFailures || []).map((/** @type {{ file?: string }} */ item) => item.file));
  const inspectFiles = unique([...failureFiles, ...targetFiles, ...preferredFiles]).slice(0, 8);
  return {
    inspect_files: inspectFiles,
    preserve_files: preferredFiles,
    restore_files: restoreFiles.slice(0, 8),
  };
}

/** @param {{ patchDecision?: any, currentPatch?: any, repairRecipe?: any, context?: any, checks?: any[], latestFailures?: any[] }} [input] */
function buildAutomaticRepairPlan({ patchDecision = {}, currentPatch = {}, repairRecipe = {}, context = {}, checks = [], latestFailures = [] } = {}) {
  const failureKinds = unique((repairRecipe.failure_kinds || []).concat((latestFailures || []).map((item) => item.kind || item.category)));
  const verifyCommands = deriveMinimalVerifyCommands({
    checks,
    relatedTests: context.related_tests || [],
    profile: context.profile || {},
    failureKinds,
  });
  const fileActions = deriveFileActions({ patchDecision, currentPatch, repairRecipe, context, latestFailures });
  /** @type {string[]} */
  const operations = [];
  if (patchDecision.action === 'split_or_rollback') {
    operations.push('restore_non_preferred_files');
    if (fileActions.restore_files.length > 0) operations.push('revert_protected_or_unrelated_files');
  } else if (patchDecision.action === 'narrow_patch') {
    operations.push('narrow_to_preferred_files');
  } else {
    operations.push('apply_targeted_fix');
  }
  if (failureKinds.includes('import_resolve')) operations.push('repair_imports_before_logic');
  if (failureKinds.includes('typecheck')) operations.push('align_types_before_rewrite');
  if (failureKinds.includes('test_assertion')) operations.push('recheck_expectations_before_behavior_change');
  if (failureKinds.includes('module_format')) operations.push('repair_module_boundary');
  return {
    mode: patchDecision.action === 'apply' ? 'assisted_apply' : 'guarded_repair',
    verify_commands: verifyCommands,
    file_actions: fileActions,
    operations: unique(operations),
    summary: patchDecision.action === 'apply'
      ? 'Patch is narrow enough to continue with a targeted repair and focused verification.'
      : 'Patch should be narrowed automatically before the next repair attempt.',
  };
}

/** @param {{ patchDecision?: any, currentPatch?: any, repairRecipe?: any, context?: any, checks?: any[], latestFailures?: any[] }} [input] */
function deriveRepairExecution({ patchDecision = {}, currentPatch = {}, repairRecipe = {}, context = {}, checks = [], latestFailures = [] } = {}) {
  const plan = buildAutomaticRepairPlan({ patchDecision, currentPatch, repairRecipe, context, checks, latestFailures });
  const restoreCount = Array.isArray(plan.file_actions && plan.file_actions.restore_files) ? plan.file_actions.restore_files.length : 0;
  const verifyCount = Array.isArray(plan.verify_commands) ? plan.verify_commands.length : 0;
  return {
    ...plan,
    apply_decision: patchDecision.action || 'apply',
    requires_narrowing: patchDecision.action !== 'apply',
    restore_count: restoreCount,
    verify_count: verifyCount,
    execution_ready: verifyCount > 0 || restoreCount > 0 || (Array.isArray(plan.operations) && plan.operations.length > 0),
  };
}

module.exports = {
  deriveMinimalVerifyCommands,
  buildAutomaticRepairPlan,
  deriveRepairExecution,
};
