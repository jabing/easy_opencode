#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { detectProjectProfile } = require('../src/core/project-profile.js');
const { readOrAnalyzeProjectStructure, buildFeaturePaths } = require('../src/core/project/structure.js');
const { readOrInferProjectMemory, persistFeatureMemoryUpdate } = require('../src/core/project/memory.js');
const { writeFeaturePlan } = require('../src/core/feature/artifacts.js');
const { deriveGenerationHints, derivePlanningHints } = require('../src/core/feature/feedback.js');
const { inferFeatureSemantics } = require('../src/core/feature/intelligence.js');
const { runFeatureVerifyPlanning } = require('../src/core/feature/verify.js');
const { buildFeatureSupportSummary, listFeatureProviders, selectFeatureProvider } = require('../src/core/feature/providers.js');

function parseArgs(argv) {
  const opts = { _: [], var: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (key === 'var') {
      if (!next || next.startsWith('--')) throw new Error('Missing value for --var');
      opts.var.push(next);
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


function resolveExecutionRoot(projectRoot, structure, profile) {
  if (!structure || String(structure.repo_shape || '') !== 'workspace-package-local') return { root: projectRoot, profile };
  const workspaceRoot = String(structure.workspace_root || '').trim();
  if (!workspaceRoot || workspaceRoot === '.') return { root: projectRoot, profile };
  const executionRoot = path.resolve(projectRoot, workspaceRoot);
  if (!fs.existsSync(path.join(executionRoot, 'package.json'))) return { root: projectRoot, profile };
  return { root: executionRoot, profile: detectProjectProfile(executionRoot) };
}

function runJsonCommand(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
    env: options.env,
  });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || '').trim() || `${path.basename(String(command))} failed`);
  }
  try {
    return JSON.parse(String(result.stdout || '{}'));
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${path.basename(String(command))}: ${error.message}`);
  }
}


function formatProviderSummary(providers) {
  return (providers || [])
    .map((provider) => `${provider.runtime}${provider.frameworks && provider.frameworks.length ? ` [${provider.frameworks.join(', ')}]` : ''}`)
    .join('; ');
}

function printProviderCatalog(providers, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify({ providers }, null, 2)}
`);
    return;
  }
  process.stdout.write(`[generate-feature] providers: ${formatProviderSummary(providers)}
`);
}

function main() {
  const opts = parseArgs(process.argv);
  const featureName = String(opts._[0] || opts.name || '').trim();
  const assetRoot = path.resolve(__dirname, '..');
  if (!featureName && (opts.providers || opts['list-providers'])) return printProviderCatalog(listFeatureProviders(), Boolean(opts.json));
  if (!featureName) throw new Error('Feature name is required. Example: node scripts/generate-feature.js user-auth');
  const projectRoot = path.resolve(opts.root || process.cwd());
  const baseProfile = detectProjectProfile(projectRoot);
  const runtime = String(baseProfile.runtime || 'unknown');
  const featureSupport = buildFeatureSupportSummary(assetRoot, baseProfile);
  const selectedProvider = selectFeatureProvider(baseProfile);
  if (!selectedProvider) {
    throw new Error(`Feature generation has no tier1 provider for runtime=${runtime} framework=${String(baseProfile.framework || 'unknown')}. Supported primary providers: ${formatProviderSummary(featureSupport.providers)}`);
  }

  const structure = readOrAnalyzeProjectStructure(projectRoot, runtime, {
    refresh: Boolean(opts.refresh),
    persist: true,
  });
  const { root: executionRoot, profile } = resolveExecutionRoot(projectRoot, structure, baseProfile);
  const paths = buildFeaturePaths(structure, { name: featureName, kebab_name: featureName });
  const memory = readOrInferProjectMemory(projectRoot, profile, structure, {
    refresh: Boolean(opts.refresh),
    persist: true,
  });
  const feedback = deriveGenerationHints(memory);
  const semantic = inferFeatureSemantics({ featureName, featureKind: opts['feature-kind'] || opts.feature_kind || 'crud', subject: opts.subject || featureName, memory, profile });
  const requestedPlanning = {};
  if (opts['with-test'] !== undefined || opts.with_test !== undefined) requestedPlanning.with_test = opts['with-test'] || opts.with_test;
  if (opts['with-docs'] !== undefined || opts.with_docs !== undefined) requestedPlanning.with_docs = opts['with-docs'] || opts.with_docs;
  if (opts['with-repository'] !== undefined || opts.with_repository !== undefined) requestedPlanning.with_repository = opts['with-repository'] || opts.with_repository;
  if (opts['integration-mode'] !== undefined || opts.integration_mode !== undefined) requestedPlanning.integration_mode = opts['integration-mode'] || opts.integration_mode;
  const planning = derivePlanningHints(executionRoot, profile, memory, requestedPlanning, semantic);

  const featurePlanPayload = {
    schema_version: '1.0',
    feature_name: featureName,
    goal: opts.subject || featureName,
    runtime,
    project_profile: {
      runtime: profile.runtime || 'unknown',
      language: profile.language || 'unknown',
      framework: profile.framework || 'unknown',
      repo_shape: profile.repo_shape || 'unknown',
    },
    project_structure: structure,
    project_memory: {
      coding_style: memory.coding_style || null,
      api_style: memory.api_style || null,
      test_framework: memory.test_framework || null,
      naming: memory.naming || {},
      preferred_feature_shape: memory.preferred_feature_shape || [],
    },
    planning,
    semantic,
    feature_support: {
      detected: featureSupport.detected,
      selected_provider: featureSupport.selected_provider,
      supported_runtimes: featureSupport.supported_runtimes,
      provider_count: featureSupport.provider_count,
    },
  };

  const skillRunnerArgs = [
    path.join(assetRoot, 'scripts', 'skill-runner.js'),
    'scaffold',
    selectedProvider.skill,
    '--root', projectRoot,
    '--var', `name=${featureName}`,
    '--var', `subject=${opts.subject || featureName}`,
    '--var', `feature_kind=${opts['feature-kind'] || opts.feature_kind || 'crud'}`,
    '--var', `entrypoint=${opts.entrypoint || 'http'}`,
    '--var', `with_repository=${String(Boolean(planning.with_repository))}`,
    '--var', `with_test=${String(Boolean(planning.with_test))}`,
    '--var', `with_docs=${String(Boolean(planning.with_docs))}`,
    '--var', `paths.controller=${paths.controller}`,
    '--var', `paths.service=${paths.service}`,
    '--var', `paths.repository=${paths.repository}`,
    '--var', `paths.schema=${paths.schema}`,
    '--var', `paths.route=${paths.route}`,
    '--var', `paths.test=${paths.test}`,
    '--var', `paths.docs=${paths.docs}`,
    '--var', `paths.route_index=${paths.route_index}`,
    '--var', `paths.docs_index=${paths.docs_index}`,
    '--var', `feature_root=${paths.feature_root}`,
    '--var', `runtime=${runtime}`,
    '--var', `framework=${profile.framework || runtime}`,
    '--var', `project.coding_style=${memory.coding_style || 'functional'}`,
    '--var', `project.api_style=${memory.api_style || 'rest'}`,
    '--var', `project.test_framework=${memory.test_framework || profile.test_runner || 'unknown'}`,
    '--var', `project.validation_lib=${memory.validation_lib || 'unknown'}`,
    '--var', `project.orm=${memory.orm || 'unknown'}`,
    '--var', `project.go_module_path=${(profile.signals && profile.signals.module_path) || ''}`,
    '--var', `project.auth_strategy=${memory.auth_strategy || 'unknown'}`,
    '--var', `project.error_pattern=${memory.error_pattern || 'standard-errors'}`,
    '--var', `project.naming.file_case=${(memory.naming && memory.naming.file_case) || 'kebab'}`,
    '--var', `project.generation_safe_mode=${String(Boolean(feedback.safe_mode))}`,
    '--var', `project.import_repair_bias=${feedback.import_repair_bias}`,
    '--var', `project.verify_bias=${feedback.verify_bias}`,
    '--var', `project.implementation_style=${planning.implementation_style || feedback.implementation_style}`,
    '--var', `project.schema_style=${planning.schema_style || feedback.schema_style}`,
    '--var', `project.route_style=${planning.route_style || feedback.route_style}`,
    '--var', `project.auth_mode=${planning.auth_mode || feedback.auth_mode}`,
    '--var', `project.repository_style=${planning.repository_style || feedback.repository_style}`,
    '--var', `project.error_style=${planning.error_style || feedback.error_style}`,
    '--var', `project.test_template_style=${planning.test_template_style || feedback.test_template_style}`,
    '--var', `project.shape_strategy=${planning.shape_strategy}`,
    '--var', `project.preferred_test_command=${memory.preferred_test_command || ''}`,
    '--var', `project.global_error_handler_integration=${(memory.global_error_middleware && memory.global_error_middleware.symbol_name && memory.global_error_middleware.module_path) ? `${memory.global_error_middleware.symbol_name}@${memory.global_error_middleware.module_path}` : 'none-detected'}`,
    '--var', `project.plan_mode=${planning.plan_mode}`,
    '--var', `project.verify_preference=${planning.verify_preference}`,
    '--var', `project.plan_with_test=${String(Boolean(planning.with_test))}`,
    '--var', `project.plan_with_docs=${String(Boolean(planning.with_docs))}`,
    '--var', `project.plan_with_repository=${String(Boolean(planning.with_repository))}`,
    '--var', `project.plan_adjustment_reasons=${planning.reasons.join('; ')}`,
    '--var', `project.verify_runner_mode=${planning.verify_runner_mode || 'single-mode'}`,
    '--var', `project.preferred_test_command_ci=${memory.preferred_test_commands?.ci || memory.preferred_test_command || ''}`,
    '--var', `project.preferred_test_command_watch=${memory.preferred_test_commands?.watch || ''}`,
    '--var', `project.preferred_test_command_coverage=${memory.preferred_test_commands?.coverage || ''}`,
    '--var', `project.app_entrypoint_integration=${(memory.app_entrypoint && memory.app_entrypoint.module_path) ? `${memory.app_entrypoint.module_path}${memory.app_entrypoint.registers_global_error_handler ? ' (registered)' : ' (not-registered)'}` : 'none-detected'}`,
    '--var', `project.preferred_test_runner_profile=${memory.preferred_test_runner_profile ? JSON.stringify(memory.preferred_test_runner_profile) : '{}'}`,
    '--var', `project.semantic.family=${semantic.family || 'general'}`,
    '--var', `project.semantic.route_namespace=${semantic.route_namespace || '/' + featureName}`,
    '--var', `project.semantic.auth_required=${String(Boolean(semantic.auth_required))}`,
    '--var', `project.semantic.domain_key=${semantic.domain_key || featureName}`,
    '--var', `project.semantic.operations=${(semantic.operation_hints || []).join(',')}`,
  ];
  if (opts['dry-run']) skillRunnerArgs.push('--dry-run');
  if (opts.force) skillRunnerArgs.push('--force');
  if (opts['integration-mode'] || opts.integration_mode) {
    skillRunnerArgs.push('--integration-mode', opts['integration-mode'] || opts.integration_mode);
  } else if (planning.integration_mode) {
    skillRunnerArgs.push('--integration-mode', planning.integration_mode);
  }
  skillRunnerArgs.push('--json');

  const env = { ...process.env, EOC_ASSET_ROOT: assetRoot };
  const result = runJsonCommand(process.execPath, skillRunnerArgs, { cwd: assetRoot, env });
  result.feature_provider = {
    id: selectedProvider.id,
    skill: selectedProvider.skill,
    support_tier: selectedProvider.support_tier,
    runtime: selectedProvider.runtime,
    frameworks: selectedProvider.frameworks,
    delivery: selectedProvider.delivery,
  };
  result.feature_support = {
    detected: featureSupport.detected,
    selected_provider: featureSupport.selected_provider,
    supported_runtimes: featureSupport.supported_runtimes,
    provider_count: featureSupport.provider_count,
  };
  if (!opts['dry-run']) {
    featurePlanPayload.files_to_generate = Array.isArray(result.outputs) ? result.outputs : [];
    featurePlanPayload.updates_to_apply = Array.isArray(result.updates) ? result.updates : [];
    featurePlanPayload.dependency_graph = result.dependency_graph || {};
    featurePlanPayload.verify_commands = Array.isArray(result.verify) ? result.verify : [];
    featurePlanPayload.verify_schema = result.verify_schema || null;
    featurePlanPayload.integration = result.integration_summary || null;
    result.feature_plan = path.relative(projectRoot, writeFeaturePlan(projectRoot, featureName, featurePlanPayload)).split(path.sep).join('/');
  }

  if (!opts['dry-run'] && !opts['skip-verify']) {
    const verifyCommands = Array.isArray(result.verify) ? result.verify : [];
    if (verifyCommands.length > 0) {
      const verifyScript = path.join(assetRoot, 'scripts', 'debug-fix-loop.js');
      const fixArgs = [verifyScript, '--root', projectRoot, '--feature', featureName, '--subject', opts.subject || featureName];
      for (const command of verifyCommands) fixArgs.push('--verify', command);
      const fixResult = runJsonCommand(process.execPath, fixArgs, { cwd: assetRoot, env });
      result.fix_loop = fixResult;
      result.verify_run = fixResult.verify_after;
      if (!fixResult.ok && !opts.json) {
        throw new Error(`Feature generated but verify/fix loop failed: ${fixResult.root_cause}`);
      }
    }
  }

  if (!opts['dry-run']) {
    const successful = !result.verify_run || Boolean(result.verify_run.ok);
    if (successful) {
      const nextMemory = persistFeatureMemoryUpdate(projectRoot, memory, {
        feature_name: featureName,
        implementation_style: planning.implementation_style || feedback.implementation_style,
        shape_strategy: planning.shape_strategy,
        enabled_modules: Array.isArray(result.preview)
          ? result.preview.map((item) => String(item.module || '').trim()).filter((item) => ['route', 'controller', 'service', 'repository', 'schema', 'test', 'docs'].includes(item))
          : [],
        preferred_test_command: result.feature_feedback && result.feature_feedback.preferred_test_command,
        preferred_test_commands: result.feature_feedback && result.feature_feedback.preferred_test_commands,
        preferred_test_runner_profile: result.feature_feedback && result.feature_feedback.preferred_test_runner_profile,
        plan_path: result.feature_plan || null,
        integration_note_path: result.integration_note || null,
        integration_json_path: result.integration_json || null,
        semantic,
      });
      result.project_memory = nextMemory;
    }
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
    return;
  }

  const created = Array.isArray(result.outputs) ? result.outputs.join(', ') : '';
  process.stdout.write(`[generate-feature] generated ${created}\n`);
  if (result.verify_run) {
    process.stdout.write(`[generate-feature] verify status: ${result.verify_run.ok ? 'passed' : 'failed'}\n`);
  }
  if (result.fix_loop && result.fix_loop.files_edited && result.fix_loop.files_edited.length > 0) {
    process.stdout.write(`[generate-feature] fix loop edited: ${result.fix_loop.files_edited.join(', ')}\n`);
  }
}

try {
  main();
} catch (error) {
  console.error(`[generate-feature] ${error.message}`);
  process.exit(1);
}
