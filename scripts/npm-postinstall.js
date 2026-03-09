#!/usr/bin/env node
/**
 * Easy OpenCode npm post-install hook
 * 
 * This runs after npm install completes
 */

const path = require('path');
const { spawnSync } = require('child_process');

// Suppress output when running in interactive TUI context
const suppressOutput = process.env.EOC_SKIP_POSTINSTALL_OUTPUT === 'true' ||
                      process.env.EOC_SKIP_INTERACTIVE === 'true' ||
                      process.env.npm_config_user_agent?.includes('yarn') === true;

if (!suppressOutput) {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✨ Easy OpenCode Installed Successfully via npm!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\nTo install Easy OpenCode in your project, run:');
  console.log('  eoc-install');
  console.log('\nOr run installer directly:');
  console.log('  node scripts/install.js');
  console.log('\nChoose installation type:');
  console.log('  1) Project-level  - Only affects current project');
  console.log('  2) Global        - Available in ALL projects');
  console.log('═══════════════════════════════════════════════════════════\n');
}
