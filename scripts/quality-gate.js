#!/usr/bin/env node
const { runQualityGate } = require('../src/core/quality-gate.js');
const { main } = require('../src/cli/quality-gate-cli.js');

module.exports = { runQualityGate };

if (require.main === module) {
  main();
}
