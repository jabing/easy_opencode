const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runReleaseCheck } = require('./check.js');
const { buildReleaseConclusionEnvelope } = require('./conclusion.js');
const { createSnapshot, getGitRepoState } = require('../project/git-state.js');
const { appendEvent, resolveObservabilityDir } = require('../../control-plane/observability/index.js');

/** @typedef {{ code: number, stdout: string, stderr: string }} CommandResult */
/** @typedef {{ strict?: boolean, baselineName?: string, policy?: string, snapshotLabel?: string, benchmarkInput?: Record<string, unknown> }} ReleaseRehearsalOptions */

/** @param {unknown} value */
function sanitizeName(value) {
  return String(value || 'workspace').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
}

/** @param {string | null | undefined} relPath */
function shouldSkip(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/');
  if (!normalized || normalized === '.') return false;
  return [
    '.git',
    'node_modules',
    '.DS_Store',
    'easy-opencode-*.tgz',
  ].some((entry) => normalized === entry || normalized.startsWith(`${entry}/`));
}

/** @param {string} sourceRoot @param {string} targetRoot */
function copyWorkspace(sourceRoot, targetRoot) {
  fs.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    filter: /** @param {string} src */ (src) => {
      const rel = path.relative(sourceRoot, src);
      return !shouldSkip(rel);
    },
  });
}

/** @param {string} rootDir @param {string[]} args @returns {CommandResult} */
function runGit(rootDir, args) {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'easy-opencode',
      GIT_AUTHOR_EMAIL: 'easy-opencode@example.com',
      GIT_COMMITTER_NAME: 'easy-opencode',
      GIT_COMMITTER_EMAIL: 'easy-opencode@example.com',
    },
  });
  return {
    code: typeof result.status === 'number' ? result.status : 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

/** @param {string} stdout @param {string} stderr */
function summarizeOutput(stdout, stderr) {
  const text = `${stdout || ''}\n${stderr || ''}`.trim();
  if (!text) return 'ok';
  return text.split(/\r?\n/).find(Boolean) || 'ok';
}

/** @param {string} rootDir */
function initSandboxGitRepo(rootDir) {
  /** @type {string[][]} */
  const steps = [
    ['init', '-q'],
    ['config', 'user.name', 'easy-opencode'],
    ['config', 'user.email', 'easy-opencode@example.com'],
    ['add', '.'],
    ['commit', '-qm', 'release rehearsal'],
  ];
  for (const args of steps) {
    const result = runGit(rootDir, args);
    if (result.code !== 0) {
      throw new Error(`git ${args[0]} failed: ${summarizeOutput(result.stdout, result.stderr)}`);
    }
  }
}

/** @param {string} sourceRoot @param {ReleaseRehearsalOptions} [_options] */
function createRehearsalWorkspace(sourceRoot, _options = {}) {
  const rehearsalRoot = fs.mkdtempSync(path.join(os.tmpdir(), `easy-opencode-release-rehearsal-${sanitizeName(path.basename(sourceRoot))}-`));
  copyWorkspace(sourceRoot, rehearsalRoot);
  initSandboxGitRepo(rehearsalRoot);
  return rehearsalRoot;
}

/** @param {string} rootDir */
function resolveRehearsalDir(rootDir) {
  return path.join(resolveObservabilityDir(rootDir), 'release-rehearsals');
}

/** @param {string} rootDir @param {{ generated_at?: string }} report */
function writeRehearsalReport(rootDir, report) {
  const dir = resolveRehearsalDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = String(report.generated_at || new Date().toISOString()).replace(/[:.]/g, '-');
  const filePath = path.join(dir, `${stamp}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return filePath;
}

/** @param {string | null | undefined} rootDir @param {ReleaseRehearsalOptions} [options] */
function runReleaseRehearsal(rootDir, options = {}) {
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const sourceState = getGitRepoState(resolvedRoot);
  const rehearsalRoot = createRehearsalWorkspace(resolvedRoot, options);
  const snapshot = createSnapshot(rehearsalRoot, { label: options.snapshotLabel || 'release-rehearsal' });
  const releaseReport = runReleaseCheck(rehearsalRoot, {
    strict: options.strict !== false,
    baselineName: options.baselineName || 'release',
    policy: options.policy || 'standard',
    snapshotLabel: options.snapshotLabel || 'release-rehearsal',
    benchmarkInput: options.benchmarkInput || {},
  });
  const rehearsalState = getGitRepoState(rehearsalRoot);
  const decision = releaseReport.decision;
  const releaseConclusion = releaseReport && releaseReport.release_conclusion ? releaseReport.release_conclusion : null;
  const report = {
    schema_version: '1.2',
    generated_at: new Date().toISOString(),
    root_dir: resolvedRoot,
    rehearsal_root: rehearsalRoot,
    strict: options.strict !== false,
    source_repo_state: {
      is_git_repo: sourceState.is_git_repo,
      branch: sourceState.branch,
      head: sourceState.head,
      dirty: sourceState.dirty,
    },
    rehearsal_repo_state: {
      is_git_repo: rehearsalState.is_git_repo,
      branch: rehearsalState.branch,
      head: rehearsalState.head,
      dirty: rehearsalState.dirty,
    },
    snapshot,
    release_report: releaseReport,
    release_conclusion: releaseConclusion,
    release_conclusion_schema: releaseConclusion ? buildReleaseConclusionEnvelope(releaseConclusion) : null,
    decision,
  };
  const reportPath = writeRehearsalReport(resolvedRoot, report);
  appendEvent(resolvedRoot, 'release.rehearsal.completed', {
    flow: 'release',
    status: decision,
    rehearsal_root: rehearsalRoot,
    strict: options.strict !== false,
    policy: options.policy || 'standard',
    source_is_git_repo: sourceState.is_git_repo,
    source_dirty: sourceState.dirty,
    report_path: reportPath,
  });
  return { ...report, report_path: reportPath };
}

module.exports = {
  createRehearsalWorkspace,
  resolveRehearsalDir,
  runReleaseRehearsal,
  writeRehearsalReport,
};
