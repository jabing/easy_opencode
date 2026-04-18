#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { resolveOpencodeConfig, readJsonSafe } = require('../src/cli/config-paths.js')

function existsMaybe(baseDir, fileRef) {
  if (typeof fileRef !== 'string') return false
  const match = fileRef.match(/^\{file:(.+)\}$/)
  const relative = match ? match[1] : fileRef
  const normalized = relative.replace(/^\.\//, '')
  const candidates = [
    path.resolve(baseDir, normalized),
    path.resolve(baseDir, normalized.replace(/^\.opencode\/easy-opencode\//, '')),
    path.resolve(baseDir, normalized.replace(/^easy-opencode\//, '')),
  ]
  return candidates.some((candidate) => fs.existsSync(candidate))
}

function audit() {
  const configPath = resolveOpencodeConfig(process.cwd())
  if (!configPath) {
    console.log('FAIL: Cannot locate opencode.json')
    return 1
  }
  const cfg = readJsonSafe(configPath)
  if (!cfg) {
    console.log(`FAIL: Cannot parse config: ${configPath}`)
    return 1
  }

  const baseDir = path.dirname(configPath)
  let err = 0
  let warn = 0
  let info = 0

  const agents = cfg.agent && typeof cfg.agent === 'object' ? Object.entries(cfg.agent) : []
  const commands = cfg.command && typeof cfg.command === 'object' ? Object.entries(cfg.command) : []
  const instructions = Array.isArray(cfg.instructions) ? cfg.instructions : []

  if (agents.length === 0) {
    console.log('WARN: No agents configured')
    warn++
  } else {
    console.log(`OK: Agents: ${agents.length}`)
    info++
  }

  if (commands.length === 0) {
    console.log('WARN: No commands configured')
    warn++
  } else {
    console.log(`OK: Commands: ${commands.length}`)
    info++
  }

  if (instructions.length === 0) {
    console.log('WARN: No instructions configured')
    warn++
  } else {
    console.log(`OK: Instructions: ${instructions.length}`)
    info++
  }

  const brokenPrompts = agents
    .filter(([, value]) => value && value.prompt)
    .filter(([, value]) => !existsMaybe(baseDir, value.prompt))
    .map(([name]) => name)
  if (brokenPrompts.length > 0) {
    console.log(`FAIL: Missing agent prompt files: ${brokenPrompts.join(', ')}`)
    err++
  }

  const brokenTemplates = commands
    .filter(([, value]) => value && value.template)
    .filter(([, value]) => !existsMaybe(baseDir, String(value.template).split('\n')[0]))
    .map(([name]) => name)
  if (brokenTemplates.length > 0) {
    console.log(`FAIL: Missing command templates: ${brokenTemplates.join(', ')}`)
    err++
  }

  const missingInstructions = instructions.filter((item) => !existsMaybe(baseDir, item))
  if (missingInstructions.length > 0) {
    console.log(`FAIL: Missing instruction files: ${missingInstructions.join(', ')}`)
    err++
  }

  console.log('\nStatus:', err === 0 ? 'PASS' : 'FAIL')
  console.log(`Config: ${configPath}`)
  console.log(`Errors: ${err}, Warnings: ${warn}, Info: ${info}`)
  return err === 0 ? 0 : 1
}

if (require.main === module) {
  process.exit(audit())
}

module.exports = { audit }
