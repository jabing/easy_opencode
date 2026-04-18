#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const os = require('os')
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js')

function getSessionsDir() {
  return path.join(os.homedir(), '.opencode', 'sessions')
}

function getSessionFiles() {
  const dir = getSessionsDir()
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const fullPath = path.join(dir, file)
      const stat = fs.statSync(fullPath)
      return { path: fullPath, name: file, mtimeMs: stat.mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

function listSessions() {
  const files = getSessionFiles()
  console.log('=== Sessions ===')
  console.log('Directory:', getSessionsDir())
  console.log('Total:', files.length)
  files.slice(0, 10).forEach((file, index) => {
    console.log(`${index + 1}. ${file.name}`)
  })
}

const cmd = process.argv[2]
if (cmd === 'list') listSessions()
else console.log(`Usage: ${formatManagedInvocation('session-validator', ['list'])}`)

module.exports = { getSessionFiles, listSessions }
