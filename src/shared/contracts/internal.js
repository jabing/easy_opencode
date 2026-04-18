const {
  isRecord,
  assertString,
  assertNumber,
  assertBoolean,
  assertStringArray,
  assertArray,
  assertRecord,
  assertCounts,
  assertCheckEntries,
  assertIsoDateString,
} = require('./common.js');

/** @param {unknown} value */

function assertCommandRegistryContract(value) {
  assertRecord(value, 'command-registry');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.schema_name, 'command-registry.schema_name');
  assertString(record.schema_version, 'command-registry.schema_version');
  assertArray(record.entries, 'command-registry.entries');
  for (const [index, item] of /** @type {unknown[]} */ (record.entries).entries()) {
    assertRecord(item, `command-registry.entries[${index}]`);
    const entry = /** @type {Record<string, unknown>} */ (item);
    if (entry.recommended !== undefined) assertBoolean(entry.recommended, `command-registry.entries[${index}].recommended`);
  }
}



/** @param {unknown} value */

function assertCommandCompatibilityContract(value) {
  assertRecord(value, 'command-compatibility');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.schema_name, 'command-compatibility.schema_name');
  assertString(record.schema_version, 'command-compatibility.schema_version');
  assertArray(record.entries, 'command-compatibility.entries');
}

/** @param {unknown} value */

function assertCommandRegistryValidationContract(value) {
  assertRecord(value, 'command-registry-validation');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertBoolean(record.ok, 'command-registry-validation.ok');
  assertArray(record.entries, 'command-registry-validation.entries');
  assertArray(record.errors, 'command-registry-validation.errors');
  assertArray(record.main_entries, 'command-registry-validation.main_entries');
}

/** @param {unknown} value */

function assertOrchestratorStateContract(value) {
  assertRecord(value, 'orchestrator-state');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertBoolean(record.has_recoverable_state, 'orchestrator-state.has_recoverable_state');
  if (record.active_flow !== undefined && record.active_flow !== null) assertString(record.active_flow, 'orchestrator-state.active_flow');
  if (record.commands !== undefined) assertStringArray(record.commands, 'orchestrator-state.commands');
}

/** @param {unknown} value */

function assertModelRouteViewContract(value) {
  assertRecord(value, 'model-route-view');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.model, 'model-route-view.model');
  assertString(record.small_model, 'model-route-view.small_model');
  assertString(record.config, 'model-route-view.config');
}

/** @param {unknown} value */

function assertModelRoutePlanContract(value) {
  assertModelRouteViewContract(value);
  const record = /** @type {Record<string, unknown>} */ (value);
  assertRecord(record.route, 'model-route-plan.route');
  const route = /** @type {Record<string, unknown>} */ (record.route);
  assertString(route.task_kind, 'model-route-plan.route.task_kind');
  assertString(route.risk_level, 'model-route-plan.route.risk_level');
  assertString(route.coding_model, 'model-route-plan.route.coding_model');
  assertString(route.repair_model, 'model-route-plan.route.repair_model');
  assertString(route.edit_mode, 'model-route-plan.route.edit_mode');
}

/** @param {unknown} value */

function assertObservabilityEventsContract(value) {
  assertArray(value, 'observability-events');
}

/** @param {unknown} value */

function assertObservabilityBenchmarksContract(value) {
  assertArray(value, 'observability-benchmarks');
}

/** @param {unknown} value */

function assertBenchmarkCompareContract(value) {
  assertRecord(value, 'benchmark-compare');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertRecord(record.summary, 'benchmark-compare.summary');
}

/** @param {unknown} value */

function assertBenchmarkTrendsContract(value) {
  assertRecord(value, 'benchmark-trends');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.group_by, 'benchmark-trends.group_by');
  assertNumber(record.bucket_count, 'benchmark-trends.bucket_count');
  assertRecord(record.summary, 'benchmark-trends.summary');
}

/** @param {unknown} value */

function assertBenchmarkFeedbackContract(value) {
  assertRecord(value, 'benchmark-feedback');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.risk_level, 'benchmark-feedback.risk_level');
  assertNumber(record.risk_score, 'benchmark-feedback.risk_score');
  assertNumber(record.confidence, 'benchmark-feedback.confidence');
  assertRecord(record.scope, 'benchmark-feedback.scope');
  assertString(record.strategy_bias, 'benchmark-feedback.strategy_bias');
}

/** @param {unknown} value */

function assertAnalyzeProjectStructureContract(value) {
  assertRecord(value, 'analyze-project-structure');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.output_path, 'analyze-project-structure.output_path');
}

/** @param {unknown} value */

function assertImplementationContextContract(value) {
  assertRecord(value, 'implementation-context');
}

/** @param {unknown} value */

function assertImplementationContextEnvelopeContract(value) {
  assertRecord(value, 'implementation-context-envelope');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.root, 'implementation-context-envelope.root');
  assertRecord(record.context, 'implementation-context-envelope.context');
}

/** @param {unknown} value */

function assertProjectMemorySyncContract(value) {
  assertRecord(value, 'project-memory-sync');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.root, 'project-memory-sync.root');
  assertRecord(record.memory, 'project-memory-sync.memory');
}

/** @param {unknown} value */

function assertDebugFixLoopContract(value) {
  assertRecord(value, 'debug-fix-loop');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertBoolean(record.ok, 'debug-fix-loop.ok');
}


/** @param {unknown} value */

function assertReleaseOverrideContract(value) {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertRecord(item, `release-override[${index}]`);
      const record = /** @type {Record<string, unknown>} */ (item);
      if (record.override_id !== undefined && record.override_id !== null) assertString(record.override_id, `release-override[${index}].override_id`);
      assertString(record.status, `release-override[${index}].status`);
    }
    return;
  }
  assertRecord(value, 'release-override');
  const record = /** @type {Record<string, unknown>} */ (value);
  if (record.override_id !== undefined && record.override_id !== null) assertString(record.override_id, 'release-override.override_id');
  assertString(record.status, 'release-override.status');
}

/** @param {unknown} value */

function assertSafeApplyContract(value) {
  assertRecord(value, 'safe-apply');
}

/** @param {unknown} value */

function assertCapabilityRegistryContract(value) {
  assertRecord(value, 'capability-registry');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertRecord(record.counts, 'capability-registry.counts');
  assertArray(record.capabilities, 'capability-registry.capabilities');
  for (const [index, item] of /** @type {unknown[]} */ (record.capabilities).entries()) {
    assertRecord(item, `capability-registry.capabilities[${index}]`);
    const capability = /** @type {Record<string, unknown>} */ (item);
    if (capability.surface !== undefined && capability.surface !== null) assertString(capability.surface, `capability-registry.capabilities[${index}].surface`);
    if (capability.maturity !== undefined && capability.maturity !== null) assertString(capability.maturity, `capability-registry.capabilities[${index}].maturity`);
    if (capability.recommended !== undefined) assertBoolean(capability.recommended, `capability-registry.capabilities[${index}].recommended`);
  }
}

/** @param {unknown} value */

function assertSkillRunnerListContract(value) {
  assertArray(value, 'skill-runner-list');
}

/** @param {unknown} value */

function assertSkillRunnerShowContract(value) {
  assertRecord(value, 'skill-runner-show');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.name, 'skill-runner-show.name');
  assertString(record.dir, 'skill-runner-show.dir');
}

/** @param {unknown} value */

function assertSkillRunnerMatchContract(value) {
  assertArray(value, 'skill-runner-match');
}

/** @param {unknown} value */

function assertSkillRunnerCapabilitiesContract(value) {
  assertArray(value, 'skill-runner-capabilities');
}

/** @param {unknown} value */

function assertScaffoldOutputContract(value) {
  assertRecord(value, 'scaffold-output');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertBoolean(record.ok, 'scaffold-output.ok');
  assertStringArray(record.files, 'scaffold-output.files');
  if (record.command !== undefined && record.command !== null) assertString(record.command, 'scaffold-output.command');
}


/** @param {unknown} value */

function assertHistoricalDebtAuditContract(value) {
  assertRecord(value, 'historical-debt-audit');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertIsoDateString(record.generated_at, 'historical-debt-audit.generated_at');
  assertArray(record.deletion_candidates, 'historical-debt-audit.deletion_candidates');
  assertArray(record.recommended_internal_merges, 'historical-debt-audit.recommended_internal_merges');
  assertRecord(record.summary, 'historical-debt-audit.summary');
}

module.exports = {
  assertCommandRegistryContract,
  assertCommandCompatibilityContract,
  assertCommandRegistryValidationContract,
  assertOrchestratorStateContract,
  assertModelRouteViewContract,
  assertModelRoutePlanContract,
  assertObservabilityEventsContract,
  assertObservabilityBenchmarksContract,
  assertBenchmarkCompareContract,
  assertBenchmarkTrendsContract,
  assertBenchmarkFeedbackContract,
  assertAnalyzeProjectStructureContract,
  assertImplementationContextContract,
  assertImplementationContextEnvelopeContract,
  assertProjectMemorySyncContract,
  assertDebugFixLoopContract,
  assertReleaseOverrideContract,
  assertSafeApplyContract,
  assertCapabilityRegistryContract,
  assertSkillRunnerListContract,
  assertSkillRunnerShowContract,
  assertSkillRunnerMatchContract,
  assertSkillRunnerCapabilitiesContract,
  assertScaffoldOutputContract,
  assertHistoricalDebtAuditContract
};
