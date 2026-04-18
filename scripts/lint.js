#!/usr/bin/env node
const { main, runLint } = require('../src/core/lint/engine.js');

module.exports = { runLint };

if (require.main === module) {
  main();
}
