const fs = require('fs')
const path = require('path')
const { buildEocConfig } = require('../shared/opencode-config.js')
const { bootstrapEcosystem } = require('../core/ecosystem/install-bootstrap.js')
const { shellQuote } = require('./runtime-paths.js')
const {
  copyDir,
  createReadline,
  dirExists,
  ensureDir,
  fileExists,
  getGlobalConfigDir,
  log,
  logError,
  logInfo,
  logSuccess,
  logWarn,
  parseArgs,
  printLine,
  prompt,
  readJson,
  writeJson,
} = require('./install-support.js')

/** @typedef {{ global: boolean, project: boolean, bootstrap: boolean, yes: boolean, quiet: boolean, allowSourceRepo: boolean, target: string, bundles: string[], presets: string[] }} InstallFlags */
/** @typedef {{ commands: string, skills: string, prompts: string, scripts: string, src: string, bin: string, packageJson: string, readme: string, license: string, opencodeJson: string, opencodeInstructions: string, opencodePlugins: string, opencodeHooksConfig: string, opencodeCommandPolicy: string, agentsMd: string }} SourcePaths */
/** @typedef {{ copied: string[], missing: string[] }} CopyRuntimeResult */
/** @typedef {{ targetConfigDir: string, assetRoot: string, assetPrefix: string, quiet: boolean, installMode: 'project'|'global', projectDir: string }} InstallTargetOptions */
/** @typedef {Record<string, any>} JsonMap */

const SOURCE_ROOT = path.resolve(__dirname, '..', '..')
const resolveFromSource = /** @type {{ resolve: (id: string) => string }} */ (/** @type {unknown} */ (require))
const PACKAGE_JSON_PATH = path.join(SOURCE_ROOT, 'package.json')
const PACKAGE_VERSION = readJson(PACKAGE_JSON_PATH)?.version || '0.0.0'

/** @returns {SourcePaths} */
function getSourcePaths() {
  return {
    commands: path.join(SOURCE_ROOT, 'commands'),
    skills: path.join(SOURCE_ROOT, 'skills'),
    prompts: path.join(SOURCE_ROOT, 'prompts'),
    scripts: path.join(SOURCE_ROOT, 'scripts'),
    src: path.join(SOURCE_ROOT, 'src'),
    bin: path.join(SOURCE_ROOT, 'bin'),
    packageJson: path.join(SOURCE_ROOT, 'package.json'),
    readme: path.join(SOURCE_ROOT, 'README.md'),
    license: path.join(SOURCE_ROOT, 'LICENSE'),
    opencodeJson: path.join(SOURCE_ROOT, 'opencode.json'),
    opencodeInstructions: path.join(SOURCE_ROOT, '.opencode', 'instructions'),
    opencodePlugins: path.join(SOURCE_ROOT, '.opencode', 'plugins'),
    opencodeHooksConfig: path.join(SOURCE_ROOT, '.opencode', 'hooks-config.json'),
    opencodeCommandPolicy: path.join(SOURCE_ROOT, '.opencode', 'command-policy.json'),
    agentsMd: path.join(SOURCE_ROOT, 'AGENTS.md'),
  }
}

function validateSources() {
  const src = getSourcePaths()
  /** @type {string[]} */
  const missing = []

  if (!dirExists(src.commands)) missing.push('commands/')
  if (!dirExists(src.skills)) missing.push('skills/')
  if (!dirExists(src.prompts)) missing.push('prompts/')
  if (!dirExists(src.scripts)) missing.push('scripts/')
  if (!dirExists(src.src)) missing.push('src/')
  if (!dirExists(src.bin)) missing.push('bin/')
  if (!fileExists(src.packageJson)) missing.push('package.json')
  if (!fileExists(src.readme)) missing.push('README.md')
  if (!fileExists(src.license)) missing.push('LICENSE')
  if (!fileExists(src.opencodeJson)) missing.push('opencode.json')
  if (!dirExists(src.opencodeInstructions)) missing.push('.opencode/instructions/')
  if (!dirExists(src.opencodePlugins)) missing.push('.opencode/plugins/')
  if (!fileExists(src.opencodeCommandPolicy)) missing.push('.opencode/command-policy.json')
  if (!fileExists(src.agentsMd)) missing.push('AGENTS.md')

  if (missing.length > 0) {
    throw new Error(`Installer source is incomplete. Missing: ${missing.join(', ')}`)
  }
}

/** @param {string} dirPath */
function looksLikePluginSourceRepo(dirPath) {
  if (!dirPath) return false
  const pkg = /** @type {JsonMap | null} */ (readJson(path.join(dirPath, 'package.json')))
  return Boolean(
    pkg &&
    pkg.name === 'easy-opencode' &&
    dirExists(path.join(dirPath, 'commands')) &&
    dirExists(path.join(dirPath, 'skills')) &&
    dirExists(path.join(dirPath, 'prompts')) &&
    fileExists(path.join(dirPath, 'scripts', 'install.js'))
  )
}

/** @param {InstallFlags} flags */
function resolveProjectTarget(flags) {
  if (flags.target) {
    return path.resolve(flags.target)
  }
  return process.cwd()
}

/** @param {string} projectDir @param {InstallFlags} flags */
function ensureSafeProjectTarget(projectDir, flags) {
  const allowSourceRepo = flags.allowSourceRepo || process.env.EOC_ALLOW_SOURCE_REPO === '1'
  if (looksLikePluginSourceRepo(projectDir) && !allowSourceRepo) {
    throw new Error(
      [
        'Refusing to install project mode into the plugin source repository itself.',
        'Run the installer from your target project, or pass --target <project-dir>.',
        'Use --allow-source-repo only when you intentionally want to test installed mode inside the source repository.',
      ].join(' ')
    )
  }
}

/** @param {JsonMap | null | undefined} existingConfig @param {JsonMap} eocConfig @returns {JsonMap} */
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

/** @param {string} assetRoot @param {'project'|'global'} mode @param {string} projectDir */
function buildLauncherCommand(assetRoot, mode, projectDir) {
  const launcherPath = path.join(assetRoot, 'bin', 'eoc-script.js')
  if (mode === 'project') {
    const rel = path.relative(projectDir, launcherPath).replace(/\\/g, '/')
    const normalized = rel.startsWith('.') ? rel : `./${rel}`
    return `node ${shellQuote(normalized)}`
  }
  return `node ${shellQuote(launcherPath)}`
}

/** @param {unknown} content @param {string} launcherCommand */
function renderCommandMarkdown(content, launcherCommand) {
  return String(content || '')
    .replace(/node\s+scripts\/([A-Za-z0-9_.-]+)\.js/g, (match, name) => `${launcherCommand} ${name}`)
    .replace(/`scripts\/([A-Za-z0-9_.-]+)\.js`/g, (match, name) => `\`${launcherCommand} ${name}\``)
}

/** @param {string} srcDir @param {string} destDir @param {string} launcherCommand */
function copyRenderedCommands(srcDir, destDir, launcherCommand) {
  ensureDir(destDir)
  const entries = fs.readdirSync(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      copyRenderedCommands(srcPath, destPath, launcherCommand)
    } else if (entry.isFile()) {
      const raw = fs.readFileSync(srcPath, 'utf8')
      fs.writeFileSync(destPath, renderCommandMarkdown(raw, launcherCommand), 'utf8')
    }
  }
}

/** @param {string} packageName @returns {string} */
function resolveDependencyPackageDir(packageName) {
  const pkgJsonRef = `${packageName}/package.json`
  try {
    return path.dirname(resolveFromSource.resolve(pkgJsonRef))
  } catch {
    return ''
  }
}

/** @param {string} assetRoot @param {boolean} quiet @returns {CopyRuntimeResult} */
function copyRuntimeDependencies(assetRoot, quiet) {
  const pkg = /** @type {JsonMap} */ (readJson(PACKAGE_JSON_PATH) || {})
  const dependencyNames = Object.keys(pkg.dependencies || {}).sort((a, b) => a.localeCompare(b))
  if (dependencyNames.length === 0) {
    return { copied: [], missing: [] }
  }

  const targetNodeModules = path.join(assetRoot, 'node_modules')
  ensureDir(targetNodeModules)

  /** @type {string[]} */
  const copied = []
  /** @type {string[]} */
  const missing = []
  const seen = new Set()

  /** @param {string} packageName */
  function copyDependencyRecursive(packageName) {
    if (!packageName || seen.has(packageName)) return
    seen.add(packageName)

    const pkgDir = resolveDependencyPackageDir(packageName)
    if (!pkgDir) {
      missing.push(packageName)
      return
    }

    const targetDir = path.join(targetNodeModules, ...packageName.split('/'))
    copyDir(pkgDir, targetDir)
    copied.push(packageName)

    const depPkg = /** @type {JsonMap} */ (readJson(path.join(pkgDir, 'package.json')) || {})
    const nestedDeps = {
      ...(depPkg.dependencies || {}),
      ...(depPkg.optionalDependencies || {}),
    }
    for (const nestedName of Object.keys(nestedDeps).sort((a, b) => a.localeCompare(b))) {
      copyDependencyRecursive(nestedName)
    }
  }

  for (const dependencyName of dependencyNames) {
    copyDependencyRecursive(dependencyName)
  }

  if (copied.length > 0) {
    logSuccess(`Runtime dependencies vendored: ${copied.join(', ')}`, quiet)
  }
  if (missing.length > 0) {
    logWarn(`Runtime dependencies unavailable for vendoring: ${missing.join(', ')}`, quiet)
  }

  return { copied, missing }
}

/** @param {string} assetRoot @param {boolean} quiet @param {'project'|'global'} installMode @param {string} projectDir */
function copyAssets(assetRoot, quiet, installMode, projectDir) {
  const src = getSourcePaths()
  fs.rmSync(assetRoot, { recursive: true, force: true })
  ensureDir(assetRoot)
  ensureDir(path.join(assetRoot, '.opencode'))

  const launcherCommand = buildLauncherCommand(assetRoot, installMode, projectDir || assetRoot)
  copyRenderedCommands(src.commands, path.join(assetRoot, 'commands'), launcherCommand)
  copyDir(src.skills, path.join(assetRoot, 'skills'))
  copyDir(src.prompts, path.join(assetRoot, 'prompts'))
  copyDir(src.scripts, path.join(assetRoot, 'scripts'))
  copyDir(src.src, path.join(assetRoot, 'src'))
  copyDir(src.bin, path.join(assetRoot, 'bin'))
  copyDir(src.opencodeInstructions, path.join(assetRoot, '.opencode', 'instructions'))
  copyDir(src.opencodePlugins, path.join(assetRoot, '.opencode', 'plugins'))
  if (fileExists(src.opencodeHooksConfig)) {
    fs.copyFileSync(src.opencodeHooksConfig, path.join(assetRoot, '.opencode', 'hooks-config.json'))
  }
  if (fileExists(src.opencodeCommandPolicy)) {
    fs.copyFileSync(src.opencodeCommandPolicy, path.join(assetRoot, '.opencode', 'command-policy.json'))
  }
  fs.copyFileSync(src.packageJson, path.join(assetRoot, 'package.json'))
  fs.copyFileSync(src.readme, path.join(assetRoot, 'README.md'))
  fs.copyFileSync(src.license, path.join(assetRoot, 'LICENSE'))
  fs.copyFileSync(src.agentsMd, path.join(assetRoot, 'AGENTS.md'))
  copyRuntimeDependencies(assetRoot, quiet)

  logSuccess(`Assets installed to: ${assetRoot}`, quiet)
}

/** @param {string} assetRoot @param {boolean} quiet */
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

/** @param {unknown} content */
function isManagedShim(content) {
  return typeof content === 'string' && content.includes('Easy OpenCode script shim')
}

/** @param {string} projectDir @param {string} assetRoot @param {boolean} quiet */
function createProjectScriptShims(projectDir, assetRoot, quiet) {
  const sourceScriptsDir = path.join(assetRoot, 'scripts')
  if (!dirExists(sourceScriptsDir)) {
    throw new Error(`Installed assets missing scripts directory: ${sourceScriptsDir}`)
  }

  const targetScriptsDir = path.join(projectDir, 'scripts')
  ensureDir(targetScriptsDir)

  const entries = fs.readdirSync(sourceScriptsDir, { withFileTypes: true })
  /** @type {string[]} */
  const created = []
  /** @type {string[]} */
  const skipped = []
  const executableScripts = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .filter((name) => !['npm-install.js', 'npm-postinstall.js'].includes(name))
    .sort((a, b) => a.localeCompare(b))

  for (const fileName of executableScripts) {
    const shimPath = path.join(targetScriptsDir, fileName)
    const relativeTarget = path
      .relative(targetScriptsDir, path.join(assetRoot, 'scripts', fileName))
      .replace(/\\/g, '/')
    const shimBody = [
      '#!/usr/bin/env node',
      '// Easy OpenCode script shim. Safe to regenerate.',
      "const { spawnSync } = require('child_process')",
      "const path = require('path')",
      `const target = path.resolve(__dirname, '${relativeTarget}')`,
      "const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' })",
      "if (result.error) throw result.error",
      "process.exit(typeof result.status === 'number' ? result.status : 1)",
      '',
    ]
    const shimContent = shimBody.join('\n')

    if (fileExists(shimPath)) {
      const existing = fs.readFileSync(shimPath, 'utf8')
      if (!isManagedShim(existing)) {
        skipped.push(fileName)
        continue
      }
    }

    fs.writeFileSync(shimPath, shimContent, 'utf8')
    created.push(fileName)
  }

  if (created.length > 0) {
    logSuccess(`Project script shims refreshed: ${created.length}`, quiet)
  }
  if (skipped.length > 0) {
    logWarn(`Skipped existing non-managed project scripts: ${skipped.join(', ')}`, quiet)
  }
}

/** @param {InstallTargetOptions} options */
function installToTarget({ targetConfigDir, assetRoot, assetPrefix, quiet, installMode, projectDir }) {
  validateSources()

  ensureDir(targetConfigDir)
  copyAssets(assetRoot, quiet, installMode, projectDir)
  configureHooks(assetRoot, quiet)

  const configPath = path.join(targetConfigDir, 'opencode.json')
  const existing = /** @type {JsonMap} */ (fileExists(configPath) ? readJson(configPath) || {} : {})
  const eocConfig = /** @type {JsonMap} */ (buildEocConfig(assetPrefix, path.join(assetRoot, 'commands')))
  const merged = mergeConfig(existing, eocConfig)

  writeJson(configPath, merged)
  logSuccess(`Updated configuration: ${configPath}`, quiet)

  const standaloneConfig = buildEocConfig('.', path.join(assetRoot, 'commands'))
  writeJson(path.join(assetRoot, 'opencode.json'), standaloneConfig)
  logSuccess(`Standalone asset config generated: ${path.join(assetRoot, 'opencode.json')}`, quiet)
}

/** @param {InstallFlags} flags */
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
  printLine('')
  printLine('Easy OpenCode Installer')
  printLine('1) Project-level installation (recommended)')
  printLine('2) Global installation')
  const answer = await prompt(rl, 'Enter your choice (1 or 2): ')
  rl.close()

  if (answer === '1') return 'project'
  if (answer === '2') return 'global'

  throw new Error('Invalid choice. Please select 1 or 2.')
}

/** @param {InstallFlags} flags */
async function installProject(flags) {
  const quiet = flags.quiet
  const projectDir = resolveProjectTarget(flags)
  ensureSafeProjectTarget(projectDir, flags)
  const targetConfigDir = projectDir
  const assetRoot = path.join(projectDir, '.opencode', 'easy-opencode')
  const assetPrefix = './.opencode/easy-opencode'

  logInfo(`Project directory: ${projectDir}`, quiet)
  installToTarget({ targetConfigDir, assetRoot, assetPrefix, quiet, installMode: 'project', projectDir })
  createProjectScriptShims(projectDir, assetRoot, quiet)
  if (flags.bootstrap || (Array.isArray(flags.bundles) && flags.bundles.length > 0)) {
    const result = bootstrapEcosystem(projectDir, flags)
    if (result.effective_bundles.length > 0) logSuccess(`Ecosystem bundles applied: ${result.effective_bundles.join(', ')}`, quiet)
    else logInfo('No ecosystem bundles were applied', quiet)
    if (result.unknown_bundles.length > 0) logWarn(`Ignored unknown ecosystem bundles: ${result.unknown_bundles.join(', ')}`, quiet)
  }
  logSuccess('Project-level installation complete', quiet)
}

/** @param {InstallFlags} flags */
async function installGlobal(flags) {
  const quiet = flags.quiet
  const globalDir = getGlobalConfigDir()
  const targetConfigDir = globalDir
  const assetRoot = path.join(globalDir, 'easy-opencode')
  const assetPrefix = './easy-opencode'

  logInfo(`Global config directory: ${globalDir}`, quiet)
  installToTarget({ targetConfigDir, assetRoot, assetPrefix, quiet, installMode: 'global', projectDir: globalDir })
  if (flags.bootstrap || (Array.isArray(flags.bundles) && flags.bundles.length > 0)) {
    const result = bootstrapEcosystem(assetRoot, flags)
    if (result.effective_bundles.length > 0) logSuccess(`Ecosystem bundles applied: ${result.effective_bundles.join(', ')}`, quiet)
    else logInfo('No ecosystem bundles were applied', quiet)
    if (result.unknown_bundles.length > 0) logWarn(`Ignored unknown ecosystem bundles: ${result.unknown_bundles.join(', ')}`, quiet)
  }
  logSuccess('Global installation complete', quiet)
}

async function main() {
  try {
    const flags = /** @type {InstallFlags} */ (parseArgs(process.argv))
    const mode = await chooseInstallMode(flags)

    if (!flags.quiet) {
      printLine('')
      log(`Installing Easy OpenCode v${PACKAGE_VERSION}...`, 'bright', false)
    }

    if (mode === 'global') {
      await installGlobal(flags)
    } else {
      await installProject(flags)
    }

    if (!flags.quiet) {
      printLine('')
      logSuccess('Installation finished', false)
      logInfo('Run OpenCode and use /agents or /help to verify command loading.', false)
    }

    process.exit(0)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Installation failed: ${message}`)
    process.exit(1)
  }
}

module.exports = {
  buildLauncherCommand,
  chooseInstallMode,
  configureHooks,
  copyAssets,
  copyRuntimeDependencies,
  createProjectScriptShims,
  ensureSafeProjectTarget,
  getSourcePaths,
  installGlobal,
  installProject,
  installToTarget,
  bootstrapEcosystem,
  isManagedShim,
  looksLikePluginSourceRepo,
  main,
  mergeConfig,
  renderCommandMarkdown,
  resolveDependencyPackageDir,
  resolveProjectTarget,
  validateSources,
}

if (require.main === module) {
  main()
}
