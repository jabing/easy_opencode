#!/usr/bin/env node
const path = require('path');
const { detectProjectProfile } = require('../src/core/project-profile.js');
const { assertNamedContract } = require('../src/shared/contracts.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i += 1;
    }
  }
  return opts;
}

function usage() {
  console.log('Usage:');
  console.log(`  ${formatManagedInvocation('detect-project-runtime', ['--json'])}`);
  console.log(`  ${formatManagedInvocation('detect-project-runtime', ['--root', '/path/to/project'])}`);
}

function printHuman(profile, root) {
  console.log(`Root: ${root}`);
  console.log(`Runtime: ${profile.runtime}`);
  console.log(`Language: ${profile.language}`);
  console.log(`Framework: ${profile.framework}`);
  console.log(`Package manager: ${profile.package_manager || 'n/a'}`);
  console.log(`App type: ${profile.app_type || 'unknown'}`);
  console.log(`Repo shape: ${profile.repo_shape || 'unknown'}`);
  console.log(`Detected by: ${profile.detected_by || 'n/a'}`);
  console.log(`Test runner: ${profile.test_runner || 'n/a'}`);
  console.log(`Lint tool: ${profile.lint_tool || 'n/a'}`);
  console.log(`Typecheck tool: ${profile.typecheck_tool || 'n/a'}`);
  console.log(`Validation commands: ${profile.validation.length}`);
  for (const item of profile.validation) {
    console.log(`- ${item.kind}: ${item.command}`);
  }
  if (Array.isArray(profile.validation_gaps) && profile.validation_gaps.length > 0) {
    console.log(`Validation gaps: ${profile.validation_gaps.join(', ')}`);
  }
}

function main() {
  try {
    const opts = parseArgs(process.argv);
    if (opts.help || opts.h) {
      usage();
      process.exit(0);
    }
    const root = path.resolve(String(opts.root || opts._[0] || process.cwd()));
    const profile = detectProjectProfile(root);
    if (opts.json) {
      assertNamedContract('detect-project-runtime', profile);
      process.stdout.write(JSON.stringify(profile, null, 2) + '\n');
      return;
    }
    printHuman(profile, root);
  } catch (error) {
    console.error(`[detect-project-runtime] ${error.message}`);
    usage();
    process.exit(1);
  }
}

module.exports = { main };

if (require.main === module) {
  main();
}
