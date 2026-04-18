#!/usr/bin/env node
const cli = require('../src/cli/run-tests-cli.js');
if (require.main === module) cli.main();
module.exports = cli;
