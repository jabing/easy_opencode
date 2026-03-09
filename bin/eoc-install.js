#!/usr/bin/env node
/**
 * EOC (Everything OpenCode) Installer via npm
 * 
 * Run: npx easy-opencode install
 * Or:  eoc-install (if installed globally)
 */

const path = require('path');
const { spawn } = require('child_process');

// Get directory where this script is located
const scriptDir = __dirname;
const projectRoot = path.resolve(scriptDir, '..');
const installScript = path.join(projectRoot, 'scripts', 'install.js');

// Suppress npm hook output to prevent TUI corruption
process.env.EOC_SKIP_POSTINSTALL_OUTPUT = 'true';

console.log('\n🚀 Easy OpenCode Installer (npm)\n');
console.log(`Project root: ${projectRoot}\n`);

// Run main install script
const child = spawn('node', [installScript], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: { ...process.env, EOC_SKIP_POSTINSTALL_OUTPUT: 'true' }
});

child.on('error', (error) => {
  console.error(`Failed to start installer: ${error.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code || 0);
});
