const fs = require('fs');
const path = require('path');
const readline = require('readline');

function printLine(line = '') {
  process.stdout.write(String(line) + '\n');
}

function printError(line = '') {
  process.stderr.write(String(line) + '\n');
}

/** @typedef {'reset'|'bright'|'green'|'yellow'|'blue'|'cyan'|'red'} InstallColor */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

/** @param {string} message @param {InstallColor} [color] @param {boolean} [quiet] */
function log(message, color = 'reset', quiet = false) {
  if (!quiet) {
    printLine(`${colors[color]}${message}${colors.reset}`);
  }
}

/** @param {string} message @param {boolean} [quiet] */
function logInfo(message, quiet = false) {
  log(`[INFO] ${message}`, 'cyan', quiet);
}

/** @param {string} message @param {boolean} [quiet] */
function logWarn(message, quiet = false) {
  log(`[WARN] ${message}`, 'yellow', quiet);
}

/** @param {string} message @param {boolean} [quiet] */
function logSuccess(message, quiet = false) {
  log(`[OK] ${message}`, 'green', quiet);
}

/** @param {string} message */
function logError(message) {
  log(`[ERR] ${message}`, 'red', false);
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

/** @param {string} dirPath */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/** @param {string} filePath */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {string} filePath @param {unknown} data */
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** @param {string} src @param {string} dest */
function copyDir(src, dest) {
  if (!dirExists(src)) {
    return false;
  }

  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  return true;
}

/** @returns {string} */
function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '';
}

function getGlobalConfigDir() {
  return path.join(getHomeDir(), '.opencode');
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{ global: boolean, project: boolean, bootstrap: boolean, yes: boolean, quiet: boolean, allowSourceRepo: boolean, target: string, bundles: string[], presets: string[] }} */
  const result = {
    global: false,
    project: false,
    bootstrap: false,
    yes: false,
    quiet: false,
    allowSourceRepo: false,
    target: '',
    bundles: [],
    presets: [],
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '--global') result.global = true;
    else if (arg === '--project') result.project = true;
    else if (arg === '--bootstrap') result.bootstrap = true;
    else if (arg === '--yes' || arg === '-y') result.yes = true;
    else if (arg === '--quiet') result.quiet = true;
    else if (arg === '--allow-source-repo') result.allowSourceRepo = true;
    else if (arg.startsWith('--bundle=')) result.bundles.push(arg.slice('--bundle='.length));
    else if (arg === '--bundle') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --bundle');
      }
      result.bundles.push(next);
      i += 1;
    }
    else if (arg.startsWith('--preset=')) result.presets.push(arg.slice('--preset='.length));
    else if (arg === '--preset') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --preset');
      }
      result.presets.push(next);
      i += 1;
    }
    else if (arg.startsWith('--target=')) result.target = arg.slice('--target='.length);
    else if (arg === '--target') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --target');
      }
      result.target = next;
      i += 1;
    }
  }

  return result;
}

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/** @param {import('readline').Interface} rl @param {string} question */
function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

module.exports = {
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
  printError,
  printLine,
  prompt,
  readJson,
  writeJson,
};
