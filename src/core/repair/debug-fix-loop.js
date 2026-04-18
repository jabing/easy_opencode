const path = require('path');
const { resolveSkill } = require('../skills/manifest.js');
const { buildFeaturePlan } = require('../feature/plan.js');
const { readOrAnalyzeProjectStructure } = require('../project/structure.js');
const { readOrInferProjectMemory, persistFeatureMemoryUpdate } = require('../project/memory.js');
const { detectProjectProfile } = require('../project-profile.js');
const { inferVerifyCommands } = require('../feature/feedback.js');
const { recommendTaskRoute } = require('../implementation/task-routing.js');
const { buildCodeIntelligence, buildChangeSurface } = require('../implementation/code-intelligence.js');
const { buildRepairExecutionSummary, buildVarsFromMemory, applyPlannedUpdates, classifyFailureKinds, deriveNameVars, flattenPathVars, normalizeRecoveryCommands, parseVerifyFailures, recommendRepairRecipe, renderString, rerenderModule, runVerifyCommands } = require('./repair-helpers.js');
/** @typedef {Record<string, any>} LooseRecord */
/** @typedef {{ runtime?: string | null, language?: string | null, framework?: string | null, package_manager?: string | null, test_runner?: string | null }} ProjectProfile */
/** @typedef {import('../skills/manifest.js').SkillRecord} SkillRecord */
/** @typedef {{ id?: string, type?: string, modules?: Array<{ id?: string, output?: string, template?: string }>, verify?: string[], plan?: { dependency_graph?: Record<string, string[]> } }} FeatureActionLike */
/** @typedef {{ id?: string, output?: string, template?: string }} FeatureModuleLike */
/** @typedef {{ feature_root?: string, route_index?: string }} FeaturePaths */
/** @typedef {{ controller_filename?: string, service_filename?: string, repository_filename?: string, schema_filename?: string, route_filename?: string }} FeatureFileNames */
/** @typedef {{ import_route_from_entrypoint?: string }} FeatureImports */
/** @typedef {{ paths: FeaturePaths, ordered_modules?: FeatureModuleLike[], updates?: Array<{ file?: string, content?: string, create_if_missing?: unknown, only_if_exists?: unknown }>, file_names?: FeatureFileNames, imports?: FeatureImports, route_export_target?: string, vars?: Record<string, string> }} PlannedFeature */
/** @typedef {{ failure_patterns?: any[] | any | null, preferred_test_commands?: any, preferred_test_runner_profile?: any, coding_style?: string | null, last_feature_generation?: { shape_strategy?: string | null, implementation_style?: string | null } }} ProjectMemory */
/** @typedef {{ commands?: string[], preferred_test_command?: string | null, preferred_test_commands?: any, preferred_test_runner_profile?: any } | null | undefined} RecoveryVerify */
/** @typedef {{ pattern: string, root_cause: string, file_count: number }} FailurePatternInput */
/** @typedef {{ repoRoot: string, assetRoot: string, featureName: string, subject?: string | null, verifyCommands?: string[] }} DebugFixLoopOptions */
/** @param {string[] | null | undefined} commands */
function toCommandChecks(commands) {
  return Array.isArray(commands) ? commands.map((command) => ({ command })) : [];
}
/** @param {ProjectProfile} profile @param {ProjectMemory} memory @param {string} featureName @param {string | null | undefined} subject */
function buildInitialVars(profile, memory, featureName, subject) {
  const names = deriveNameVars(subject || featureName);
  return buildVarsFromMemory(profile, memory, {
    implementation_style: String(memory?.last_feature_generation?.implementation_style || memory.coding_style || 'functional').trim() || 'functional',
    shape_strategy: String(memory?.last_feature_generation?.shape_strategy || 'project-guided').trim() || 'project-guided',
  }, {
    ...names,
    name: featureName,
    subject: String(subject || names.pascal_name || featureName),
    feature_kind: 'crud',
    entrypoint: 'http',
    with_repository: 'true',
    with_test: 'true',
    with_docs: 'true',
  });
}
/** @param {string} repoRoot */
function inferInitialVerifyCommands(repoRoot) {
  /** @type {ProjectProfile} */
  const profile = detectProjectProfile(repoRoot);
  const structure = readOrAnalyzeProjectStructure(repoRoot, profile.runtime || undefined, { persist: true });
  /** @type {ProjectMemory} */
  const memory = readOrInferProjectMemory(repoRoot, profile, structure, { persist: true });
  const inferred = inferVerifyCommands(repoRoot, profile, memory, ['npm run build', 'npm run test'], { mode: process.env.CI ? 'ci' : 'default' });
  return Array.isArray(inferred && inferred.commands) ? inferred.commands : [];
}
/** @param {ProjectMemory} memory @param {FailurePatternInput} pattern */
function appendFailurePattern(memory, pattern) {
  const history = Array.isArray(memory.failure_patterns) ? memory.failure_patterns.slice(-9) : [];
  /** @type {ProjectMemory} */
  const next = {
    ...memory,
    failure_patterns: history,
  };
  history.push({
    pattern: pattern.pattern,
    root_cause: pattern.root_cause,
    file_count: pattern.file_count,
    timestamp: new Date().toISOString(),
  });
  return next;
}
/** @param {PlannedFeature} plan */
function enabledModuleIds(plan) {
  return (plan.ordered_modules || [])
    .map((moduleDef) => String(moduleDef.id || '').trim())
    .filter((id) => ['route', 'controller', 'service', 'repository', 'schema', 'test', 'docs'].includes(id));
}
/** @param {DebugFixLoopOptions} options */
function runDebugFixLoop({ repoRoot, assetRoot, featureName, subject, verifyCommands = [] }) {
  /** @type {ProjectProfile} */
  const profile = detectProjectProfile(repoRoot);
  const structure = readOrAnalyzeProjectStructure(repoRoot, profile.runtime || undefined, { persist: true });
  /** @type {ProjectMemory} */
  const memory = readOrInferProjectMemory(repoRoot, profile, structure, { persist: true });
  const persistedShapeStrategy = String(memory?.last_feature_generation?.shape_strategy || 'project-guided').trim() || 'project-guided';
  const persistedImplementationStyle = String(memory?.last_feature_generation?.implementation_style || memory.coding_style || 'functional').trim() || 'functional';
  /** @type {SkillRecord | null} */
  const skill = resolveSkill(assetRoot, 'generate-node-feature');
  if (!skill) throw new Error('Unable to resolve generate-node-feature skill');
  /** @type {FeatureActionLike | undefined} */
  const action = (skill.actions || []).find((item) => item.type === 'feature_bundle') || skill.actions[0];
  if (!action) throw new Error('generate-node-feature skill is missing feature_bundle action');
  const initialVars = buildInitialVars(profile, memory, featureName, subject);
  /** @type {PlannedFeature} */
  const plan = buildFeaturePlan({
    action,
    vars: initialVars,
    runtime: String(profile.runtime || 'node'),
    structure,
    planning: /** @type {LooseRecord} */ ({ implementation_style: persistedImplementationStyle }),
    memory: /** @type {LooseRecord} */ (memory),
  });
  /** @type {Record<string, string>} */
  const vars = {
    ...initialVars,
    ...flattenPathVars(plan.paths),
    feature_root: String(plan.paths.feature_root || ''),
    route_export_target: String(plan.route_export_target || ''),
    ...(plan.file_names || {}),
    ...(plan.imports || {}),
  };
  plan.vars = vars;
  const firstVerify = runVerifyCommands(repoRoot, verifyCommands);
  const firstFailureKinds = classifyFailureKinds(firstVerify);
  const taskRoute = recommendTaskRoute({ objective: `repair ${featureName}`, profile, latestFailures: firstFailureKinds.map((kind) => ({ kind })) });
  const intelligence = buildCodeIntelligence(repoRoot, `repair ${featureName}`, (plan.ordered_modules || []).map((moduleDef) => renderString(moduleDef.output || '', vars)).filter(Boolean));
  const changeSurface = buildChangeSurface(intelligence, intelligence.inferred_targets || []);
  const repairRecipe = recommendRepairRecipe({ failureKinds: firstFailureKinds, objective: `repair ${featureName}`, verifyCommands, route: taskRoute, changeSurface });
  if (firstVerify.ok) {
    persistFeatureMemoryUpdate(repoRoot, memory, {
      feature_name: featureName,
      implementation_style: persistedImplementationStyle,
      shape_strategy: persistedShapeStrategy,
      enabled_modules: enabledModuleIds(plan),
      preferred_test_command: Array.isArray(verifyCommands) ? verifyCommands.find((command) => /test|vitest|jest|mocha/.test(command)) || null : null,
      preferred_test_commands: memory.preferred_test_commands || null,
      preferred_test_runner_profile: memory.preferred_test_runner_profile || null,
    });
    return {
      ok: true,
      root_cause: 'no_failure_detected',
      files_edited: [],
      patch_strategy: 'none',
      verify_before: firstVerify,
      verify_after: firstVerify,
      repair_route: taskRoute,
      repair_recipe: repairRecipe,
      ...buildRepairExecutionSummary({ touchedFiles: [], repairRecipe, changeSurface, checks: toCommandChecks(verifyCommands), profile, relatedTests: [], latestFailures: firstFailureKinds.map((kind) => ({ kind })) }),
      failure_kinds: firstFailureKinds,
      failure_patterns_recorded: false,
    };
  }
  const failures = parseVerifyFailures(firstVerify.combined_output);
  const ciMode = Boolean(process.env.CI) || verifyCommands.some((command) => /watch/.test(String(command)));
  const coverageMode = verifyCommands.some((command) => /coverage/.test(String(command)));
  const recoveryMode = coverageMode ? 'coverage' : (ciMode ? 'ci' : 'default');
  const recoverySeed = coverageMode
    ? ['npm run build', 'npm run test:coverage']
    : ['npm run build', 'npm run test'];
  /** @type {RecoveryVerify} */
  const recoveryVerify = failures.script_failures.length > 0
    ? normalizeRecoveryCommands(
      inferVerifyCommands(repoRoot, profile, memory, recoverySeed, { ci_mode: ciMode, mode: recoveryMode }),
      verifyCommands,
      recoveryMode,
    )
    : null;
  if (recoveryVerify && Array.isArray(recoveryVerify.commands) && recoveryVerify.commands.length > 0 && recoveryVerify.commands.join('||') !== verifyCommands.join('||')) {
    const recovered = runVerifyCommands(repoRoot, recoveryVerify.commands);
    if (recovered.ok) {
      persistFeatureMemoryUpdate(repoRoot, memory, {
        feature_name: featureName,
        implementation_style: persistedImplementationStyle,
        shape_strategy: persistedShapeStrategy,
        enabled_modules: enabledModuleIds(plan),
        preferred_test_command: recoveryVerify.preferred_test_command || null,
        preferred_test_commands: recoveryVerify.preferred_test_commands,
        preferred_test_runner_profile: recoveryVerify.preferred_test_runner_profile,
      });
      return {
        ok: true,
        root_cause: 'missing_verify_script_recovered',
        files_edited: [],
        patch_strategy: 'recovered by switching verify commands to framework-aware fallback',
        verify_before: firstVerify,
        verify_after: recovered,
        verify_recovery: recoveryVerify,
        repair_route: taskRoute,
        repair_recipe: repairRecipe,
        ...buildRepairExecutionSummary({ touchedFiles: [], repairRecipe, changeSurface, checks: toCommandChecks(recoveryVerify.commands), profile, relatedTests: [], latestFailures: firstFailureKinds.map((kind) => ({ kind })) }),
        failure_kinds: firstFailureKinds,
        failure_patterns_recorded: false,
      };
    }
  }
  /** @type {Set<string>} */
  const filesToEdit = new Set();
  /** @type {Map<string, FeatureModuleLike>} */
  const availableOutputs = new Map();
  for (const moduleDef of plan.ordered_modules || []) {
    availableOutputs.set(renderString(moduleDef.output || '', vars), moduleDef);
  }
  for (const file of failures.file_mentions) {
    const rel = path.relative(repoRoot, path.resolve(repoRoot, file)).replace(/\\/g, '/');
    if (availableOutputs.has(rel)) filesToEdit.add(rel);
  }
  for (const problem of failures.import_failures) {
    const rel = path.relative(repoRoot, path.resolve(repoRoot, problem.file)).replace(/\\/g, '/');
    if (availableOutputs.has(rel)) filesToEdit.add(rel);
  }
  /** @type {string[]} */
  const edited = [];
  for (const rel of filesToEdit) {
    const moduleDef = availableOutputs.get(rel);
    if (!moduleDef || !moduleDef.output || !moduleDef.template) continue;
    const runnableModule = /** @type {{ template: string, output: string }} */ (moduleDef);
    edited.push(rerenderModule(repoRoot, skill, runnableModule, vars));
  }
  const updateEdits = applyPlannedUpdates(repoRoot, /** @type {{ updates?: Array<{ file?: string, content?: string, create_if_missing?: boolean, only_if_exists?: boolean }>, vars?: Record<string, string> }} */ (plan));
  edited.push(...updateEdits);
  const secondVerify = runVerifyCommands(repoRoot, verifyCommands);
  const rootCause = failures.import_failures.length > 0
    ? 'broken_local_imports'
    : (failures.script_failures.length > 0 ? 'missing_verify_script' : 'verify_failure_after_generation');
  const patchStrategy = failures.import_failures.length > 0
    ? 'rerender implicated generated modules and re-apply planned integration updates'
    : (failures.script_failures.length > 0
      ? 'record missing verify script failure and preserve generated outputs'
      : 're-apply planned integration updates and restore generated module outputs');
  if (!secondVerify.ok && failures.script_failures.length > 0) {
    /** @type {RecoveryVerify} */
    const lateRecovery = normalizeRecoveryCommands(
      inferVerifyCommands(repoRoot, profile, memory, recoverySeed, { ci_mode: ciMode, mode: recoveryMode }),
      verifyCommands,
      recoveryMode,
    );
    if (lateRecovery && Array.isArray(lateRecovery.commands) && lateRecovery.commands.length > 0 && lateRecovery.commands.join('||') !== verifyCommands.join('||')) {
      const recovered = runVerifyCommands(repoRoot, lateRecovery.commands);
      if (recovered.ok) {
        const dedupedEdits = Array.from(new Set(edited)).sort((a, b) => a.localeCompare(b));
        persistFeatureMemoryUpdate(repoRoot, memory, {
          feature_name: featureName,
          implementation_style: persistedImplementationStyle,
          shape_strategy: persistedShapeStrategy,
          enabled_modules: enabledModuleIds(plan),
          preferred_test_command: lateRecovery.preferred_test_command || null,
          preferred_test_commands: lateRecovery.preferred_test_commands,
          preferred_test_runner_profile: lateRecovery.preferred_test_runner_profile,
        });
        return {
          ok: true,
          root_cause: 'missing_verify_script_recovered',
          files_edited: dedupedEdits,
          patch_strategy: 'recovered by switching verify commands to framework-aware fallback after update replay',
          verify_before: firstVerify,
          verify_after: recovered,
          verify_recovery: lateRecovery,
          repair_route: taskRoute,
          repair_recipe: repairRecipe,
          ...buildRepairExecutionSummary({ touchedFiles: dedupedEdits, repairRecipe, changeSurface, checks: toCommandChecks(verifyCommands), profile, relatedTests: [], latestFailures: firstFailureKinds.map((kind) => ({ kind })) }),
          failure_kinds: firstFailureKinds,
          failure_patterns_recorded: false,
        };
      }
    }
  }
  let failureRecorded = false;
  if (secondVerify.ok) {
    persistFeatureMemoryUpdate(repoRoot, memory, {
      feature_name: featureName,
      implementation_style: persistedImplementationStyle,
      shape_strategy: persistedShapeStrategy,
      enabled_modules: enabledModuleIds(plan),
      preferred_test_command: Array.isArray(verifyCommands) ? verifyCommands.find((command) => /test|vitest|jest|mocha/.test(command)) || null : null,
      preferred_test_commands: memory.preferred_test_commands || null,
      preferred_test_runner_profile: memory.preferred_test_runner_profile || null,
    });
  } else {
    const pattern = failures.import_failures.length > 0
      ? 'cannot-find-module'
      : (failures.script_failures.some((item) => item.kind === 'missing_build_script')
        ? 'missing-build-script'
        : (failures.script_failures.some((item) => item.kind === 'missing_test_script') ? 'missing-test-script' : 'verify-failed'));
    const failedMemory = appendFailurePattern(memory, {
      pattern,
      root_cause: rootCause,
      file_count: edited.length,
    });
    persistFeatureMemoryUpdate(repoRoot, failedMemory, {
      status: 'failure',
      feature_name: featureName,
      implementation_style: persistedImplementationStyle,
      shape_strategy: persistedShapeStrategy,
      enabled_modules: enabledModuleIds(plan),
      failure_patterns: failedMemory.failure_patterns || null,
    });
    failureRecorded = true;
  }
  const finalTouched = Array.from(new Set(edited)).sort((a, b) => a.localeCompare(b));
  return {
    ok: secondVerify.ok,
    root_cause: rootCause,
    files_edited: finalTouched,
    patch_strategy: patchStrategy,
    verify_before: firstVerify,
    verify_after: secondVerify,
    repair_route: taskRoute,
    repair_recipe: repairRecipe,
    ...buildRepairExecutionSummary({ touchedFiles: finalTouched, repairRecipe, changeSurface, checks: toCommandChecks(verifyCommands), profile, relatedTests: [], latestFailures: firstFailureKinds.map((kind) => ({ kind })) }),
    failure_kinds: firstFailureKinds,
    failure_patterns_recorded: failureRecorded,
  };
}
module.exports = {
  parseVerifyFailures,
  runVerifyCommands,
  runDebugFixLoop,
  inferInitialVerifyCommands,
  classifyFailureKinds,
  recommendRepairRecipe,
};
