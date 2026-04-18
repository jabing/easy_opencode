#!/usr/bin/env node
const { main, runBuildCheck } = require('../src/core/checks/build-check.js');

module.exports = { runBuildCheck };

if (require.main === module) {
  main();
}
