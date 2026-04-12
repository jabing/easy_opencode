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

const missing = required.filter((p) => !fs.existsSync(path.join(ROOT, p)));
if (missing.length > 0) {
  console.error('[build-check] FAIL');
  missing.forEach((p) => console.error(`- missing: ${p}`));
  process.exit(1);
}

console.log('[build-check] PASS');
