// @ts-nocheck
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runRefactorOperation, describeProviders } = require('./service.js');
const { commandExists, resolveServerSpec, probeServerSpec } = require('./providers/lsp-backend.js');
const { buildSupportTierReport } = require('../support-tiers/report.js');

function withTempDir(prefix, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeFiles(rootDir, files) {
  for (const [relativePath, body] of Object.entries(files || {})) {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, body, 'utf8');
  }
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}


function buildEnvironmentSnapshot() {
  const javaHome = String(process.env.JAVA_HOME || '').trim();
  const jdtlsHome = String(process.env.EOC_JAVA_LSP_HOME || process.env.JDTLS_HOME || '').trim();
  return {
    go_binary_available: commandExists(process.env.GO || 'go'),
    gopls_binary_available: commandExists(process.env.EOC_GO_LSP_BIN || process.env.EOC_GO_LSP_COMMAND || 'gopls'),
    java_binary_available: commandExists(process.env.JAVA || 'java'),
    javac_binary_available: commandExists('javac'),
    maven_binary_available: commandExists('mvn'),
    gradle_binary_available: commandExists('gradle'),
    jdtls_binary_available: commandExists(process.env.EOC_JAVA_LSP_BIN || process.env.EOC_JAVA_LSP_COMMAND || 'jdtls'),
    java_home_configured: Boolean(javaHome),
    jdtls_home_configured: Boolean(jdtlsHome),
  };
}

function addUnique(target, value) {
  if (!value) return;
  if (!target.includes(value)) target.push(value);
}

function appendBlocker(blockers, kind, message) {
  blockers.push({ kind, message });
}

function buildLanguageClaimBlockers(language, report, environment) {
  const blockers = [];
  if (!report.production_harness_ready) appendBlocker(blockers, 'harness_missing', 'provider is missing the production-readiness harness');
  if (!report.server_available) {
    if (language === 'go' && environment.go_binary_available && !environment.gopls_binary_available) {
      appendBlocker(blockers, 'missing_real_server', 'Go toolchain is present but gopls is not installed or not discoverable');
    } else if (language === 'java' && environment.java_binary_available && !environment.jdtls_binary_available && !environment.jdtls_home_configured) {
      appendBlocker(blockers, 'missing_real_server', 'Java runtime is present but jdtls is not installed or JDTLS_HOME is not configured');
    } else {
      appendBlocker(blockers, 'server_unavailable', 'no runnable language server was discovered for this language');
    }
  }
  if (report.server_available && report.production_real_server_required && !report.real_server_detected) {
    appendBlocker(blockers, 'real_server_not_verified', 'a server was found, but it was not identified as a real production language server');
  }
  if (report.validation_attempted && !report.validation_passed) appendBlocker(blockers, 'scenario_matrix_incomplete', 'the production scenario matrix did not fully pass');
  if (report.validation_attempted && report.workspace_scope_guarded !== true) appendBlocker(blockers, 'workspace_scope_guard_missing', 'workspace scope guards were not confirmed during validation');
  if (report.validation_attempted && report.prepare_rename !== true) appendBlocker(blockers, 'prepare_rename_not_confirmed', 'prepareRename support was not confirmed during validation');
  return blockers;
}

function buildLanguageNextActions(language, report, environment) {
  const actions = [];
  if (!report.server_available) {
    if (language === 'go') {
      if (!environment.gopls_binary_available) addUnique(actions, 'Install gopls and expose it on PATH or set EOC_GO_LSP_BIN.');
      if (!environment.go_binary_available) addUnique(actions, 'Install the Go toolchain so gopls can be provisioned and run.');
    } else if (language === 'java') {
      if (!environment.jdtls_binary_available && !environment.jdtls_home_configured) addUnique(actions, 'Install jdtls or set JDTLS_HOME / EOC_JAVA_LSP_HOME to a valid launcher layout.');
      if (!environment.java_binary_available) addUnique(actions, 'Install a Java runtime so jdtls can be launched.');
      if (!environment.javac_binary_available) addUnique(actions, 'Install a Java compiler (javac) to validate real-project fixtures more reliably.');
    }
  }
  if (report.server_available && report.production_real_server_required && !report.real_server_detected) addUnique(actions, 'Replace fake or custom test servers with a real gopls / jdtls instance before claiming production readiness.');
  if (report.validation_attempted && !report.validation_passed) addUnique(actions, 'Inspect scenario failures in languages.' + language + '.scenarios and fix the failing rename paths before claiming production readiness.');
  if (report.validation_attempted && report.workspace_scope_guarded !== true) addUnique(actions, 'Keep workspace scope guards enabled and re-run the production-readiness matrix.');
  return actions;
}

function deriveReadinessStage(report) {
  if (report.claim_ready) return 'claim_ready';
  if (!report.server_available) return 'verification_blocked';
  if (report.server_available && report.production_real_server_required && !report.real_server_detected) return 'verification_blocked';
  if (report.validation_attempted && !report.validation_passed) return 'validation_failed';
  return 'hardening';
}

function detectServerIdentity(language, spec, probe, options = {}) {
  if (!probe || !probe.available) return 'missing';
  if (options.assumeRealServer === true) return 'real';
  const commandPath = String(probe.command_path || spec.command || '').trim();
  const commandBase = path.basename(commandPath).toLowerCase();
  const probeText = `${probe.version || ''}\n${probe.probe_output || ''}`.toLowerCase();
  if (commandBase.includes('fake') || probeText.includes('fake server') || probeText.includes('fake-lsp') || probeText.includes('fake ')) return 'fake';
  if (language === 'go' && (commandBase === 'gopls' || commandBase === 'gopls.exe')) return 'real';
  if (language === 'java' && (commandBase === 'jdtls' || commandBase === 'jdtls.exe')) return 'real';
  if (language === 'java' && commandBase === 'java' && String(spec.launcher || '').toLowerCase().includes('org.eclipse.equinox.launcher')) return 'real';
  return 'custom';
}

function buildGoFixtures(rootDir) {
  const packageRoot = path.join(rootDir, 'package-rename');
  writeFiles(packageRoot, {
    'go.mod': 'module example.com/demo\n\ngo 1.22\n',
    'internal/handlers/routes.go': [
      'package handlers',
      '',
      'func legacyRoute() string {',
      '\treturn "ok"',
      '}',
      '',
    ].join('\n'),
    'internal/handlers/wiring.go': [
      'package handlers',
      '',
      'func callRealRoute() string {',
      '\treturn legacyRoute()',
      '}',
      '',
    ].join('\n'),
  });
  const localRoot = path.join(rootDir, 'local-rename');
  writeFiles(localRoot, {
    'go.mod': 'module example.com/demo\n\ngo 1.22\n',
    'internal/service/service.go': [
      'package service',
      '',
      'var userName = "pkg"',
      '',
      'func render() string {',
      '\tuserName := "local"',
      '\treturn userName',
      '}',
      '',
    ].join('\n'),
  });
  return [
    {
      id: 'package_symbol_rename',
      operation: 'rename-symbol',
      expected_name: 'modernRoute',
      files_to_verify: [
        path.join(packageRoot, 'internal/handlers/routes.go'),
        path.join(packageRoot, 'internal/handlers/wiring.go'),
      ],
      context: {
        baseDir: packageRoot,
        file: path.join(packageRoot, 'internal/handlers/routes.go'),
        fromName: 'legacyRoute',
        toName: 'modernRoute',
        dryRun: false,
        backendPreference: 'lsp-required',
        provider: 'go-semantic',
        lspMaxChangedFiles: 5,
        lspMaxChangedNodes: 10,
      },
    },
    {
      id: 'local_symbol_rename_at',
      operation: 'rename-at',
      expected_name: 'localUserName',
      files_to_verify: [path.join(localRoot, 'internal/service/service.go')],
      context: {
        baseDir: localRoot,
        file: path.join(localRoot, 'internal/service/service.go'),
        line: 6,
        col: 3,
        fromName: 'userName',
        toName: 'localUserName',
        dryRun: false,
        backendPreference: 'lsp-required',
        provider: 'go-semantic',
        lspMaxChangedFiles: 3,
        lspMaxChangedNodes: 6,
      },
    },
  ];
}

function buildJavaFixtures(rootDir) {
  const typeRoot = path.join(rootDir, 'type-rename');
  writeFiles(typeRoot, {
    'pom.xml': '<project></project>\n',
    'src/main/java/com/example/demo/LegacyBillingService.java': [
      'package com.example.demo;',
      '',
      'public class LegacyBillingService {',
      '\tpublic String run() {',
      '\t\treturn "ok";',
      '\t}',
      '}',
      '',
    ].join('\n'),
    'src/main/java/com/example/demo/BillingController.java': [
      'package com.example.demo;',
      '',
      'public class BillingController {',
      '\tprivate final LegacyBillingService service = new LegacyBillingService();',
      '\tpublic String route() {',
      '\t\treturn service.run();',
      '\t}',
      '}',
      '',
    ].join('\n'),
  });
  const localRoot = path.join(rootDir, 'local-rename');
  writeFiles(localRoot, {
    'pom.xml': '<project></project>\n',
    'src/main/java/com/example/demo/BillingService.java': [
      'package com.example.demo;',
      '',
      'public class BillingService {',
      '\tprivate String status = "field";',
      '\tpublic String run() {',
      '\t\tString status = "local";',
      '\t\treturn status;',
      '\t}',
      '}',
      '',
    ].join('\n'),
  });
  return [
    {
      id: 'type_symbol_rename',
      operation: 'rename-symbol',
      expected_name: 'ModernBillingService',
      files_to_verify: [
        path.join(typeRoot, 'src/main/java/com/example/demo/ModernBillingService.java'),
        path.join(typeRoot, 'src/main/java/com/example/demo/BillingController.java'),
      ],
      context: {
        baseDir: typeRoot,
        file: path.join(typeRoot, 'src/main/java/com/example/demo/LegacyBillingService.java'),
        fromName: 'LegacyBillingService',
        toName: 'ModernBillingService',
        dryRun: false,
        backendPreference: 'lsp-required',
        provider: 'java-semantic',
        lspMaxChangedFiles: 5,
        lspMaxChangedNodes: 12,
      },
    },
    {
      id: 'local_symbol_rename_at',
      operation: 'rename-at',
      expected_name: 'localStatus',
      files_to_verify: [path.join(localRoot, 'src/main/java/com/example/demo/BillingService.java')],
      context: {
        baseDir: localRoot,
        file: path.join(localRoot, 'src/main/java/com/example/demo/BillingService.java'),
        line: 6,
        col: 10,
        fromName: 'status',
        toName: 'localStatus',
        dryRun: false,
        backendPreference: 'lsp-required',
        provider: 'java-semantic',
        lspMaxChangedFiles: 3,
        lspMaxChangedNodes: 6,
      },
    },
  ];
}

function buildFixtures(language, rootDir) {
  if (language === 'go') return buildGoFixtures(rootDir);
  if (language === 'java') return buildJavaFixtures(rootDir);
  throw new Error(`Unsupported readiness fixture language: ${language}`);
}

function verifyScenarioOutcome(scenario) {
  const expected = String(scenario.expected_name || '');
  const explicitFiles = Array.isArray(scenario.files_to_verify) ? scenario.files_to_verify : [];
  let matched = 0;
  for (const filePath of explicitFiles) {
    if (!fs.existsSync(filePath)) continue;
    const body = fs.readFileSync(filePath, 'utf8');
    if (String(body).includes(expected)) matched += 1;
  }
  if (matched > 0) return true;
  const fallbackRoot = scenario && scenario.context && scenario.context.baseDir ? path.resolve(String(scenario.context.baseDir)) : '';
  if (!fallbackRoot || !fs.existsSync(fallbackRoot)) return false;
  const stack = [fallbackRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'build' || entry.name === '.gradle') continue;
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(abs);
      else if (entry.isFile()) {
        const body = fs.readFileSync(abs, 'utf8');
        if (String(body).includes(expected)) return true;
      }
    }
  }
  return false;
}

function buildLanguageReportSkeleton(language, provider, spec, probe, serverIdentity) {
  return {
    language,
    provider_id: provider.id,
    support_tier: provider.support_tier || 'tier4',
    production_harness_ready: Boolean(provider.lsp_production_readiness_harness),
    production_real_server_required: Boolean(provider.lsp_real_server_required_for_claim),
    lsp_available: Boolean(provider.lsp_available),
    server_available: Boolean(probe.available),
    server_identity: serverIdentity,
    real_server_detected: serverIdentity === 'real',
    server_command: spec.command || '',
    server_command_resolved: probe.command_path || '',
    server_probe: probe.probe_output || '',
    server_version: probe.version || '',
    server_discovery_mode: spec.discovery_mode || 'default',
    server_launcher: spec.launcher || '',
    server_config_dir: spec.configDir || '',
    proof_mode: !probe.available ? 'unverified' : (serverIdentity === 'real' ? 'real' : 'simulated'),
    validation_attempted: false,
    validation_passed: false,
    claim_ready: false,
    reasons: [],
    scenario_count: 0,
    scenario_pass_count: 0,
    scenarios: [],
  };
}

function attachScenarioMetrics(target, result) {
  target.validation_backend = result.backend || '';
  target.execution_mode = result.execution_mode || '';
  target.changed_files = Number(result.changedFiles || 0);
  target.changed_nodes = Number(result.changedNodes || 0);
  target.workspace_root = result.lsp_workspace_root || '';
  target.workspace_folders = Array.isArray(result.lsp_workspace_folders) ? [...result.lsp_workspace_folders] : [];
  target.workspace_scope_guarded = result.lsp_workspace_scope_guarded === true;
  target.edit_preview = result.lsp_edit_preview || null;
  target.edit_budget = result.lsp_edit_budget || null;
  target.prepare_rename = result.lsp_prepare_rename === true;
  target.workspace_document_changes = result.lsp_workspace_document_changes === true;
  target.workspace_resource_ops = Array.isArray(result.lsp_workspace_resource_ops) ? [...result.lsp_workspace_resource_ops] : [];
  target.server_requests_handled = Number(result.lsp_server_requests_handled || 0);
  target.diagnostics_count = Number(result.lsp_diagnostics_count || 0);
}

function runScenario(language, scenario) {
  const output = {
    id: scenario.id,
    operation: scenario.operation,
    expected_name: scenario.expected_name,
    validation_attempted: true,
    validation_passed: false,
    reasons: [],
  };
  try {
    const result = runRefactorOperation(scenario.operation, scenario.context);
    output.validation_backend = result.backend || '';
    output.execution_mode = result.execution_mode || '';
    output.changed_files = Number(result.changedFiles || 0);
    output.changed_nodes = Number(result.changedNodes || 0);
    output.prepare_rename = result.lsp_prepare_rename === true;
    output.workspace_scope_guarded = result.lsp_workspace_scope_guarded === true;
    output.edit_preview = result.lsp_edit_preview || null;
    output.workspace_resource_ops = Array.isArray(result.lsp_workspace_resource_ops) ? [...result.lsp_workspace_resource_ops] : [];
    output.output_verified = verifyScenarioOutcome(scenario);
    output.validation_passed = Boolean(result && result.backend === 'lsp' && result.lsp_applied === true && output.output_verified);
    if (!output.validation_passed) output.reasons.push('lsp_backend_not_applied');
    if (!output.workspace_scope_guarded) output.reasons.push('workspace_scope_guard_missing');
    if (!output.prepare_rename) output.reasons.push('prepare_rename_not_confirmed');
    if (!output.output_verified) output.reasons.push('expected_output_missing');
    output.result = result;
    return output;
  } catch (error) {
    output.validation_passed = false;
    output.failure_kind = error && error.lspFailureKind ? error.lspFailureKind : 'validation_failed';
    output.failure_message = String(error && error.message || error);
    output.reasons.push(`validation_failed:${output.failure_kind}`);
    return output;
  }
}

function evaluateLanguage(language, rootDir, options = {}) {
  const providerId = `${language}-semantic`;
  const providers = describeProviders();
  const provider = providers.find((entry) => entry.id === providerId) || { id: providerId, support_tier: 'tier4' };
  const fixtures = buildFixtures(language, rootDir);
  const seedContext = fixtures[0] ? fixtures[0].context : { baseDir: rootDir };
  const spec = resolveServerSpec(language, seedContext);
  const probe = probeServerSpec(language, spec, seedContext);
  const assumeRealServer = parseBoolean(
    options.assumeRealServer
      || process.env[`EOC_${language.toUpperCase()}_LSP_ASSUME_REAL`]
      || process.env.EOC_LSP_ASSUME_REAL,
    false,
  );
  const serverIdentity = detectServerIdentity(language, spec, probe, { assumeRealServer });
  const report = buildLanguageReportSkeleton(language, provider, spec, probe, serverIdentity);
  report.scenario_count = fixtures.length;
  report.environment = buildEnvironmentSnapshot();

  if (!report.production_harness_ready) report.reasons.push('provider_missing_production_harness');
  if (!report.server_available) report.reasons.push('server_unavailable');
  if (report.production_real_server_required && !report.real_server_detected) report.reasons.push('real_server_not_verified');

  if (report.server_available) {
    report.validation_attempted = true;
    for (const scenario of fixtures) {
      const scenarioResult = runScenario(language, scenario);
      report.scenarios.push({
        id: scenarioResult.id,
        operation: scenarioResult.operation,
        expected_name: scenarioResult.expected_name,
        validation_attempted: scenarioResult.validation_attempted,
        validation_passed: scenarioResult.validation_passed,
        validation_backend: scenarioResult.validation_backend || '',
        execution_mode: scenarioResult.execution_mode || '',
        changed_files: Number(scenarioResult.changed_files || 0),
        changed_nodes: Number(scenarioResult.changed_nodes || 0),
        prepare_rename: scenarioResult.prepare_rename === true,
        workspace_scope_guarded: scenarioResult.workspace_scope_guarded === true,
        output_verified: scenarioResult.output_verified === true,
        reasons: [...(scenarioResult.reasons || [])],
        failure_kind: scenarioResult.failure_kind || '',
        failure_message: scenarioResult.failure_message || '',
        edit_preview: scenarioResult.edit_preview || null,
        workspace_resource_ops: [...(scenarioResult.workspace_resource_ops || [])],
      });
      if (scenarioResult.result) attachScenarioMetrics(report, scenarioResult.result);
      if (scenarioResult.validation_passed) report.scenario_pass_count += 1;
    }
    report.validation_passed = report.scenario_count > 0 && report.scenario_pass_count === report.scenario_count;
    if (!report.validation_passed) report.reasons.push('scenario_matrix_incomplete');
    if (!report.workspace_scope_guarded) report.reasons.push('workspace_scope_guard_missing');
    if (!report.prepare_rename) report.reasons.push('prepare_rename_not_confirmed');
  }

  report.claim_ready = report.production_harness_ready
    && report.server_available
    && report.validation_passed
    && report.workspace_scope_guarded === true
    && report.scenario_pass_count === report.scenario_count
    && (!report.production_real_server_required || report.real_server_detected);

  if (!report.claim_ready && report.reasons.length === 0) report.reasons.push('proof_requirements_incomplete');
  report.claim_blockers = buildLanguageClaimBlockers(language, report, report.environment);
  report.next_actions = buildLanguageNextActions(language, report, report.environment);
  report.readiness_stage = deriveReadinessStage(report);
  return report;
}

function buildLspProductionReadinessReport(rootDir, options = {}) {
  const resolvedRoot = path.resolve(String(rootDir || process.cwd()));
  const supportReport = buildSupportTierReport(resolvedRoot);
  const results = withTempDir('eoc-lsp-proof-', (scratchDir) => {
    const goRoot = path.join(scratchDir, 'go-proof');
    const javaRoot = path.join(scratchDir, 'java-proof');
    fs.mkdirSync(goRoot, { recursive: true });
    fs.mkdirSync(javaRoot, { recursive: true });
    return {
      go: evaluateLanguage('go', goRoot, options),
      java: evaluateLanguage('java', javaRoot, options),
    };
  });
  const languages = ['go', 'java'];
  const claimableLanguages = languages.filter((language) => results[language] && results[language].claim_ready);
  const pendingLanguages = languages.filter((language) => !claimableLanguages.includes(language));
  const environmentSnapshot = buildEnvironmentSnapshot();
  const claimBlockers = pendingLanguages.flatMap((language) => (results[language] && Array.isArray(results[language].claim_blockers))
    ? results[language].claim_blockers.map((entry) => ({ language, kind: entry.kind, message: entry.message }))
    : []);
  const nextActions = pendingLanguages.flatMap((language) => (results[language] && Array.isArray(results[language].next_actions))
    ? results[language].next_actions.map((message) => ({ language, message }))
    : []);
  return {
    generated_at: new Date().toISOString(),
    root_dir: resolvedRoot,
    production_claim_ready: pendingLanguages.length === 0,
    claimable_languages: claimableLanguages,
    pending_languages: pendingLanguages,
    summary: {
      ready_languages: claimableLanguages,
      pending_languages: pendingLanguages,
      real_server_required: true,
      production_ready_claim: pendingLanguages.length === 0,
      verification_blocked_languages: pendingLanguages.filter((language) => results[language] && results[language].readiness_stage === 'verification_blocked'),
      scenario_matrix: {
        go: { passed: results.go.scenario_pass_count, total: results.go.scenario_count },
        java: { passed: results.java.scenario_pass_count, total: results.java.scenario_count },
      },
    },
    claim_blockers: claimBlockers,
    next_actions: nextActions,
    environment_snapshot: environmentSnapshot,
    languages: results,
    support_tier_snapshot: {
      semantic_refactor_support_tier: supportReport.domains.semantic_refactor.support_tier,
      indexed_languages: supportReport.domains.semantic_refactor.indexed_languages,
      lsp_experimental_languages: supportReport.domains.semantic_refactor.lsp_experimental_languages,
      production_harness_languages: supportReport.domains.semantic_refactor.production_harness_languages || [],
      production_matrix_languages: supportReport.domains.semantic_refactor.production_matrix_languages || [],
      real_server_auto_discovery_languages: supportReport.domains.semantic_refactor.real_server_auto_discovery_languages || [],
    },
  };
}

module.exports = {
  buildFixtures,
  buildLspProductionReadinessReport,
  detectServerIdentity,
  evaluateLanguage,
};
