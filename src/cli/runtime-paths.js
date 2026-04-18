const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/** @typedef {{ cwd?: string, assetRoot?: string }} LauncherOptions */
/** @typedef {{ assetRoot?: string, cwd?: string, stdio?: string, encoding?: string, env?: Record<string, string | undefined> }} ManagedRunOptions */

/** @param {string} scriptName */
function normalizeScriptName(scriptName) {
  const raw = String(scriptName || '').trim();
  if (!raw) throw new Error('script name is required');
  return raw.replace(/\.js$/i, '');
}

function resolveAssetRoot() {
  const envRoot = String(process.env.EOC_ASSET_ROOT || '').trim();
  if (envRoot) {
    const resolved = path.resolve(envRoot);
    if (fs.existsSync(resolved)) return resolved;
  }
  return path.resolve(__dirname, '..', '..');
}

/** @param {string} scriptName @param {string} [assetRoot] */
function resolveManagedScript(scriptName, assetRoot = resolveAssetRoot()) {
  const normalized = normalizeScriptName(scriptName);
  const filePath = path.join(assetRoot, 'scripts', `${normalized}.js`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Managed script not found: ${normalized} (${filePath})`);
  }
  return filePath;
}

/** @param {string} value */
function shellQuote(value) {
  const raw = String(value || '');
  if (/^[A-Za-z0-9_./:-]+$/.test(raw)) return raw;
  return JSON.stringify(raw);
}

/** @param {string} fromDir @param {string} toPath */
function toPosixRelative(fromDir, toPath) {
  const rel = path.relative(fromDir, toPath).replace(/\\/g, '/');
  if (!rel) return '.';
  if (rel.startsWith('.')) return rel;
  return `./${rel}`;
}

/** @param {LauncherOptions} [options] */
function resolveLauncherPath(options = {}) {
  const launcher = path.join(options.assetRoot || resolveAssetRoot(), 'bin', 'eoc-script.js');
  const rel = toPosixRelative(path.resolve(options.cwd || process.cwd()), launcher);
  if (!rel.startsWith('..')) return rel;
  return launcher;
}

/** @param {string} scriptName @param {string[]} [args] @param {LauncherOptions} [options] */
function formatManagedInvocation(scriptName, args = [], options = {}) {
  const launcherPath = resolveLauncherPath(options);
  return ['node', shellQuote(launcherPath), normalizeScriptName(scriptName), ...args.map(shellQuote)].join(' ');
}

/** @param {string} scriptName @param {string[]} [args] @param {ManagedRunOptions} [options] */
function runManagedScript(scriptName, args = [], options = {}) {
  const assetRoot = options.assetRoot || resolveAssetRoot();
  const scriptPath = resolveManagedScript(scriptName, assetRoot);
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd || process.cwd(),
    stdio: options.stdio || 'inherit',
    shell: false,
    windowsHide: true,
    encoding: options.encoding || 'utf8',
    env: { ...process.env, EOC_ASSET_ROOT: assetRoot, ...(options.env || {}) },
  });
}

module.exports = {
  normalizeScriptName,
  resolveAssetRoot,
  resolveManagedScript,
  resolveLauncherPath,
  formatManagedInvocation,
  runManagedScript,
  shellQuote,
};
