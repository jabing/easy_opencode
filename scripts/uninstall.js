#!/usr/bin/env node
const cli = require('../src/cli/uninstall-cli.js');
if (require.main === module) {
  cli.main().catch((error) => {
    console.error(`Uninstall failed: ${error.message}`)
    process.exit(1)
  });
}
module.exports = cli;
