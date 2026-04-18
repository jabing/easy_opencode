// @ts-nocheck
const fs = require('fs');
const path = require('path');
const { detectProjectProfile } = require('../../project-profile.js');
const { assessBenchmarkFeedback } = require('../../benchmark/feedback.js');
const { buildVerifySuggestions } = require('../../verification/suggestions.js');
const { buildFeaturePlan } = require('../../feature/plan.js');
const { runFeatureBundle } = require('../../feature/bundle.js');
const { readOrAnalyzeProjectStructure } = require('../../project/structure.js');
const { readOrInferProjectMemory, persistFeatureMemoryUpdate } = require('../../project/memory.js');
const { writeFeaturePlan } = require('../../feature/artifacts.js');
const { deriveGenerationHints, derivePlanningHints } = require('../../feature/feedback.js');
const { inferFeatureSemantics } = require('../../feature/intelligence.js');
const { runFeatureVerifyPlanning } = require('../../feature/verify.js');
const { ensureDirForFile } = require('../../../shared/fs.js');
const { applyActionUpdates } = require('./updates.js');
const { renderString, buildInputDefaults, buildRuntimeVars, missingPlaceholders, withPathVars, deriveContextVars, deriveNameVariants } = require('./naming.js');

function resolveExecutionRoot(projectRoot, structure, profile) {
  if (!structure || String(structure.repo_shape || '') !== 'workspace-package-local') return { root: projectRoot, profile };
  const workspaceRoot = String(structure.workspace_root || '').trim();
  if (!workspaceRoot || workspaceRoot === '.') return { root: projectRoot, profile };
  const executionRoot = path.resolve(projectRoot, workspaceRoot);
  if (!fs.existsSync(path.join(executionRoot, 'package.json'))) return { root: projectRoot, profile };
  return { root: executionRoot, profile: detectProjectProfile(executionRoot) };
}

function selectAction(skill, runtime, requestedId) {
  const actions = Array.isArray(skill.actions) ? skill.actions : [];
  let candidates = actions;
  if (requestedId) candidates = candidates.filter((action) => String(action.id || '') === String(requestedId));
  const runtimeMatches = candidates.filter((action) => {
    if (!action.when || !action.when.runtime) return true;
    const allowed = Array.isArray(action.when.runtime) ? action.when.runtime : [action.when.runtime];
    return allowed.includes(runtime);
  });
  return runtimeMatches[0] || candidates[0] || null;
}

function inferFileRole(fileDef) {
  if (fileDef && fileDef.role) return String(fileDef.role);
  const output = String((fileDef && fileDef.output) || '').split(path.sep).join('/').toLowerCase();
  if (fileDef && fileDef.primary) return 'primary';
  if (output.includes('/tests/') || output.startsWith('tests/') || output.endsWith('.test.ts') || output.endsWith('.test.js') || output.endsWith('_test.go') || output.endsWith('_test.py') || output.startsWith('src/test/')) return 'test';
  if (output.startsWith('.opencode/task-bundles/')) return 'guide';
  if (output.startsWith('docs/')) return 'docs';
  if (output.includes('/service') || output.includes('_service.') || output.endsWith('.service.ts') || output.endsWith('service.java')) return 'support';
  if (output.includes('mount') || output.includes('wiring') || output.endsWith('_routes.go')) return 'support';
  return 'support';
}

function buildTemplateFiles(action) {
  if (Array.isArray(action.files) && action.files.length > 0) return action.files.map((file) => ({ ...file, role: inferFileRole(file) }));
  if (action.template || action.default_output || action.output) {
    return [{ template: action.template, output: action.output || action.default_output, role: 'primary' }];
  }
  return [];
}

function filterTemplateFiles(files, bundleMode) {
  const mode = String(bundleMode || 'full');
  if (mode === 'full') return files;
  if (mode === 'minimal') return files.filter((file) => ['primary', 'test', 'guide'].includes(file.role));
  if (mode === 'standard') return files.filter((file) => file.role !== 'docs');
  return files;
}

function resolveScaffoldPolicy(opts = {}) {
  const strategyBias = String(opts.strategyBias || 'balanced');
  let bundleMode = String(opts.bundleMode || 'auto');
  let integrationMode = String(opts.integrationMode || 'auto');
  if (bundleMode === 'auto') {
    if (strategyBias === 'conservative') bundleMode = 'minimal';
    else if (strategyBias === 'accelerated') bundleMode = 'full';
    else bundleMode = 'standard';
  }
  if (integrationMode === 'auto') {
    if (strategyBias === 'conservative') integrationMode = 'plan';
    else integrationMode = 'apply';
  }
  return { strategy_bias: strategyBias, bundle_mode: bundleMode, integration_mode: integrationMode };
}

function toMap(pairs) {
  const out = {};
  for (const pair of pairs || []) {
    const idx = String(pair).indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1);
    if (key) out[key] = value;
  }
  return out;
}

function renderActionOutputs(skill, action, projectRoot, profile, runtime, vars, opts, policy) {
  const templateFiles = filterTemplateFiles(buildTemplateFiles(action), policy.bundle_mode);
  if (templateFiles.length === 0) throw new Error(`Skill ${skill.name} action ${action.id || 'default'} has no templates after applying bundle mode ${policy.bundle_mode}`);
  const outputs = [];
  const missingValues = [];
  for (const fileDef of templateFiles) {
    const templatePath = path.join(skill.base, 'templates', fileDef.template);
    if (!fs.existsSync(templatePath)) throw new Error(`Missing template: ${templatePath}`);
    const templateBody = fs.readFileSync(templatePath, 'utf8');
    const outputRel = renderString(fileDef.output || '', vars);
    const renderedBody = renderString(templateBody, vars);
    missingValues.push(outputRel, renderedBody);
    outputs.push({ template: fileDef.template, output: outputRel, body: renderedBody, primary: Boolean(fileDef.primary), role: fileDef.role || inferFileRole(fileDef) });
  }
  const missing = missingPlaceholders(vars, missingValues);
  if (missing.length > 0) throw new Error(`Missing template variables: ${missing.join(', ')}`);

  const result = {
    skill: skill.name,
    runtime: vars.runtime,
    dry_run: Boolean(opts['dry-run']),
    outputs: outputs.map((item) => item.output),
    output_roles: outputs.map((item) => ({ output: item.output, role: item.role })),
    verify: buildVerifySuggestions(skill.verify, profile, runtime),
    updates: [],
    scaffold_policy: policy,
    execution_model: {
      template_generation: true,
      structured_integration: Array.isArray(action.updates) && action.updates.length > 0,
      locator_aware_integration: Array.isArray(action.updates) && action.updates.some((item) => item && (item.locator || item.target_locator)),
      action_type: String(action.type || 'template_bundle'),
    },
  };
  result.output = result.outputs[0] || null;

  for (const file of outputs) {
    const absOut = path.resolve(projectRoot, file.output);
    if (fs.existsSync(absOut) && !opts.force && !opts['dry-run']) {
      throw new Error(`Refusing to overwrite existing file: ${file.output}. Pass --force to overwrite.`);
    }
  }
  if (opts.json) result.preview = outputs.map((item) => ({ output: item.output, body: item.body, role: item.role }));
  if (!opts['dry-run']) {
    for (const file of outputs) {
      const absOut = path.resolve(projectRoot, file.output);
      ensureDirForFile(absOut);
      fs.writeFileSync(absOut, file.body, 'utf8');
    }
  }
  result.updates = applyActionUpdates(action, projectRoot, vars, opts, policy.integration_mode);
  if (result.updates.some((item) => item.status === 'updated' || item.status === 'created')) result.integration_status = 'applied';
  else if (result.updates.some((item) => item.status === 'would_apply')) result.integration_status = 'planned';
  else if (result.updates.length > 0) result.integration_status = result.updates.every((item) => item.status === 'already_present') ? 'already_present' : 'skipped';
  else result.integration_status = 'none';
  return result;
}

function scaffoldSkill(root, skill, opts) {
  const projectRoot = path.resolve(opts.root || process.cwd());
  const baseProfile = detectProjectProfile(projectRoot);
  const runtime = String(opts.runtime || baseProfile.runtime || 'unknown');
  const action = selectAction(skill, runtime, opts.template);
  if (!action) throw new Error(`Skill ${skill.name} has no executable actions for runtime ${runtime}`);
  if (!['template_scaffold', 'template_bundle', 'feature_bundle', 'locator_template_bundle', 'structured_patch_bundle'].includes(action.type)) throw new Error(`Unsupported action type: ${action.type}`);
  const structureContext = readOrAnalyzeProjectStructure(projectRoot, runtime, { persist: true });
  const { root: executionRoot, profile } = resolveExecutionRoot(projectRoot, structureContext, baseProfile);
  const benchmarkFeedback = opts['benchmark-aware'] ? assessBenchmarkFeedback(projectRoot, {
    objective: opts.objective || skill.name,
    runtime: profile.runtime,
    framework: profile.framework,
    skill: skill.name,
    task_family: skill.task_family || null,
    limit: opts['benchmark-limit'] || undefined,
  }) : null;
  let policy = resolveScaffoldPolicy({
    strategyBias: opts['strategy-bias'] || (benchmarkFeedback ? benchmarkFeedback.strategy_bias : null),
    bundleMode: opts['bundle-mode'] || 'auto',
    integrationMode: opts['integration-mode'] || 'auto',
  });
  const userVars = toMap(opts.var);
  let vars = deriveContextVars({ ...buildInputDefaults(skill), ...buildRuntimeVars(profile, projectRoot), ...userVars });
  if (userVars.package_name && !userVars.package_path) vars.package_path = String(userVars.package_name).replace(/\./g, '/');
  if (opts.out) action.files = [{ template: action.template, output: String(opts.out), primary: true }];

  if (action.type === 'feature_bundle') {
    const structure = structureContext;
    const memory = readOrInferProjectMemory(projectRoot, profile, structure, { persist: true });
    const feedback = deriveGenerationHints(memory);
    const semantic = inferFeatureSemantics({ featureName: vars.kebab_name || vars.name || vars.subject || '', featureKind: vars.feature_kind || 'crud', subject: vars.subject || vars.name || '', memory, profile });
    const planning = derivePlanningHints(executionRoot, profile, memory, userVars, semantic);
    if (userVars.with_test === undefined) vars.with_test = String(Boolean(planning.with_test));
    if (userVars.with_docs === undefined) vars.with_docs = String(Boolean(planning.with_docs));
    if (userVars.with_repository === undefined) vars.with_repository = String(Boolean(planning.with_repository));
    if (!opts['integration-mode']) policy = { ...policy, integration_mode: planning.integration_mode };
    vars = {
      ...vars,
      'project.coding_style': memory.coding_style || 'functional',
      'project.api_style': memory.api_style || 'rest',
      'project.test_framework': memory.test_framework || profile.test_runner || 'unknown',
      'project.validation_lib': memory.validation_lib || 'unknown',
      'project.orm': memory.orm || 'unknown',
      'project.auth_strategy': memory.auth_strategy || 'unknown',
      'project.error_pattern': memory.error_pattern || 'standard-errors',
      'project.naming.file_case': (memory.naming || {}).file_case || 'kebab',
      'project.preferred_feature_shape': Array.isArray(memory.preferred_feature_shape) ? memory.preferred_feature_shape.join(',') : '',
      'project.generation_safe_mode': String(Boolean(feedback.safe_mode)),
      'project.import_repair_bias': feedback.import_repair_bias,
      'project.verify_bias': feedback.verify_bias,
      'project.implementation_style': planning.implementation_style || feedback.implementation_style,
      'project.schema_style': planning.schema_style || feedback.schema_style,
      'project.route_style': planning.route_style || feedback.route_style,
      'project.auth_mode': planning.auth_mode || feedback.auth_mode,
      'project.repository_style': planning.repository_style || feedback.repository_style,
      'project.error_style': planning.error_style || feedback.error_style,
      'project.test_template_style': planning.test_template_style || feedback.test_template_style,
      'project.shared_error_integration': (memory.shared_error_module && memory.shared_error_module.class_name && memory.shared_error_module.module_path) ? `${memory.shared_error_module.class_name}@${memory.shared_error_module.module_path}` : 'feature-local',
      'project.shape_strategy': planning.shape_strategy,
      'project.preferred_test_command': memory.preferred_test_command || '',
      'project.preferred_test_command_ci': memory.preferred_test_commands?.ci || memory.preferred_test_command || '',
      'project.preferred_test_command_watch': memory.preferred_test_commands?.watch || '',
      'project.preferred_test_command_coverage': memory.preferred_test_commands?.coverage || '',
      'project.global_error_handler_integration': (memory.global_error_middleware && memory.global_error_middleware.symbol_name && memory.global_error_middleware.module_path) ? `${memory.global_error_middleware.symbol_name}@${memory.global_error_middleware.module_path}` : 'none-detected',
      'project.app_entrypoint_integration': (memory.app_entrypoint && memory.app_entrypoint.module_path) ? `${memory.app_entrypoint.module_path}${memory.app_entrypoint.registers_global_error_handler ? ' (registered)' : ' (not-registered)'}` : 'none-detected',
      'project.preferred_test_runner_profile': memory.preferred_test_runner_profile ? JSON.stringify(memory.preferred_test_runner_profile) : '{}',
      'project.semantic.family': semantic.family || 'general',
      'project.semantic.route_namespace': semantic.route_namespace || `/${vars.kebab_name || vars.name || 'feature'}`,
      'project.semantic.auth_required': String(Boolean(semantic.auth_required)),
      'project.semantic.domain_key': semantic.domain_key || vars.kebab_name || vars.name || 'feature',
      'project.semantic.operations': Array.isArray(semantic.operation_hints) ? semantic.operation_hints.join(',') : '',
      'project.plan_mode': planning.plan_mode,
      'project.verify_preference': planning.verify_preference,
      'project.plan_with_test': String(Boolean(planning.with_test)),
      'project.plan_with_docs': String(Boolean(planning.with_docs)),
      'project.plan_with_repository': String(Boolean(planning.with_repository)),
      'project.plan_adjustment_reasons': planning.reasons.join('; '),
    };
    const plan = buildFeaturePlan({ action, vars, runtime, structure, memory, planning });
    vars = withPathVars(vars, plan.paths);
    vars.route_export_target = plan.route_export_target;
    Object.assign(vars, plan.file_names || {}, plan.imports || {}, plan.template_vars || {});
    if (vars.paths && vars.paths.feature_root && !vars.feature_root) vars.feature_root = vars.paths.feature_root;
    const result = runFeatureBundle({ root: projectRoot, skill, action, vars, plan, dryRun: Boolean(opts['dry-run']), force: Boolean(opts.force), json: Boolean(opts.json), integrationMode: policy.integration_mode });
    const verifySeed = buildVerifySuggestions(skill.verify, profile, runtime);
    const verifyFeedback = runFeatureVerifyPlanning(projectRoot, profile, memory, verifySeed).feedback;
    result.verify = verifyFeedback.commands;
    result.verify_schema = verifyFeedback.schema;
    result.feature_feedback = verifyFeedback;
    result.feature_planning = planning;
    result.project_structure = structure;
    let persistedMemory = memory;
    if (!result.dry_run) {
      const featureName = vars.kebab_name || vars.name || vars.subject;
      const planPayload = {
        schema_version: '1.0',
        feature_name: featureName,
        goal: vars.subject || featureName,
        runtime,
        project_profile: { runtime: profile.runtime || 'unknown', language: profile.language || 'unknown', framework: profile.framework || 'unknown', repo_shape: profile.repo_shape || 'unknown' },
        project_structure: structure,
        project_memory: { coding_style: memory.coding_style || null, api_style: memory.api_style || null, test_framework: memory.test_framework || null, naming: memory.naming || {}, preferred_feature_shape: memory.preferred_feature_shape || [] },
        planning,
        semantic,
        files_to_generate: Array.isArray(result.outputs) ? result.outputs : [],
        updates_to_apply: Array.isArray(result.updates) ? result.updates : [],
        dependency_graph: result.dependency_graph || {},
        verify_commands: verifyFeedback.commands,
        verify_schema: verifyFeedback.schema || null,
        integration: result.integration_summary || null,
      };
      result.feature_plan = path.relative(projectRoot, writeFeaturePlan(projectRoot, featureName, planPayload)).split(path.sep).join('/');
      persistedMemory = persistFeatureMemoryUpdate(projectRoot, memory, {
        feature_name: featureName,
        implementation_style: planning.implementation_style || feedback.implementation_style,
        shape_strategy: planning.shape_strategy,
        enabled_modules: (plan.ordered_modules || []).map((moduleDef) => String(moduleDef.id || '').trim()).filter((id) => ['route', 'controller', 'service', 'repository', 'schema', 'test', 'docs'].includes(id)),
        preferred_test_command: verifyFeedback.preferred_test_command,
        preferred_test_commands: verifyFeedback.preferred_test_commands,
        preferred_test_runner_profile: verifyFeedback.preferred_test_runner_profile,
        plan_path: result.feature_plan || null,
        integration_note_path: result.integration_note || null,
        integration_json_path: result.integration_json || null,
        semantic,
      });
    }
    result.project_memory = persistedMemory;
    result.scaffold_policy = policy;
    if (result.updates.some((item) => item.status === 'updated' || item.status === 'created')) result.integration_status = 'applied';
    else if (result.updates.some((item) => item.status === 'would_apply')) result.integration_status = 'planned';
    else if (result.updates.length > 0) result.integration_status = result.updates.every((item) => item.status === 'already_present') ? 'already_present' : 'skipped';
    else result.integration_status = 'none';
    if (benchmarkFeedback) result.benchmark_feedback = benchmarkFeedback;
    return { result, profile, runtime, policy };
  }

  const result = renderActionOutputs(skill, action, projectRoot, profile, runtime, vars, opts, policy);
  if (benchmarkFeedback) result.benchmark_feedback = benchmarkFeedback;
  return { result, profile, runtime, policy };
}

function formatScaffoldOutput({ result, skill, runtime, policy }) {
  if (result.dry_run === undefined) result.dry_run = false;
  if (result.json) return null;
  const created = result.outputs.length === 1 ? result.output : result.outputs.join(', ');
  const lines = [
    `[skill-runner] scaffolded ${created} with ${skill.name} (${runtime})`,
    `[skill-runner] scaffold policy: ${policy.strategy_bias} / bundle=${policy.bundle_mode} / integration=${policy.integration_mode}`,
  ];
  const verifySuggestions = Array.isArray(result.verify) ? result.verify : [];
  if (verifySuggestions.length) {
    lines.push('[skill-runner] verify suggestions:');
    for (const step of verifySuggestions) lines.push(`- ${step}`);
  }
  return lines.join('\n');
}

module.exports = {
  resolveExecutionRoot,
  selectAction,
  inferFileRole,
  buildTemplateFiles,
  filterTemplateFiles,
  resolveScaffoldPolicy,
  toMap,
  renderActionOutputs,
  scaffoldSkill,
  formatScaffoldOutput,
};
