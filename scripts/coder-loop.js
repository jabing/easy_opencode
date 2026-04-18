#!/usr/bin/env node
const cli = require('../src/cli/coder-loop-cli.js');
if (require.main === module) cli.main();
module.exports = cli;
