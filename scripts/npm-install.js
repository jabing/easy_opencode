#!/usr/bin/env node
/**
 * Easy OpenCode npm installation hook
 * 
 * This runs during npm install to set up the package
 */

const path = require('path');
const fs = require('fs');

// Get npm install directory
const installDir = path.resolve(__dirname, '..');

// Suppress output when running in interactive TUI context
const suppressOutput = process.env.EOC_SKIP_POSTINSTALL_OUTPUT === 'true';

if (!suppressOutput) {
  console.log('\n✨ Easy OpenCode (EOC) v1.8.0');
  console.log('✨ Production-ready AI coding plugin for OpenCode\n');
}

// Make bin script executable
const binScript = path.join(installDir, 'bin', 'eoc-install.js');
if (fs.existsSync(binScript)) {
  try {
    fs.chmodSync(binScript, '755');
    if (!suppressOutput) {
      console.log('✓ Made eoc-install executable\n');
    }
  } catch (err) {
    console.warn('Warning: Could not make bin script executable:', err.message);
  }
}

if (!suppressOutput) {
  console.log('Next steps:');
  console.log('  For project-level installation:  eoc-install');
  console.log('  For global installation:          eoc-install (choose option 2)\n');
  console.log('Or run interactive installer:  node ' + path.join(installDir, 'scripts', 'install.js') + '\n');
}
