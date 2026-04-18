#!/usr/bin/env node
const { detectProjectProfile } = require('../src/core/project-profile.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { main, parseArgs, printHuman, printList, createUsage } = require('../src/cli/project-profile-cli.js');

module.exports = {
  createUsage,
  main,
  parseArgs,
  printHuman,
  printList,
};

if (require.main === module) {
  main({ detectProjectProfile, formatManagedInvocation });
}
