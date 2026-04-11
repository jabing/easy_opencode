#!/usr/bin/env node
/*
 * Easy OpenCode installer
 *
 * Installs plugin assets into an isolated directory:
 * - Project: <project>/.opencode/easy-opencode
 * - Global:  ~/.opencode/easy-opencode
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')

const SOURCE_ROOT = path.resolve(__dirname, '..')
const PACKAGE_JSON_PATH = path.join(SOURCE_ROOT, 'package.json')
const PACKAGE_VERSION = readJson(PACKAGE_JSON_PATH)?.version || '0.0.0'

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
}

function log(message, color = 'reset', quiet = false) {
  if (!quiet) {
    console.log(`${colors[color]}${message}${colors.reset}`)
  }
}

function logInfo(message, quiet = false) {
  log(`[INFO] ${message}`, 'cyan', quiet)
}

function logWarn(message, quiet = false) {
  log(`[WARN] ${message}`, 'yellow', quiet)
}

function logSuccess(message, quiet = false) {
  log(`[OK] ${message}`, 'green', quiet)
}

function logError(message) {
  log(`[ERR] ${message}`, 'red', false)
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
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

function copyDir(src, dest) {
  if (!dirExists(src)) {
    return false
  }

  ensureDir(dest)
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath)
    }
  }

  return true
}

function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH
}

function getGlobalConfigDir() {
  const homeDir = getHomeDir()
  return path.join(homeDir, '.opencode')
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2))
  return {
    global: args.has('--global'),
    project: args.has('--project'),
    yes: args.has('--yes') || args.has('-y'),
    quiet: args.has('--quiet'),
  }
}

function getSourcePaths() {
  return {
    commands: path.join(SOURCE_ROOT, 'commands'),
    skills: path.join(SOURCE_ROOT, 'skills'),
    prompts: path.join(SOURCE_ROOT, 'prompts'),
    opencodeInstructions: path.join(SOURCE_ROOT, '.opencode', 'instructions'),
    opencodePlugins: path.join(SOURCE_ROOT, '.opencode', 'plugins'),
    opencodeHooksConfig: path.join(SOURCE_ROOT, '.opencode', 'hooks-config.json'),
    agentsMd: path.join(SOURCE_ROOT, 'AGENTS.md'),
  }
}

function validateSources() {
  const src = getSourcePaths()
  const missing = []

  if (!dirExists(src.commands)) missing.push('commands/')
  if (!dirExists(src.skills)) missing.push('skills/')
  if (!dirExists(src.prompts)) missing.push('prompts/')
  if (!dirExists(src.opencodeInstructions)) missing.push('.opencode/instructions/')
  if (!dirExists(src.opencodePlugins)) missing.push('.opencode/plugins/')
  if (!fileExists(src.agentsMd)) missing.push('AGENTS.md')

  if (missing.length > 0) {
    throw new Error(`Installer source is incomplete. Missing: ${missing.join(', ')}`)
  }
}

function getPromptPath(assetPrefix, promptName) {
  return `{file:${assetPrefix}/prompts/agents/${promptName}}`
}

function readTitle(filePath, fallback) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const firstHeading = content
      .split(/\r?\n/)
      .find((line) => line.trim().startsWith('# '))

    if (!firstHeading) return fallback
    return firstHeading.replace(/^#\s+/, '').trim()
  } catch {
    return fallback
  }
}

function buildAgents(assetPrefix) {
  return {
    eoc_build: {
      description: 'EOC primary coding agent',
      mode: 'primary',
      tools: { write: true, edit: true, bash: true, read: true },
    },
    eoc_planner: {
      description: 'EOC planning specialist',
      mode: 'primary',
      prompt: getPromptPath(assetPrefix, 'planner.md'),
      tools: { read: true, bash: true, write: false, edit: false },
    },
    eoc_code_reviewer: {
      description: 'EOC code review specialist',
      mode: 'primary',
      prompt: getPromptPath(assetPrefix, 'code-reviewer.md'),
      tools: { read: true, bash: true, write: false, edit: false },
    },
    'tdd-guide': {
      description: 'TDD specialist',
      hidden: true,
      prompt: getPromptPath(assetPrefix, 'tdd-guide.md'),
      tools: { read: true, write: true, edit: true, bash: true },
    },
    'security-reviewer': {
      description: 'Security review specialist',
      hidden: true,
      prompt: getPromptPath(assetPrefix, 'security-reviewer.md'),
      tools: { read: true, bash: true, write: false, edit: false },
    },
    'build-error-resolver': {
      description: 'Build and type error fixer',
      hidden: true,
      prompt: getPromptPath(assetPrefix, 'build-error-resolver.md'),
      tools: { read: true, write: true, edit: true, bash: true },
    },
    'e2e-runner': {
      description: 'Playwright E2E specialist',
      hidden: true,
      prompt: getPromptPath(assetPrefix, 'e2e-runner.md'),
      tools: { read: true, write: true, edit: true, bash: true },
    },
    'refactor-cleaner': {
      description: 'Refactoring and cleanup specialist',
      hidden: true,
      prompt: getPromptPath(assetPrefix, 'refactor-cleaner.md'),
      tools: { read: true, write: true, edit: true, bash: true },
    },
    'doc-updater': {
      description: 'Documentation updater',
      hidden: true,
      prompt: getPromptPath(assetPrefix, 'doc-updater.md'),
      tools: { read: true, write: true, edit: true, bash: true },
    },
    'go-reviewer': {
      description: 'Go code review specialist',
      hidden: true,
      prompt: getPromptPath(assetPrefix, 'go-reviewer.md'),
      tools: { read: true, bash: true, write: false, edit: false },
    },
    'go-build-resolver': {
      description: 'Go build error specialist',
      hidden: true,
      prompt: getPromptPath(assetPrefix, 'go-build-resolver.md'),
      tools: { read: true, write: true, edit: true, bash: true },
    },
    'database-reviewer': {
      description: 'Database schema and SQL specialist',
      hidden: true,
      prompt: getPromptPath(assetPrefix, 'database-reviewer.md'),
      tools: { read: true, bash: true, write: false, edit: false },
    },
    architect: {
      description: 'Architecture and scalability specialist',
      hidden: true,
      prompt: getPromptPath(assetPrefix, 'architect.md'),
      tools: { read: true, bash: true, write: false, edit: false },
    },
    'python-reviewer': {
      description: 'Python code review specialist',
      hidden: true,
      prompt: getPromptPath(assetPrefix, 'python-reviewer.md'),
      tools: { read: true, bash: true, write: false, edit: false },
    },
  }
}

function buildCommandConfig(commandsDir, assetPrefix) {
  const agentByCommand = {
    plan: 'eoc_planner',
    'multi-plan': 'eoc_planner',
    orchestrate: 'eoc_planner',
    tdd: 'tdd-guide',
    'go-test': 'tdd-guide',
    'test-coverage': 'tdd-guide',
    'code-review': 'eoc_code_reviewer',
    'python-review': 'python-reviewer',
    security: 'security-reviewer',
    'build-fix': 'build-error-resolver',
    e2e: 'e2e-runner',
    'refactor-clean': 'refactor-cleaner',
    'update-docs': 'doc-updater',
    'update-codemaps': 'doc-updater',
    'go-review': 'go-reviewer',
    'go-build': 'go-build-resolver',
    'openspec-proposal': 'eoc_planner',
    'openspec-apply': 'tdd-guide',
    'openspec-archive': 'doc-updater',
    'superpowers-brainstorm': 'eoc_planner',
    'superpowers-plan': 'eoc_planner',
    'superpowers-execute': 'tdd-guide',
    'tooling-parity': 'eoc_planner',
    'eoc-start': 'eoc_planner',
    'eoc-parallel': 'eoc_planner',
    'eoc-metrics': 'eoc_planner',
  }

  const commandFiles = fs
    .readdirSync(commandsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  const result = {}

  for (const fileName of commandFiles) {
    const name = fileName.replace(/\.md$/, '')
    const filePath = path.join(commandsDir, fileName)
    const title = readTitle(filePath, name)

    const command = {
      description: title,
      template: `{file:${assetPrefix}/commands/${fileName}}\n\n$ARGUMENTS`,
    }

    const agent = agentByCommand[name]
    if (agent) {
      command.agent = agent
      command.subtask = true
    }

    result[name] = command
  }

  return result
}

function buildEocConfig(assetPrefix, commandsDir) {
  const instructions = [
    `${assetPrefix}/AGENTS.md`,
    `${assetPrefix}/.opencode/instructions/INSTRUCTIONS.md`,
    `${assetPrefix}/skills/tdd-workflow/SKILL.md`,
    `${assetPrefix}/skills/security-review/SKILL.md`,
    `${assetPrefix}/skills/coding-standards/SKILL.md`,
    `${assetPrefix}/skills/frontend-patterns/SKILL.md`,
    `${assetPrefix}/skills/backend-patterns/SKILL.md`,
    `${assetPrefix}/skills/e2e-testing/SKILL.md`,
    `${assetPrefix}/skills/verification-loop/SKILL.md`,
    `${assetPrefix}/skills/api-design/SKILL.md`,
    `${assetPrefix}/skills/strategic-compact/SKILL.md`,
    `${assetPrefix}/skills/eval-harness/SKILL.md`,
    `${assetPrefix}/skills/openspec-workflow/SKILL.md`,
    `${assetPrefix}/skills/superpowers-workflow/SKILL.md`,
    `${assetPrefix}/skills/claude-public-tooling/SKILL.md`,
  ]

  return {
    $schema: 'https://opencode.ai/config.json',
    default_agent: 'eoc_build',
    instructions,
    plugin: [`${assetPrefix}/.opencode/plugins`],
    agent: buildAgents(assetPrefix),
    command: buildCommandConfig(commandsDir, assetPrefix),
  }
}

function mergeConfig(existingConfig, eocConfig) {
  const existing = existingConfig || {}

  const merged = {
    ...existing,
    $schema: existing.$schema || eocConfig.$schema,
    default_agent: existing.default_agent || eocConfig.default_agent,
    instructions: [...new Set([...(existing.instructions || []), ...(eocConfig.instructions || [])])],
    plugin: [...new Set([...(existing.plugin || []), ...(eocConfig.plugin || [])])],
    agent: { ...(existing.agent || {}), ...(eocConfig.agent || {}) },
    command: { ...(existing.command || {}), ...(eocConfig.command || {}) },
  }

  return merged
}

function copyAssets(assetRoot, quiet) {
  const src = getSourcePaths()
  fs.rmSync(assetRoot, { recursive: true, force: true })
  ensureDir(assetRoot)
  ensureDir(path.join(assetRoot, '.opencode'))

  copyDir(src.commands, path.join(assetRoot, 'commands'))
  copyDir(src.skills, path.join(assetRoot, 'skills'))
  copyDir(src.prompts, path.join(assetRoot, 'prompts'))
  copyDir(src.opencodeInstructions, path.join(assetRoot, '.opencode', 'instructions'))
  copyDir(src.opencodePlugins, path.join(assetRoot, '.opencode', 'plugins'))
  if (fileExists(src.opencodeHooksConfig)) {
    fs.copyFileSync(src.opencodeHooksConfig, path.join(assetRoot, '.opencode', 'hooks-config.json'))
  }
  fs.copyFileSync(src.agentsMd, path.join(assetRoot, 'AGENTS.md'))

  logSuccess(`Assets installed to: ${assetRoot}`, quiet)
}

function configureHooks(assetRoot, quiet) {
  const hookConfigPath = path.join(assetRoot, '.opencode', 'hooks-config.json')
  const profile = process.env.ECC_HOOK_PROFILE || 'standard'
  const disabled = process.env.ECC_DISABLED_HOOKS
    ? process.env.ECC_DISABLED_HOOKS.split(',').map((item) => item.trim()).filter(Boolean)
    : []

  const config = {
    profile,
    disabled,
    overrides: {},
    version: PACKAGE_VERSION,
  }

  ensureDir(path.dirname(hookConfigPath))
  writeJson(hookConfigPath, config)
  logSuccess('Hook runtime config generated', quiet)
}

function installToTarget({ targetConfigDir, assetRoot, assetPrefix, quiet }) {
  validateSources()

  ensureDir(targetConfigDir)
  copyAssets(assetRoot, quiet)
  configureHooks(assetRoot, quiet)

  const configPath = path.join(targetConfigDir, 'opencode.json')
  const existing = fileExists(configPath) ? readJson(configPath) : {}
  const eocConfig = buildEocConfig(assetPrefix, path.join(assetRoot, 'commands'))
  const merged = mergeConfig(existing, eocConfig)

  writeJson(configPath, merged)
  logSuccess(`Updated configuration: ${configPath}`, quiet)
}

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

async function chooseInstallMode(flags) {
  if (flags.global && flags.project) {
    throw new Error('Use only one mode: --global or --project')
  }
  if (flags.global) return 'global'
  if (flags.project) return 'project'

  if (flags.yes) {
    return 'project'
  }

  const rl = createReadline()
  console.log('')
  console.log('Easy OpenCode Installer')
  console.log('1) Project-level installation (recommended)')
  console.log('2) Global installation')
  const answer = await prompt(rl, 'Enter your choice (1 or 2): ')
  rl.close()

  if (answer === '1') return 'project'
  if (answer === '2') return 'global'

  throw new Error('Invalid choice. Please select 1 or 2.')
}

async function installProject(quiet) {
  const projectDir = process.cwd()
  const targetConfigDir = projectDir
  const assetRoot = path.join(projectDir, '.opencode', 'easy-opencode')
  const assetPrefix = './.opencode/easy-opencode'

  logInfo(`Project directory: ${projectDir}`, quiet)
  installToTarget({ targetConfigDir, assetRoot, assetPrefix, quiet })
  logSuccess('Project-level installation complete', quiet)
}

async function installGlobal(quiet) {
  const globalDir = getGlobalConfigDir()
  const targetConfigDir = globalDir
  const assetRoot = path.join(globalDir, 'easy-opencode')
  const assetPrefix = './easy-opencode'

  logInfo(`Global config directory: ${globalDir}`, quiet)
  installToTarget({ targetConfigDir, assetRoot, assetPrefix, quiet })
  logSuccess('Global installation complete', quiet)
}

async function main() {
  try {
    const flags = parseArgs(process.argv)
    const mode = await chooseInstallMode(flags)

    if (!flags.quiet) {
      console.log('')
      log(`Installing Easy OpenCode v${PACKAGE_VERSION}...`, 'bright', false)
    }

    if (mode === 'global') {
      await installGlobal(flags.quiet)
    } else {
      await installProject(flags.quiet)
    }

    if (!flags.quiet) {
      console.log('')
      logSuccess('Installation finished', false)
      logInfo('Run OpenCode and use /agents or /help to verify command loading.', false)
    }

    process.exit(0)
  } catch (error) {
    logError(`Installation failed: ${error.message}`)
    process.exit(1)
  }
}

main()
