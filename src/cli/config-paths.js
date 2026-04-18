const fs = require('fs')
const path = require('path')
const os = require('os')

/** @param {string} filePath */
function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

/** @param {string[]} values */
function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function candidateProjectRoots(startDir = process.cwd()) {
  const roots = []
  let current = path.resolve(startDir)
  while (true) {
    roots.push(current)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return roots
}

function candidateConfigPaths(startDir = process.cwd()) {
  const projectRoots = candidateProjectRoots(startDir)
  const home = os.homedir()
  const out = []
  for (const root of projectRoots) {
    out.push(path.join(root, 'opencode.json'))
    out.push(path.join(root, '.opencode', 'opencode.json'))
    out.push(path.join(root, '.opencode', 'easy-opencode', 'opencode.json'))
  }
  out.push(path.join(home, '.opencode', 'opencode.json'))
  out.push(path.join(home, '.opencode', 'easy-opencode', 'opencode.json'))
  return unique(out)
}

function resolveOpencodeConfig(startDir = process.cwd()) {
  const match = candidateConfigPaths(startDir).find(fileExists)
  return match || null
}

/** @param {string} filePath */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

/** @param {string} filePath @param {unknown} data */
function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function resolveHooksConfig(startDir = process.cwd()) {
  const projectRoots = candidateProjectRoots(startDir)
  const home = os.homedir()
  const candidates = []
  for (const root of projectRoots) {
    candidates.push(path.join(root, '.opencode', 'hooks-config.json'))
    candidates.push(path.join(root, '.opencode', 'easy-opencode', '.opencode', 'hooks-config.json'))
  }
  candidates.push(path.join(home, '.opencode', 'easy-opencode', '.opencode', 'hooks-config.json'))
  candidates.push(path.join(home, '.opencode', 'hooks-config.json'))
  return unique(candidates).find(fileExists) || candidates[0]
}

module.exports = {
  candidateConfigPaths,
  readJsonSafe,
  resolveHooksConfig,
  resolveOpencodeConfig,
  writeJson,
}
