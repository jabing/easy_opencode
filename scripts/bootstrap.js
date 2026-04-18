#!/usr/bin/env node
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { bootstrapEcosystem } = require('../src/core/ecosystem/install-bootstrap.js');
const cli = require('../src/cli/bootstrap-cli.js');

module.exports = cli;

if (require.main === module) {
  cli.main({
    bootstrapEcosystem,
    formatManagedInvocation,
  });
}
