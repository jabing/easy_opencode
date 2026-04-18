#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const os = require('os')
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js')

const SUPPORTED = ['npm', 'pnpm', 'yarn', 'bun']

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function detectFromLockFiles(root) {
  const checks = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ]
  for (const [file, manager] of checks) {
    if (fs.existsSync(path.join(root, file))) return manager
  }
  return null
}

function getProjectConfigPath(root) {
  return path.join(root, '.opencode', 'package-manager.json')
}

function getLegacyProjectConfigPath(root) {
  return path.join(root, '.claude', 'package-manager.json')
}

function getGlobalConfigPath() {
  return path.join(os.homedir(), '.opencode', 'package-manager.json')
}

function detect(root) {
  if (process.env.CLAUDE_PACKAGE_MANAGER) return { source: 'env', manager: process.env.CLAUDE_PACKAGE_MANAGER }
  const project = readJson(getProjectConfigPath(root)) || readJson(getLegacyProjectConfigPath(root))
  if (project?.packageManager) return { source: 'project-config', manager: project.packageManager }
  const pkg = readJson(path.join(root, 'package.json'))
  if (pkg?.packageManager) return { source: 'package.json', manager: String(pkg.packageManager).split('@')[0] }
  const lock = detectFromLockFiles(root)
  if (lock) return { source: 'lock-file', manager: lock }
  const globalCfg = readJson(getGlobalConfigPath())
  if (globalCfg?.packageManager) return { source: 'global-config', manager: globalCfg.packageManager }
  return { source: 'fallback', manager: 'npm' }
}

function saveConfig(filePath, manager) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify({ packageManager: manager }, null, 2) + '\n', 'utf8')
}

function main() {
  const args = process.argv.slice(2)
  const root = process.cwd()
  if (args.includes('--detect')) {
    const result = detect(root)
    console.log(`${result.manager} (${result.source})`)
    return
  }
  const setIndex = args.indexOf('--set')
  if (setIndex !== -1 && args[setIndex + 1]) {
    const manager = args[setIndex + 1]
    if (!SUPPORTED.includes(manager)) {
      console.error(`Unsupported package manager: ${manager}`)
      process.exit(1)
    }
    const globalMode = args.includes('--global')
    const target = globalMode ? getGlobalConfigPath() : getProjectConfigPath(root)
    saveConfig(target, manager)
    console.log(`Saved ${manager} to ${target}`)
    return
  }
  console.log(`Usage: ${formatManagedInvocation('setup-package-manager', ['--detect'])}`)
  console.log(`   or: ${formatManagedInvocation('setup-package-manager', ['--set', '<npm|pnpm|yarn|bun>', '--global'])}`)
}

main()
