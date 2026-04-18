#!/usr/bin/env node
const { main, runMetadataCheck } = require('../src/core/checks/metadata-check.js');

module.exports = { runMetadataCheck };

if (require.main === module) {
  main();
}
