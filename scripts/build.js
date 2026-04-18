#!/usr/bin/env node
const { main, runBuildPipeline } = require('../src/core/build/pipeline.js');

module.exports = { runBuildPipeline };

if (require.main === module) {
  main();
}
