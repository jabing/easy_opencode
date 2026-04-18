const { spawnSync } = require('child_process');

/**
 * @typedef {{ status: number, stdout: string, stderr: string, ok: boolean }} SpawnTextResult
 */

/** @param {string} command @param {string[]} args @param {string} cwd @returns {SpawnTextResult} */
function spawnText(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
  });
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    ok: result.status === 0,
  };
}

/** @param {string} root */
function hasGit(root) {
  const res = spawnText('git', ['rev-parse', '--is-inside-work-tree'], root);
  return res.ok && res.stdout.trim() === 'true';
}

/** @param {string} root */
function getGitChangedFiles(root) {
  if (!hasGit(root)) return [];
  const res = spawnText('git', ['status', '--short'], root);
  if (!res.ok) return [];
  return res.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .slice(0, 200);
}

module.exports = {
  getGitChangedFiles,
  hasGit,
  spawnText,
};
