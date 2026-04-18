#!/usr/bin/env node
/**
 * Hook Configuration Management Script
 */
const fs = require('fs')
const { resolveHooksConfig } = require('../src/cli/config-paths.js')
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js')

const CONFIG_FILE = resolveHooksConfig(process.cwd())
const PROFILES = ['minimal', 'standard', 'strict']

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  } catch {
    return { profile: 'standard', disabled: [], overrides: {} }
  }
}

function saveConfig(config) {
  fs.mkdirSync(require('path').dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n')
}

function setProfile(profile) {
  if (!PROFILES.includes(profile)) {
    console.error(`Invalid profile: ${profile}. Valid options: ${PROFILES.join(', ')}`)
    process.exit(1)
  }
  const config = loadConfig()
  config.profile = profile
  saveConfig(config)
  console.log(`Hook profile set to: ${profile}`)
  console.log(`Config: ${CONFIG_FILE}`)
}

function disableHooks(hooks) {
  const config = loadConfig()
  for (const hook of hooks) {
    if (!config.disabled.includes(hook)) config.disabled.push(hook)
  }
  saveConfig(config)
  console.log(`Disabled hooks: ${hooks.join(', ')}`)
}

function enableHooks(hooks) {
  const config = loadConfig()
  if (hooks.includes('all')) {
    config.disabled = []
    console.log('Enabled all hooks')
  } else {
    config.disabled = config.disabled.filter((hook) => !hooks.includes(hook))
    console.log(`Enabled hooks: ${hooks.join(', ')}`)
  }
  saveConfig(config)
}

function getStatus() {
  const config = loadConfig()
  console.log('\n=== Hook Configuration Status ===\n')
  console.log(`Config file: ${CONFIG_FILE}`)
  console.log(`Profile: ${config.profile}`)
  console.log(`Disabled hooks (${config.disabled.length}):`)
  if (config.disabled.length === 0) {
    console.log('  (none)')
  } else {
    config.disabled.forEach((hook) => console.log(`  - ${hook}`))
  }
  console.log('')
}

function showHelp() {
  console.log(`
Hook Configuration Management

Usage:
  ${formatManagedInvocation('hooks-config', ['profile', '<minimal|standard|strict>'])}
  ${formatManagedInvocation('hooks-config', ['disable', '<hook1,hook2,...>'])}
  ${formatManagedInvocation('hooks-config', ['enable', '<hook1,hook2,...|all>'])}
  ${formatManagedInvocation('hooks-config', ['status'])}
`)
}

const args = process.argv.slice(2)
switch (args[0]) {
  case 'profile':
    setProfile(args[1])
    break
  case 'disable':
    if (args[1]) disableHooks(args[1].split(',').map((s) => s.trim()).filter(Boolean))
    else showHelp()
    break
  case 'enable':
    if (args[1]) enableHooks(args[1].split(',').map((s) => s.trim()).filter(Boolean))
    else showHelp()
    break
  case 'status':
    getStatus()
    break
  default:
    showHelp()
}
