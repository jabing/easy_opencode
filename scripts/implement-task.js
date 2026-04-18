#!/usr/bin/env node
const cli = require('../src/cli/implement-task-cli.js');
if (require.main === module) cli.main();
module.exports = cli;
