const { spawnSync } = require('child_process');

/** @param {string} rootDir @param {string[]} args */
function runGit(rootDir, args) {
  return spawnSync('git', args, {
    cwd: rootDir,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
  });
}

/** @param {string} stdout */
function readLines(stdout) {
  return String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** @param {string} rootDir @param {string[]} args */
function readGitLines(rootDir, args) {
  const result = runGit(rootDir, args);
  if (typeof result.status !== 'number' || result.status !== 0) return [];
  return readLines(result.stdout);
}

/** @param {string} rootDir */
function collectPatchSurface(rootDir) {
  const unstaged_files = readGitLines(rootDir, ['diff', '--name-only']);
  const staged_files = readGitLines(rootDir, ['diff', '--cached', '--name-only']);
  const untracked_files = readGitLines(rootDir, ['ls-files', '--others', '--exclude-standard']);
  const deleted_files = Array.from(new Set([
    ...readGitLines(rootDir, ['diff', '--name-only', '--diff-filter=D']),
    ...readGitLines(rootDir, ['diff', '--cached', '--name-only', '--diff-filter=D']),
  ]));
  const all_touched_files = Array.from(new Set([
    ...unstaged_files,
    ...staged_files,
    ...untracked_files,
    ...deleted_files,
  ])).sort();

  return {
    unstaged_files,
    staged_files,
    untracked_files,
    deleted_files,
    all_touched_files,
  };
}

module.exports = {
  collectPatchSurface,
};
