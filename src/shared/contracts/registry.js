const core = require('./core.js');
const governance = require('./governance.js');
const internal = require('./internal.js');
const {
  assertProjectProfileContract,
  assertQualityGateContract,
  assertReleaseCheckContract,
} = core;
const {
  assertReleaseEvidenceContract,
  assertReleaseRehearsalContract,
  assertTestStabilityContract,
  assertPreflightProductionContract,
  assertObservabilityReportContract,
  assertPlatformSnapshotContract,
  assertFeatureAcceptanceContract,
  assertFailureStrategyContract,
  assertDeliveryReportContract,
  assertReviewGateContract,
} = governance;
const {
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
  assertHistoricalDebtAuditContract,
} = internal;

/** @type {Record<string, (value: unknown) => void>} */
const CONTRACT_VALIDATORS = {
  'project-profile': assertProjectProfileContract,
  'detect-project-runtime': assertProjectProfileContract,
  'quality-gate': assertQualityGateContract,
  'release-check': assertReleaseCheckContract,
  'release-evidence': assertReleaseEvidenceContract,
  'release-rehearsal': assertReleaseRehearsalContract,
  'test-stability': assertTestStabilityContract,
  'preflight-production': assertPreflightProductionContract,
  'observability-report': assertObservabilityReportContract,
  'platform-report': assertPlatformSnapshotContract,
  'feature-acceptance': assertFeatureAcceptanceContract,
  'failure-strategy': assertFailureStrategyContract,
  'delivery-report': assertDeliveryReportContract,
  'review-gate': assertReviewGateContract,
  'command-registry': assertCommandRegistryContract,
  'command-compatibility': assertCommandCompatibilityContract,
  'command-registry-validation': assertCommandRegistryValidationContract,
  'orchestrator-state': assertOrchestratorStateContract,
  'model-route-view': assertModelRouteViewContract,
  'model-route-plan': assertModelRoutePlanContract,
  'observability-events': assertObservabilityEventsContract,
  'observability-benchmarks': assertObservabilityBenchmarksContract,
  'benchmark-compare': assertBenchmarkCompareContract,
  'benchmark-trends': assertBenchmarkTrendsContract,
  'benchmark-feedback': assertBenchmarkFeedbackContract,
  'analyze-project-structure': assertAnalyzeProjectStructureContract,
  'implementation-context': assertImplementationContextContract,
  'implementation-context-envelope': assertImplementationContextEnvelopeContract,
  'project-memory-sync': assertProjectMemorySyncContract,
  'debug-fix-loop': assertDebugFixLoopContract,
  'release-override': assertReleaseOverrideContract,
  'safe-apply': assertSafeApplyContract,
  'capability-registry': assertCapabilityRegistryContract,
  'skill-runner-list': assertSkillRunnerListContract,
  'skill-runner-show': assertSkillRunnerShowContract,
  'skill-runner-match': assertSkillRunnerMatchContract,
  'skill-runner-capabilities': assertSkillRunnerCapabilitiesContract,
  'scaffold-output': assertScaffoldOutputContract,
  'historical-debt-audit': assertHistoricalDebtAuditContract,
};

/** @param {string} contractName */
function hasNamedContract(contractName) {
  return Boolean(CONTRACT_VALIDATORS[contractName]);
}

function listKnownContracts() {
  return Object.keys(CONTRACT_VALIDATORS).sort();
}

/** @param {string} contractName @param {unknown} value */
function assertNamedContract(contractName, value) {
  const validator = CONTRACT_VALIDATORS[contractName];
  if (!validator) throw new Error(`Unknown contract: ${contractName}`);
  validator(value);
}

module.exports = {
  CONTRACT_VALIDATORS,
  hasNamedContract,
  listKnownContracts,
  assertNamedContract,
};
