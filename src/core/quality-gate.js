const fs = require('fs');
const path = require('path');
const { runCommand } = require('../adapters/process-runner.js');
const { createEvidence, summarizeEvidence } = require('./evidence-store.js');
const { evaluateGate } = require('./gates/gate-engine.js');
const { validateFeatureBundle } = require('./feature-quality.js');
const { buildFeatureDeliverySummary } = require('./feature-delivery.js');
const { buildFeatureAcceptanceSummary } = require('./feature-acceptance.js');
const { evaluateQualityRules } = require('./rules/quality-rules.js');
const { toBool } = require('../shared/cli.js');
const { validateMetadataConsistency } = require('./checks/metadata-shared.js');
const { assertQualityGatePayload } = require('../shared/contracts.js');
const { exists, isPluginWorkspace, addResult, parseFrontmatter, summarizeCounts } = require('./quality/shared.js');
const { validateSkillsAndWriteRegistry } = require('./quality/skill-registry.js');
const { validateSkillMetadata } = require('./quality/skill-metadata.js');
const { collectCodeFiles, scanFile, collectStaticScanResults } = require('./quality/static-scan.js');
const { runInternalScript, appendWorkspaceQualityResults, appendPackagePresenceResults, appendScriptResults } = require('./quality/script-checks.js');

/** @param {any} [options] @param {any} [deps] */
async function runQualityGate(options = {}, deps = {}) {
  const root = deps.root || process.cwd();
  const full = toBool(options.full);
  const strict = toBool(options.strict);
  const timeoutMs = Number(options.timeout || 180000);
  const pluginWorkspace = isPluginWorkspace(root);
  /** @type {any[]} */
  const results = [];
  const effectiveDeps = {
    createEvidence: deps.createEvidence || createEvidence,
    summarizeEvidence: deps.summarizeEvidence || summarizeEvidence,
    evaluateGate: deps.evaluateGate || evaluateGate,
    validateFeatureBundle: deps.validateFeatureBundle || validateFeatureBundle,
    buildFeatureDeliverySummary: deps.buildFeatureDeliverySummary || buildFeatureDeliverySummary,
    buildFeatureAcceptanceSummary: deps.buildFeatureAcceptanceSummary || buildFeatureAcceptanceSummary,
    runCommand: deps.runCommand || runCommand,
    now: deps.now || (() => new Date().toISOString()),
  };

  appendPackagePresenceResults(root, pluginWorkspace, results);
  /** @type {Record<string, any>} */
  let pkg = {};
  if (exists(root, 'package.json')) {
    if (pluginWorkspace) {
      const qualityEvaluation = evaluateQualityRules({
        root,
        metadataCheck: () => validateMetadataConsistency(root),
        skillRegistryCheck: () => validateSkillsAndWriteRegistry(root, effectiveDeps.now),
        skillMetadataCheck: () => validateSkillMetadata(root),
      });
      const hygieneFindings = qualityEvaluation.findings.filter((item) => item.ruleId === 'quality.package-hygiene');
      const hygieneErrors = hygieneFindings.filter((item) => item.severity === 'error');
      addResult(results, hygieneErrors.length === 0 ? 'pass' : 'fail', 'package.publish_hygiene', hygieneFindings.length === 0 ? 'runtime state excluded from publish whitelist' : hygieneFindings.map((item) => item.message).join(' | '));
    } else {
      addResult(results, 'skip', 'package.publish_hygiene', 'not applicable outside plugin workspace');
    }
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      addResult(results, 'pass', 'package.json.parse', 'valid JSON');
    } catch (error) {
      addResult(results, 'fail', 'package.json.parse', error instanceof Error ? error.message : String(error));
    }
  }

  const scanFindings = collectStaticScanResults(root);
  addResult(results, scanFindings.fail.length === 0 ? 'pass' : 'fail', 'static.scan.failures', scanFindings.fail.length === 0 ? 'none' : scanFindings.fail.join(' | '));
  addResult(results, scanFindings.warn.length === 0 ? 'pass' : strict ? 'fail' : 'warn', 'static.scan.warnings', scanFindings.warn.length === 0 ? 'none' : scanFindings.warn.join(' | '));

  const requestedFeature = String(options.feature || options['feature-name'] || '').trim();
  if (requestedFeature) {
    const featureGate = effectiveDeps.validateFeatureBundle(root, requestedFeature);
    const featureDelivery = effectiveDeps.buildFeatureDeliverySummary(root, requestedFeature);
    const featureAcceptance = effectiveDeps.buildFeatureAcceptanceSummary(root, requestedFeature);
    addResult(results, featureGate.ok ? 'pass' : 'fail', 'feature.bundle', featureGate.summary);
    addResult(results, featureDelivery.ready ? 'pass' : 'warn', 'feature.delivery', featureDelivery.summary);
    addResult(results, featureAcceptance.incomplete_count === 0 ? 'pass' : 'warn', 'feature.acceptance', featureAcceptance.summary);
  }

  if (pluginWorkspace) {
    const skillGate = validateSkillsAndWriteRegistry(root, effectiveDeps.now);
    const skillMetadataGate = validateSkillMetadata(root);
    const metadataGate = validateMetadataConsistency(root);
    appendWorkspaceQualityResults(root, metadataGate, skillGate, skillMetadataGate, results);
  } else {
    addResult(results, 'skip', 'skills.registry', 'not applicable outside plugin workspace');
    addResult(results, 'skip', 'skills.metadata', 'not applicable outside plugin workspace');
    addResult(results, 'skip', 'metadata.consistency', 'not applicable outside plugin workspace');
  }

  await appendScriptResults(pkg, full, strict, pluginWorkspace, timeoutMs, root, results, effectiveDeps);
  const counts = summarizeCounts(results);
  const gatePass = counts.fail === 0;
  const evidence = [effectiveDeps.createEvidence('quality-gate-results', 'quality-gate', { mode: full ? 'full' : 'fast', strict, gate: gatePass ? 'PASS' : 'FAIL', counts, results }, { tags: ['quality', full ? 'full' : 'fast'] })];
  const gateEvaluation = effectiveDeps.evaluateGate({
    gateId: 'quality-gate',
    strict,
    evidence,
    rules: [{
      id: 'quality.results.pass',
      title: 'Quality results pass',
      /** @param {any[]} items */
      evaluate(items) {
        const match = items.find((item) => item.type === 'quality-gate-results');
        if (!match) return { status: 'skip', detail: 'quality evidence missing' };
        const content = match.content || {};
        const failCount = Number((content.counts && content.counts.fail) || 0);
        const warnCount = Number((content.counts && content.counts.warn) || 0);
        if (failCount > 0) return { status: 'fail', detail: `quality gate has ${failCount} failing checks`, matched_evidence_ids: [match.id] };
        if (warnCount > 0) return { status: 'warn', detail: `quality gate has ${warnCount} warning checks`, matched_evidence_ids: [match.id] };
        return { status: 'pass', detail: 'all quality checks passed', matched_evidence_ids: [match.id] };
      },
    }],
  });
  const payload = {
    gate: gatePass ? 'PASS' : 'FAIL',
    strict,
    full,
    counts,
    results,
    evidence_bundle: {
      schema_version: '1.0',
      gate: gateEvaluation,
      summary: effectiveDeps.summarizeEvidence(evidence),
      evidence,
    },
  };
  assertQualityGatePayload(payload);
  return payload;
}

module.exports = {
  addResult,
  appendPackagePresenceResults,
  appendScriptResults,
  appendWorkspaceQualityResults,
  collectCodeFiles,
  collectStaticScanResults,
  exists,
  isPluginWorkspace,
  parseFrontmatter,
  runInternalScript,
  runQualityGate,
  scanFile,
  summarizeCounts,
  validateMetadataConsistency,
  validateSkillMetadata,
  validateSkillsAndWriteRegistry,
};
