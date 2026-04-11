#!/usr/bin/env node
/*
 * Easy OpenCode uninstaller
 *
 * Removes only Easy OpenCode managed assets from ~/.opencode/easy-opencode
 * and cleans matching references in ~/.opencode/opencode.json.
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')

function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH
}

function getGlobalConfigDir() {
  return path.join(getHomeDir(), '.opencode')
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function dirExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function createReadline() {
  return readline.createInterface({ input: process.stdin, output: process.stdout })
}

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

function cleanConfig(configPath) {
  if (!fileExists(configPath)) {
    return { changed: false, reason: 'opencode.json not found' }
  }

  const config = readJson(configPath)
  if (!config) {
    return { changed: false, reason: 'opencode.json is invalid JSON' }
  }

  const pathPrefix = './easy-opencode/'
  let changed = false

  if (Array.isArray(config.instructions)) {
    const next = config.instructions.filter((item) => typeof item !== 'string' || !item.startsWith(pathPrefix))
    if (next.length !== config.instructions.length) {
      config.instructions = next
      changed = true
    }
    if (config.instructions.length === 0) {
      delete config.instructions
    }
  }

  if (Array.isArray(config.plugin)) {
    const next = config.plugin.filter((item) => typeof item !== 'string' || !item.startsWith(pathPrefix))
    if (next.length !== config.plugin.length) {
      config.plugin = next
      changed = true
    }
    if (config.plugin.length === 0) {
      delete config.plugin
    }
  }

  if (config.agent && typeof config.agent === 'object') {
    for (const [key, value] of Object.entries(config.agent)) {
      if (
        value &&
        typeof value === 'object' &&
        typeof value.prompt === 'string' &&
        value.prompt.includes('{file:./easy-opencode/')
      ) {
        delete config.agent[key]
        changed = true
      }
    }
    if (Object.keys(config.agent).length === 0) {
      delete config.agent
    }
  }

  if (config.command && typeof config.command === 'object') {
    for (const [key, value] of Object.entries(config.command)) {
      if (
        value &&
        typeof value === 'object' &&
        typeof value.template === 'string' &&
        value.template.includes('{file:./easy-opencode/')
      ) {
        delete config.command[key]
        changed = true
      }
    }
    if (Object.keys(config.command).length === 0) {
      delete config.command
    }
  }

  if (config.default_agent && typeof config.default_agent === 'string' && config.default_agent.startsWith('eoc_')) {
    delete config.default_agent
    changed = true
  }

  if (changed) {
    writeJson(configPath, config)
  }

  return { changed, reason: changed ? 'updated' : 'no Easy OpenCode entries found' }
}

async function main() {
  const globalDir = getGlobalConfigDir()
  const assetDir = path.join(globalDir, 'easy-opencode')
  const configPath = path.join(globalDir, 'opencode.json')

  console.log('')
  console.log('Easy OpenCode Uninstaller')
  console.log(`Global config directory: ${globalDir}`)
  console.log('')

  if (!dirExists(globalDir)) {
    console.log('Nothing to remove. Global OpenCode directory does not exist.')
    process.exit(0)
  }

  if (!dirExists(assetDir) && !fileExists(configPath)) {
    console.log('Nothing to remove. Easy OpenCode assets were not found.')
    process.exit(0)
  }

  console.log('This will remove:')
  if (dirExists(assetDir)) {
    console.log(`- ${assetDir}`)
  }
  if (fileExists(configPath)) {
    console.log('- Easy OpenCode references from opencode.json')
  }
  console.log('')

  const rl = createReadline()
  const answer = await prompt(rl, 'Continue? (y/N): ')
  rl.close()

  if (answer.toLowerCase() !== 'y') {
    console.log('Cancelled.')
    process.exit(0)
  }

  if (dirExists(assetDir)) {
    fs.rmSync(assetDir, { recursive: true, force: true })
    console.log(`Removed: ${assetDir}`)
  }

  const result = cleanConfig(configPath)
  console.log(`Config cleanup: ${result.reason}`)
  console.log('Uninstall complete.')

  process.exit(0)
}

main().catch((error) => {
  console.error(`Uninstall failed: ${error.message}`)
  process.exit(1)
})
