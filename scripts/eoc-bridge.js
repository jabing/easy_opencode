#!/usr/bin/env node
const cli = require('../src/cli/eoc-bridge-cli.js');
if (require.main === module) cli.main();
module.exports = cli;
