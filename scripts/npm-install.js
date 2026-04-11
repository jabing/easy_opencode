#!/usr/bin/env node
const path = require('path')
const { spawnSync } = require('child_process')

const installScript = path.resolve(__dirname, 'install.js')
const result = spawnSync(process.execPath, [installScript, '--global', '--yes', '--quiet'], {
  stdio: 'pipe',
  env: {
    ...process.env,
    EOC_SKIP_POSTINSTALL_OUTPUT: 'true',
  },
})

if (result.status !== 0) {
  const stderr = result.stderr?.toString() || 'Unknown error'
  console.error(`Easy OpenCode npm install hook failed: ${stderr}`)
  process.exit(result.status || 1)
}
