#!/usr/bin/env node
const { main, runTypecheck } = require('../src/core/ts-typecheck.js');

module.exports = { runTypecheck };

if (require.main === module) {
  main('ts-typecheck');
}
