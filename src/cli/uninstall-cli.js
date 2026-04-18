#!/usr/bin/env node
/*
 * Easy OpenCode uninstaller
 *
 * Removes Easy OpenCode managed assets from either:
 * - Project: <project>/.opencode/easy-opencode
 * - Global:  ~/.opencode/easy-opencode
 *
 * Also cleans matching references from opencode.json and removes managed project script shims.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/** @typedef {{ global: boolean, project: boolean, yes: boolean, target: string }} UninstallFlags */
/** @typedef {{ changed: boolean, reason: string }} CleanupResult */

function printLine(line = '') {
  process.stdout.write(String(line) + '\n');
}

function printError(line = '') {
  process.stderr.write(String(line) + '\n');
}

/** @returns {string} */
function getHomeDir() {
  return String(process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || process.cwd());
}

/** @returns {string} */
function getGlobalConfigDir() {
  return path.join(getHomeDir(), '.opencode');
}

/** @param {string} filePath */
function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** @param {string} dirPath */
function dirExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/** @param {string} filePath @returns {Record<string, any> | null} */
function readJson(filePath) {
  try {
    return /** @type {Record<string, any>} */ (JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

/** @param {string} filePath @param {unknown} data */
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function createReadline() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

/** @param {readline.Interface} rl @param {string} question @returns {Promise<string>} */
function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(String(answer).trim()));
  });
}

/** @param {string[]} argv @returns {UninstallFlags} */
function parseArgs(argv) {
  /** @type {UninstallFlags} */
  const result = {
    global: false,
    project: false,
    yes: false,
    target: '',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    if (arg === '--global') result.global = true;
    else if (arg === '--project') result.project = true;
    else if (arg === '--yes' || arg === '-y') result.yes = true;
    else if (arg.startsWith('--target=')) result.target = arg.slice('--target='.length);
    else if (arg === '--target') {
      const next = argv[i + 1];
      if (!next || String(next).startsWith('--')) {
        throw new Error('Missing value for --target');
      }
      result.target = String(next);
      i += 1;
    }
  }

  return result;
}

/** @param {UninstallFlags} flags @returns {'global' | 'project'} */
function resolveMode(flags) {
  if (flags.global && flags.project) {
    throw new Error('Use only one mode: --global or --project');
  }
  if (flags.global) return 'global';
  if (flags.project) return 'project';
  return 'global';
}

/** @param {string} configPath @param {string} pathPrefix @returns {CleanupResult} */
function cleanConfig(configPath, pathPrefix) {
  if (!fileExists(configPath)) {
    return { changed: false, reason: 'opencode.json not found' };
  }

  const config = readJson(configPath);
  if (!config) {
    return { changed: false, reason: 'opencode.json is invalid JSON' };
  }

  let changed = false;

  if (Array.isArray(config.instructions)) {
    const next = config.instructions.filter((item) => typeof item !== 'string' || !item.startsWith(pathPrefix));
    if (next.length !== config.instructions.length) {
      config.instructions = next;
      changed = true;
    }
    if (config.instructions.length === 0) delete config.instructions;
  }

  if (Array.isArray(config.plugin)) {
    const next = config.plugin.filter((item) => typeof item !== 'string' || !item.startsWith(pathPrefix));
    if (next.length !== config.plugin.length) {
      config.plugin = next;
      changed = true;
    }
    if (config.plugin.length === 0) delete config.plugin;
  }

  if (config.agent && typeof config.agent === 'object') {
    for (const [key, value] of Object.entries(config.agent)) {
      if (
        value &&
        typeof value === 'object' &&
        typeof value.prompt === 'string' &&
        value.prompt.includes(`{file:${pathPrefix}`)
      ) {
        delete config.agent[key];
        changed = true;
      }
    }
    if (Object.keys(config.agent).length === 0) delete config.agent;
  }

  if (config.command && typeof config.command === 'object') {
    for (const [key, value] of Object.entries(config.command)) {
      if (
        value &&
        typeof value === 'object' &&
        typeof value.template === 'string' &&
        value.template.includes(`{file:${pathPrefix}`)
      ) {
        delete config.command[key];
        changed = true;
      }
    }
    if (Object.keys(config.command).length === 0) delete config.command;
  }

  if (config.default_agent && typeof config.default_agent === 'string' && config.default_agent.startsWith('eoc_')) {
    delete config.default_agent;
    changed = true;
  }

  if (changed) {
    writeJson(configPath, config);
  }

  return { changed, reason: changed ? 'updated' : 'no Easy OpenCode entries found' };
}

/** @param {string} content */
function isManagedShim(content) {
  return content.includes('Easy OpenCode script shim');
}

/** @param {string} projectDir */
function projectHasManagedShims(projectDir) {
  const scriptsDir = path.join(projectDir, 'scripts');
  if (!dirExists(scriptsDir)) return false;
  return fs.readdirSync(scriptsDir, { withFileTypes: true }).some((entry) => {
    if (!entry.isFile() || !entry.name.endsWith('.js')) return false;
    const content = fs.readFileSync(path.join(scriptsDir, entry.name), 'utf8');
    return isManagedShim(content);
  });
}

/** @param {string} projectDir @returns {{ removed: number }} */
function removeManagedProjectShims(projectDir) {
  const scriptsDir = path.join(projectDir, 'scripts');
  if (!dirExists(scriptsDir)) return { removed: 0 };

  let removed = 0;
  for (const entry of fs.readdirSync(scriptsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const filePath = path.join(scriptsDir, entry.name);
    const content = fs.readFileSync(filePath, 'utf8');
    if (!isManagedShim(content)) continue;
    fs.rmSync(filePath, { force: true });
    removed += 1;
  }
  return { removed };
}

/** @param {UninstallFlags} flags @param {string[]} lines @returns {Promise<boolean>} */
async function confirmRemoval(flags, lines) {
  if (flags.yes) return true;
  const rl = createReadline();
  printLine('');
  printLine('This will remove:');
  lines.forEach((line) => printLine(`- ${line}`));
  printLine('');
  const answer = await prompt(rl, 'Continue? (y/N): ');
  rl.close();
  return answer.toLowerCase() === 'y';
}

/** @param {UninstallFlags} flags */
async function uninstallProject(flags) {
  const projectDir = flags.target ? path.resolve(flags.target) : process.cwd();
  const assetDir = path.join(projectDir, '.opencode', 'easy-opencode');
  const configPath = path.join(projectDir, 'opencode.json');
  const hasManagedShims = projectHasManagedShims(projectDir);

  printLine('');
  printLine('Easy OpenCode Uninstaller (project mode)');
  printLine(`Project directory: ${projectDir}`);

  if (!dirExists(assetDir) && !fileExists(configPath) && !hasManagedShims) {
    printLine('Nothing to remove. Easy OpenCode project assets were not found.');
    process.exit(0);
  }

  const ok = await confirmRemoval(flags, [
    ...(dirExists(assetDir) ? [assetDir] : []),
    ...(fileExists(configPath) ? ['Easy OpenCode references from project opencode.json'] : []),
    ...(hasManagedShims ? ['Managed Easy OpenCode script shims under scripts/*.js'] : []),
  ]);
  if (!ok) {
    printLine('Cancelled.');
    process.exit(0);
  }

  const shimResult = removeManagedProjectShims(projectDir);
  if (dirExists(assetDir)) {
    fs.rmSync(assetDir, { recursive: true, force: true });
    printLine(`Removed: ${assetDir}`);
  }
  const result = cleanConfig(configPath, './.opencode/easy-opencode/');
  printLine(`Config cleanup: ${result.reason}`);
  printLine(`Removed managed script shims: ${shimResult.removed}`);
  printLine('Uninstall complete.');
}

/** @param {UninstallFlags} flags */
async function uninstallGlobal(flags) {
  const globalDir = getGlobalConfigDir();
  const assetDir = path.join(globalDir, 'easy-opencode');
  const configPath = path.join(globalDir, 'opencode.json');

  printLine('');
  printLine('Easy OpenCode Uninstaller (global mode)');
  printLine(`Global config directory: ${globalDir}`);

  if (!dirExists(globalDir)) {
    printLine('Nothing to remove. Global OpenCode directory does not exist.');
    process.exit(0);
  }

  if (!dirExists(assetDir) && !fileExists(configPath)) {
    printLine('Nothing to remove. Easy OpenCode assets were not found.');
    process.exit(0);
  }

  const ok = await confirmRemoval(flags, [
    ...(dirExists(assetDir) ? [assetDir] : []),
    ...(fileExists(configPath) ? ['Easy OpenCode references from global opencode.json'] : []),
  ]);
  if (!ok) {
    printLine('Cancelled.');
    process.exit(0);
  }

  if (dirExists(assetDir)) {
    fs.rmSync(assetDir, { recursive: true, force: true });
    printLine(`Removed: ${assetDir}`);
  }

  const result = cleanConfig(configPath, './easy-opencode/');
  printLine(`Config cleanup: ${result.reason}`);
  printLine('Uninstall complete.');
}

async function main() {
  const flags = parseArgs(process.argv);
  const mode = resolveMode(flags);
  if (mode === 'project') {
    await uninstallProject(flags);
  } else {
    await uninstallGlobal(flags);
  }
  process.exit(0);
}

module.exports = {
  cleanConfig,
  confirmRemoval,
  main,
  parseArgs,
  resolveMode,
  uninstallGlobal,
  uninstallProject,
};

if (require.main === module) {
  main().catch((error) => {
    printError(`Uninstall failed: ${error.message}`);
    process.exit(1);
  });
}
