#!/usr/bin/env node
const {
  DEFAULT_REQUIRED_STATIC,
  DEFAULT_RUNTIME_PATHS,
  checkPackageHygiene,
  normalizeFiles,
  readPackageJson,
} = require('../src/core/package-hygiene.js');

function main() {
  const result = checkPackageHygiene();
  if (!result.ok) {
    console.error('[package-hygiene] FAIL');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  if (result.warnings.length > 0) {
    console.log('[package-hygiene] PASS_WITH_WARNINGS');
    for (const warning of result.warnings) console.log(`- ${warning}`);
    return;
  }
  console.log('[package-hygiene] PASS');
}

module.exports = {
  REQUIRED_STATIC: DEFAULT_REQUIRED_STATIC,
  RUNTIME_PATHS: DEFAULT_RUNTIME_PATHS,
  checkPackageHygiene,
  normalizeFiles,
  readPackageJson,
};

if (require.main === module) {
  main();
}
