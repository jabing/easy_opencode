const { applyBundles } = require('./apply-bundles.js');
const { buildWorkspaceProfile } = require('./workspace-profile.js');

/**
 * @param {string} rootDir
 * @param {{ bootstrap?: boolean, bundles?: string[] }} [options]
 */
function bootstrapEcosystem(rootDir, options = {}) {
  const workspaceProfile = buildWorkspaceProfile(rootDir);
  const recommendedBundles = Array.isArray(workspaceProfile.recommended_bundles) ? workspaceProfile.recommended_bundles : [];
  const enabledBundles = Array.isArray(options.bundles) ? options.bundles : [];

  return applyBundles({
    rootDir,
    enabled_bundles: enabledBundles,
    recommended_bundles: options.bootstrap ? recommendedBundles : [],
    bootstrap: options.bootstrap ? {
      strategy: 'install-bootstrap',
      applied_at: new Date().toISOString(),
      recommended_bundles: recommendedBundles,
      explicit_bundles: enabledBundles,
    } : null,
  });
}

module.exports = {
  bootstrapEcosystem,
};
