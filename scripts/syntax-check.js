#!/usr/bin/env node
const { main, runSyntaxCheck } = require('../src/core/syntax-check.js');

module.exports = { runSyntaxCheck };

if (require.main === module) {
  main('syntax-check');
}
