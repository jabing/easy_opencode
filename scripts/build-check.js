#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const required = [
  'commands',
  'skills',
  'prompts',
  '.opencode/instructions/INSTRUCTIONS.md',
  'scripts/install.js',
];

function runBuildCheck() {
  const missing = required.filter((p) => !fs.existsSync(path.join(ROOT, p)));
  return { ok: missing.length === 0, missing };
}

function main() {
  const r = runBuildCheck();
  if (!r.ok) {
    console.error('[build-check] FAIL');
    r.missing.forEach((p) => console.error(`- missing: ${p}`));
    process.exit(1);
  }
  console.log('[build-check] PASS');
}

module.exports = { runBuildCheck };

if (require.main === module) {
  main();
}
