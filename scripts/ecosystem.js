#!/usr/bin/env node
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { loadEcosystemState } = require('../src/core/ecosystem/state.js');
const { listBundles } = require('../src/core/ecosystem/bundle-registry.js');
const { applyBundles } = require('../src/core/ecosystem/apply-bundles.js');
const { buildWorkspaceProfile } = require('../src/core/ecosystem/workspace-profile.js');
const cli = require('../src/cli/ecosystem-cli.js');

module.exports = cli;

if (require.main === module) {
  cli.main({
    loadEcosystemState,
    buildWorkspaceProfile,
    listBundles,
    applyBundles,
    formatManagedInvocation,
  });
}
