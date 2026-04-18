const { validateMetadataConsistency } = require('./metadata-shared.js');

/** @param {string} [root] */
function runMetadataCheck(root = process.cwd()) {
  return validateMetadataConsistency(root);
}

function main() {
  const result = runMetadataCheck();
  if (!result.ok) {
    process.stderr.write('[metadata-check] FAIL\n');
    result.failures.forEach((failure) => process.stderr.write(`- ${failure}\n`));
    process.exit(1);
  }
  process.stdout.write(`[metadata-check] PASS ${result.detail}\n`);
}

module.exports = { runMetadataCheck, main };
