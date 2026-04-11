#!/usr/bin/env node
/*
 * EOC installer entrypoint
 *
 * Usage:
 *   eoc-install
 *   eoc-install --project --yes
 *   eoc-install --global --yes
 */

const path = require('path')
const { spawn } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')
const installScript = path.join(projectRoot, 'scripts', 'install.js')
const passthroughArgs = process.argv.slice(2)

const child = spawn(process.execPath, [installScript, ...passthroughArgs], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    EOC_SKIP_POSTINSTALL_OUTPUT: 'true',
  },
})

child.on('error', (error) => {
  console.error(`Failed to start installer: ${error.message}`)
  process.exit(1)
})

child.on('close', (code) => {
  process.exit(code || 0)
})
