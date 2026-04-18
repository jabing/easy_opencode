const fs = require('fs');
const path = require('path');
const { validateFeatureBundle } = require('./quality.js');

/** @typedef {'integration_note'|'integration_json'|'docs'|'test'|'route'|'controller'|'service'|'repository'|'schema'|'other'} ArtifactKind */
/** @typedef {{ check: string, detail: string }} MissingCheck */
/** @typedef {{ ok: boolean, check: string, detail: string }} FeatureCheck */
/** @typedef {{ route?: number, service?: number, schema?: number, docs?: number, test?: number, controller?: number, repository?: number, integration_note?: number, integration_json?: number, other?: number, [key: string]: number | undefined }} ArtifactCounts */
/** @typedef {{ files_to_generate?: unknown }} FeaturePlan */
/** @typedef {{ created_files?: unknown, updated_files?: unknown, manual_steps?: unknown }} FeatureIntegration */
/** @typedef {{ ok: boolean, summary: string, checks?: FeatureCheck[] }} FeatureValidation */
/** @typedef {{ planned_outputs: string[], created_files: string[], updated_files: string[], counts: ArtifactCounts }} ArtifactSummary */

/** @param {string} filePath @returns {any | null} */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {unknown} value @returns {string[]} */
function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** @param {string} root @param {string | null | undefined} featureNameInput @returns {string | null} */
function resolveFeatureName(root, featureNameInput) {
  const explicit = String(featureNameInput || '').trim();
  if (explicit) return explicit;
  const memory = readJsonSafe(path.join(root, '.opencode', 'project-memory.json')) || {};
  return String((memory.last_feature_generation && memory.last_feature_generation.feature_name) || '').trim() || null;
}

/** @param {string} relPath @returns {ArtifactKind} */
function classifyOutput(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/');
  if (/\.integration\.md$/i.test(normalized)) return 'integration_note';
  if (/\.integration\.json$/i.test(normalized)) return 'integration_json';
  if (/\.md$/i.test(normalized) || /(?:^|\/)docs\//.test(normalized)) return 'docs';
  if (/(?:^|\/)(?:tests?|__tests__)\//.test(normalized) || /(?:\.|_)(spec|test)\./i.test(normalized)) return 'test';
  if (/route|router|routes/.test(path.basename(normalized).toLowerCase())) return 'route';
  if (/controller|handler/.test(path.basename(normalized).toLowerCase())) return 'controller';
  if (/service/.test(path.basename(normalized).toLowerCase())) return 'service';
  if (/repositor/.test(path.basename(normalized).toLowerCase())) return 'repository';
  if (/schema|model/.test(path.basename(normalized).toLowerCase())) return 'schema';
  return 'other';
}

/** @param {FeaturePlan | null} plan @param {FeatureIntegration | null} integration @returns {ArtifactSummary} */
function summarizeArtifacts(plan, integration) {
  const outputs = asStringArray(plan && plan.files_to_generate);
  const created = asStringArray(integration && integration.created_files);
  const updated = asStringArray(integration && integration.updated_files);
  /** @type {ArtifactCounts} */
  const counts = {};
  for (const file of outputs) {
    const kind = classifyOutput(file);
    counts[kind] = (counts[kind] || 0) + 1;
  }
  return {
    planned_outputs: outputs,
    created_files: created,
    updated_files: updated,
    counts,
  };
}

/** @param {FeatureValidation} validation @param {ArtifactSummary} summary @param {FeatureIntegration | null} integration */
function computeReadiness(validation, summary, integration) {
  /** @type {FeatureCheck[]} */
  const checks = Array.isArray(validation.checks) ? validation.checks : [];
  /** @type {MissingCheck[]} */
  const missing = checks.filter((item) => !item.ok).map((item) => ({ check: item.check, detail: item.detail }));
  const requiredKinds = /** @type {ArtifactKind[]} */ (['route', 'service', 'schema']);
  const missingKinds = requiredKinds.filter((kind) => !((summary.counts[kind] || 0) > 0));
  for (const kind of missingKinds) {
    missing.push({ check: `feature.outputs.${kind}`, detail: `${kind} artifact missing` });
  }
  const manualSteps = asStringArray(integration && integration.manual_steps).filter(Boolean);
  if (manualSteps.length > 0) {
    missing.push({ check: 'feature.integration.manual_steps', detail: `manual steps remain: ${manualSteps.join('; ')}` });
  }
  return {
    ready: missing.length === 0,
    missing,
    manual_steps: manualSteps,
  };
}

/** @param {string} root @param {string | null | undefined} featureNameInput */
function buildFeatureDeliverySummary(root, featureNameInput) {
  const featureName = resolveFeatureName(root, featureNameInput);
  if (!featureName) {
    return {
      ok: false,
      feature_name: null,
      ready: false,
      reason: 'no feature selected and no last generated feature found',
    };
  }
  const planPath = path.join(root, '.opencode', 'feature-plans', `${featureName}.json`);
  const integrationJsonPath = path.join(root, '.opencode', 'feature-bundles', `${featureName}.integration.json`);
  const integrationMdPath = path.join(root, '.opencode', 'feature-bundles', `${featureName}.integration.md`);
  /** @type {FeaturePlan | null} */
  const plan = readJsonSafe(planPath);
  /** @type {FeatureIntegration | null} */
  const integration = readJsonSafe(integrationJsonPath);
  /** @type {FeatureValidation} */
  const validation = validateFeatureBundle(root, featureName);
  const summary = summarizeArtifacts(plan, integration);
  const readiness = computeReadiness(validation, summary, integration);
  return {
    ok: validation.ok,
    feature_name: featureName,
    ready: readiness.ready,
    summary: readiness.ready ? `feature delivery ready: ${featureName}` : `feature delivery incomplete: ${featureName}`,
    artifact_paths: {
      plan: fs.existsSync(planPath) ? path.relative(root, planPath).split(path.sep).join('/') : null,
      integration_json: fs.existsSync(integrationJsonPath) ? path.relative(root, integrationJsonPath).split(path.sep).join('/') : null,
      integration_note: fs.existsSync(integrationMdPath) ? path.relative(root, integrationMdPath).split(path.sep).join('/') : null,
    },
    validation,
    artifacts: summary,
    manual_steps: readiness.manual_steps,
    missing: readiness.missing,
  };
}

module.exports = {
  buildFeatureDeliverySummary,
};
