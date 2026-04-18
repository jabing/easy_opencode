#!/usr/bin/env node
const cli = require('../src/cli/benchmark-suite-cli.js');
if (require.main === module) cli.main();
module.exports = cli;
