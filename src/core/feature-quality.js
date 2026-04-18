const fs = require('fs');
const path = require('path');

/** @typedef {{ ok: boolean, check: string, detail: string }} FeatureCheck */

/** @param {string} filePath */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {string} root */
function resolveLastFeatureName(root) {
  const memory = readJsonSafe(path.join(root, '.opencode', 'project-memory.json')) || {};
  return String(memory.last_feature_generation && memory.last_feature_generation.feature_name || '').trim() || null;
}

/** @param {string} root @param {string | null | undefined} featureNameInput */
function validateFeatureBundle(root, featureNameInput) {
  const featureName = String(featureNameInput || '').trim() || resolveLastFeatureName(root);
  if (!featureName) {
    return {
      ok: false,
      feature_name: null,
      checks: [],
      summary: 'no feature selected and no last generated feature found',
    };
  }

  const planPath = path.join(root, '.opencode', 'feature-plans', `${featureName}.json`);
  const integrationJsonPath = path.join(root, '.opencode', 'feature-bundles', `${featureName}.integration.json`);
  const integrationMdPath = path.join(root, '.opencode', 'feature-bundles', `${featureName}.integration.md`);
  const plan = readJsonSafe(planPath);
  const integration = readJsonSafe(integrationJsonPath);
  /** @type {FeatureCheck[]} */
  const checks = [];

  /** @param {unknown} ok @param {string} check @param {string} detail */
  function addCheck(ok, check, detail) {
    checks.push({ ok: Boolean(ok), check, detail });
  }

  addCheck(Boolean(plan), 'feature.plan', plan ? 'present' : 'missing');
  addCheck(fs.existsSync(integrationMdPath), 'feature.integration_note', fs.existsSync(integrationMdPath) ? 'present' : 'missing');
  addCheck(Boolean(integration), 'feature.integration_json', integration ? 'present' : 'missing');

  if (plan) {
    const outputs = Array.isArray(plan.files_to_generate) ? plan.files_to_generate : [];
    const updates = Array.isArray(plan.updates_to_apply) ? plan.updates_to_apply : [];
    const hasTestOutput = outputs.some((/** @type {string} */ item) => /(?:^|\/)(?:tests?|__tests__)\//.test(item) || /\.(spec|test)\./.test(item));
    const hasDocsOutput = outputs.some((/** @type {string} */ item) => /(?:^|\/)docs\//.test(item) || /\.md$/i.test(item));
    const hasRouteOutput = outputs.some((/** @type {string} */ item) => /\.route\./.test(item));
    const routeUpdate = updates.find((/** @type {{ file?: string } | null} */ item) => item && item.file && /index\.(ts|js|md)$/.test(item.file));
    addCheck(hasRouteOutput, 'feature.outputs.route', hasRouteOutput ? 'route artifact planned' : 'route artifact missing');
    addCheck(hasTestOutput, 'feature.outputs.test', hasTestOutput ? 'test artifact planned' : 'test artifact missing');
    addCheck(hasDocsOutput, 'feature.outputs.docs', hasDocsOutput ? 'docs artifact planned' : 'docs artifact missing');
    addCheck(Boolean(routeUpdate), 'feature.integration.route_registration', routeUpdate ? `planned via ${routeUpdate.file}` : 'no route/docs registration update detected');
  }

  if (integration) {
    const created = Array.isArray(integration.created_files) ? integration.created_files : [];
    const updated = Array.isArray(integration.updated_files) ? integration.updated_files : [];
    addCheck(created.includes(`.opencode/feature-bundles/${featureName}.integration.md`), 'feature.integration.created_note', 'integration note tracked');
    addCheck(created.some((/** @type {string} */ item) => /\.route\./.test(item)) || updated.some((/** @type {string} */ item) => /\.route\./.test(item)), 'feature.integration.route_artifact', 'route artifact tracked');
  }

  const failed = checks.filter((item) => !item.ok);
  return {
    ok: failed.length === 0,
    feature_name: featureName,
    checks,
    summary: failed.length === 0 ? `feature bundle ok: ${featureName}` : failed.map((item) => `${item.check}=${item.detail}`).join(' | '),
  };
}

module.exports = {
  validateFeatureBundle,
};
