#!/usr/bin/env node
const cli = require('../src/cli/ast-rewrite-cli.js');
if (require.main === module) cli.main();
module.exports = cli;
