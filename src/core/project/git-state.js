const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

/** @typedef {{ code: number, stdout: string, stderr: string }} GitCommandResult */
/** @typedef {{ code: string, path: string, raw: string }} StatusEntry */
/** @typedef {{ path: string, sha256: string }} TargetFingerprint */
/** @typedef {{ root_dir: string, collected_at: string, is_git_repo: boolean, branch: string | null, head: string | null, repo_root: string | null, dirty: boolean, status_entries: StatusEntry[], status_fingerprint: string | null, target_fingerprints: TargetFingerprint[] }} GitRepoState */
/** @typedef {{ schema_version: string, snapshot_id: string, created_at: string, root_dir: string, label: string, allow_dirty: boolean, status: string, baseline: GitRepoState, rollback_commands: string[], reason?: string }} Snapshot */
/** @typedef {{ label?: string, allowDirty?: boolean, dryRun?: boolean, force?: boolean, targets?: string[] }} SnapshotOptions */
/** @typedef {{ compatible: boolean, confidence_score: number, recommended_action: string, reasons: string[], changed_targets: { path: string, kind: string }[] }} DiffResult */

function nowIso() {
  return new Date().toISOString();
}

/** @param {string} dirPath */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/** @param {string} filePath @param {unknown} data */
function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** @param {string} filePath @returns {any} */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** @param {string} filePath @returns {any | null} */
function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return readJson(filePath);
  } catch {
    return null;
  }
}

/** @param {string | null | undefined} rootDir @param {string[]} args @returns {GitCommandResult} */
function runGit(rootDir, args) {
  const result = spawnSync('git', args, {
    cwd: path.resolve(rootDir || process.cwd()),
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
  });
  return {
    code: typeof result.status === 'number' ? result.status : 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

/** @param {unknown} text */
function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

/** @param {string} filePath */
function hashFile(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** @param {string | null | undefined} rootDir @param {string} filePath */
function relativePath(rootDir, filePath) {
  return path.relative(path.resolve(rootDir || process.cwd()), filePath).replace(/\\/g, '/');
}

/** @param {string | null | undefined} rawPath */
function normalizeStatusPath(rawPath) {
  const value = String(rawPath || '').replace(/^"|"$/g, '');
  return value.replace(/\\/g, '/');
}

/** @param {string} statusPath */
function shouldIgnoreStatusPath(statusPath) {
  const normalized = normalizeStatusPath(statusPath);
  return normalized === '.opencode' || normalized.startsWith('.opencode/');
}

/** @param {unknown} text @returns {StatusEntry[]} */
function parseStatusLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      code: line.slice(0, 2),
      path: normalizeStatusPath(line.slice(3).trim()),
      raw: line,
    }))
    .filter((entry) => !shouldIgnoreStatusPath(entry.path));
}

/** @param {string | null | undefined} rootDir */
function resolveSafetyDir(rootDir) {
  return path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'safety');
}

/** @param {string | null | undefined} rootDir */
function resolveSnapshotDir(rootDir) {
  return path.join(resolveSafetyDir(rootDir), 'snapshots');
}

/** @param {string | null | undefined} rootDir */
function resolveLatestSnapshotFile(rootDir) {
  return path.join(resolveSnapshotDir(rootDir), 'latest.json');
}

/** @param {string | null | undefined} rootDir */
function isGitRepo(rootDir) {
  const probe = runGit(rootDir, ['rev-parse', '--show-toplevel']);
  return probe.code === 0;
}

/** @param {string | null | undefined} rootDir @param {string[]} [targets] @returns {GitRepoState} */
function getGitRepoState(rootDir, targets = []) {
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const state = /** @type {GitRepoState} */ ({
    root_dir: resolvedRoot,
    collected_at: nowIso(),
    is_git_repo: false,
    branch: null,
    head: null,
    repo_root: null,
    dirty: false,
    status_entries: [],
    status_fingerprint: null,
    target_fingerprints: [],
  });

  if (isGitRepo(resolvedRoot)) {
    state.is_git_repo = true;
    const repoRoot = runGit(resolvedRoot, ['rev-parse', '--show-toplevel']).stdout.trim();
    const branch = runGit(resolvedRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
    const head = runGit(resolvedRoot, ['rev-parse', 'HEAD']).stdout.trim();
    const statusText = runGit(resolvedRoot, ['status', '--porcelain']).stdout;
    const statusEntries = parseStatusLines(statusText);
    state.repo_root = repoRoot || resolvedRoot;
    state.branch = branch || '(detached)';
    state.head = head || null;
    state.status_entries = statusEntries;
    state.dirty = statusEntries.length > 0;
    state.status_fingerprint = sha256Text(statusEntries.map((item) => item.raw).join('\n'));
  }

  for (const target of Array.isArray(targets) ? targets : []) {
    const resolved = path.resolve(resolvedRoot, target);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue;
    state.target_fingerprints.push({
      path: relativePath(resolvedRoot, resolved),
      sha256: hashFile(resolved),
    });
  }

  state.target_fingerprints.sort((a, b) => a.path.localeCompare(b.path));
  return state;
}

function createSnapshotId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `snap-${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

/** @param {string | null | undefined} rootDir @returns {Snapshot | null} */
function latestSnapshot(rootDir) {
  const latest = /** @type {{ snapshot_id?: string } | null} */ (tryReadJson(resolveLatestSnapshotFile(rootDir)));
  if (!latest || !latest.snapshot_id) return null;
  return loadSnapshot(rootDir, latest.snapshot_id);
}

/** @param {string | null | undefined} rootDir @param {string | null | undefined} snapshotId @returns {Snapshot | null} */
function loadSnapshot(rootDir, snapshotId) {
  if (!snapshotId) return latestSnapshot(rootDir);
  return /** @type {Snapshot | null} */ (tryReadJson(path.join(resolveSnapshotDir(rootDir), `${snapshotId}.json`)));
}

/** @param {string | null | undefined} rootDir @param {Snapshot} snapshot */
function writeLatestSnapshot(rootDir, snapshot) {
  writeJson(resolveLatestSnapshotFile(rootDir), {
    snapshot_id: snapshot.snapshot_id,
    created_at: snapshot.created_at,
    root_dir: snapshot.root_dir,
    label: snapshot.label,
    status: snapshot.status,
  });
}

/** @param {string | null | undefined} rootDir @param {SnapshotOptions} [opts] @returns {Snapshot} */
function createSnapshot(rootDir, opts = {}) {
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const baseline = getGitRepoState(resolvedRoot, opts.targets || []);
  const snapshot = /** @type {Snapshot} */ ({
    schema_version: '1.0',
    snapshot_id: createSnapshotId(),
    created_at: nowIso(),
    root_dir: resolvedRoot,
    label: String(opts.label || 'orchestrator-snapshot').trim(),
    allow_dirty: Boolean(opts.allowDirty),
    status: 'ready',
    baseline,
    rollback_commands: [],
  });

  if (!baseline.is_git_repo) {
    snapshot.status = 'skipped_not_git';
    snapshot.reason = 'root is not inside a git repository';
    return snapshot;
  }

  if (baseline.dirty && !opts.allowDirty) {
    snapshot.status = 'skipped_dirty';
    snapshot.reason = 'working tree is dirty';
    return snapshot;
  }

  snapshot.rollback_commands = [
    `git reset --hard ${baseline.head}`,
    'git clean -fd',
  ];

  if (opts.dryRun) {
    snapshot.status = 'dry_run';
    return snapshot;
  }

  const outPath = path.join(resolveSnapshotDir(resolvedRoot), `${snapshot.snapshot_id}.json`);
  writeJson(outPath, snapshot);
  writeLatestSnapshot(resolvedRoot, snapshot);
  return snapshot;
}

/** @param {GitRepoState | null | undefined} baseline @param {GitRepoState} current @returns {DiffResult} */
function diffRepoState(baseline, current) {
  if (!baseline) {
    return {
      compatible: true,
      confidence_score: 50,
      recommended_action: 'resume',
      reasons: ['no baseline recorded'],
      changed_targets: [],
    };
  }

  let score = 100;
  /** @type {string[]} */
  const reasons = [];
  /** @type {{ path: string, kind: string }[]} */
  const changedTargets = [];

  if (baseline.is_git_repo && current.is_git_repo) {
    if (baseline.branch && current.branch && baseline.branch !== current.branch) {
      score -= 40;
      reasons.push(`branch changed: ${baseline.branch} -> ${current.branch}`);
    }
    if (baseline.head && current.head && baseline.head !== current.head) {
      score -= 20;
      reasons.push('HEAD commit changed since baseline');
    }
    if (current.dirty) {
      score -= 15;
      reasons.push(`working tree has ${current.status_entries.length} uncommitted change(s)`);
    }
  } else if (baseline.is_git_repo !== current.is_git_repo) {
    score -= 35;
    reasons.push('git repository availability changed');
  }

  const currentByPath = new Map((current.target_fingerprints || []).map((item) => [item.path, item.sha256]));
  for (const item of baseline.target_fingerprints || []) {
    const currentHash = currentByPath.get(item.path);
    if (!currentHash) {
      changedTargets.push({ path: item.path, kind: 'missing' });
      continue;
    }
    if (currentHash !== item.sha256) {
      changedTargets.push({ path: item.path, kind: 'modified' });
    }
  }
  if (changedTargets.length > 0) {
    score -= Math.min(30, changedTargets.length * 10);
    reasons.push(`${changedTargets.length} target file(s) changed since baseline`);
  }

  const confidence = Math.max(0, Math.min(100, score));
  let recommendedAction = 'resume';
  if (confidence < 50) recommendedAction = 'new_plan';
  else if (confidence < 80) recommendedAction = 'rebuild_context';

  return {
    compatible: recommendedAction === 'resume',
    confidence_score: confidence,
    recommended_action: recommendedAction,
    reasons,
    changed_targets: changedTargets,
  };
}

/** @param {string | null | undefined} rootDir @param {SnapshotOptions} [opts] */
function assessSnapshotReadiness(rootDir, opts = {}) {
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const current = getGitRepoState(resolvedRoot);
  const latest = latestSnapshot(resolvedRoot);
  const label = String(opts.label || 'snapshot').trim();
  const nextCommand = `node scripts/safe-apply.js snapshot --label "${label}"`;

  if (!current.is_git_repo) {
    return {
      status: 'degraded_not_git',
      ready: false,
      blocking: false,
      reason: 'workspace is not inside a git repository; rollback snapshots are unavailable',
      snapshot_id: latest && latest.snapshot_id ? latest.snapshot_id : null,
      recommended_command: null,
    };
  }

  if (current.dirty) {
    return {
      status: 'degraded_dirty',
      ready: false,
      blocking: false,
      reason: 'working tree is dirty; commit or stash changes before creating a rollback snapshot',
      snapshot_id: latest && latest.snapshot_id ? latest.snapshot_id : null,
      recommended_command: nextCommand,
    };
  }

  if (!latest) {
    return {
      status: 'missing',
      ready: false,
      blocking: false,
      reason: 'no rollback snapshot exists for the current workspace',
      snapshot_id: null,
      recommended_command: nextCommand,
    };
  }

  if (latest.status !== 'ready') {
    return {
      status: `degraded_${latest.status}`,
      ready: false,
      blocking: false,
      reason: `latest rollback snapshot is ${latest.status}`,
      snapshot_id: latest.snapshot_id || null,
      recommended_command: nextCommand,
    };
  }

  const baseline = latest.baseline || /** @type {GitRepoState} */ ({
    root_dir: resolvedRoot,
    collected_at: nowIso(),
    is_git_repo: false,
    branch: null,
    head: null,
    repo_root: null,
    dirty: false,
    status_entries: [],
    status_fingerprint: null,
    target_fingerprints: [],
  });
  if (baseline.head && current.head && baseline.head !== current.head) {
    return {
      status: 'stale',
      ready: false,
      blocking: false,
      reason: 'latest rollback snapshot does not match the current HEAD commit',
      snapshot_id: latest.snapshot_id || null,
      recommended_command: nextCommand,
    };
  }

  if (baseline.branch && current.branch && baseline.branch !== current.branch) {
    return {
      status: 'stale_branch',
      ready: false,
      blocking: false,
      reason: 'latest rollback snapshot was created on a different branch',
      snapshot_id: latest.snapshot_id || null,
      recommended_command: nextCommand,
    };
  }

  return {
    status: 'ready',
    ready: true,
    blocking: false,
    reason: 'rollback snapshot is available for the current HEAD',
    snapshot_id: latest.snapshot_id || null,
    recommended_command: latest.snapshot_id ? `node scripts/safe-apply.js rollback --snapshot-id ${latest.snapshot_id} --dry-run` : null,
  };
}

/** @param {string | null | undefined} rootDir @param {string | null | undefined} snapshotId @param {SnapshotOptions} [opts] */
function rollbackSnapshot(rootDir, snapshotId, opts = {}) {
  const resolvedRoot = path.resolve(rootDir || process.cwd());
  const snapshot = loadSnapshot(resolvedRoot, snapshotId);
  if (!snapshot) throw new Error(`snapshot not found: ${snapshotId || 'latest'}`);
  if (snapshot.status !== 'ready') throw new Error(`snapshot is not rollback-ready: ${snapshot.status}`);

  const current = getGitRepoState(resolvedRoot);
  /** @type {string[]} */
  const checks = [];
  if (!current.is_git_repo) checks.push('current root is not in a git repository');
  if (snapshot.baseline.branch && current.branch && snapshot.baseline.branch !== current.branch && !opts.force) {
    checks.push(`current branch ${current.branch} does not match snapshot branch ${snapshot.baseline.branch}`);
  }

  const preview = {
    snapshot_id: snapshot.snapshot_id,
    root_dir: resolvedRoot,
    branch: snapshot.baseline.branch,
    head: snapshot.baseline.head,
    commands: snapshot.rollback_commands,
    dry_run: Boolean(opts.dryRun),
  };

  if (opts.dryRun) {
    return { ...preview, warnings: checks };
  }
  if (checks.length > 0) {
    throw new Error(checks.join('; '));
  }

  const reset = runGit(resolvedRoot, ['reset', '--hard', snapshot.baseline.head || 'HEAD']);
  if (reset.code !== 0) throw new Error(reset.stderr.trim() || 'git reset --hard failed');
  const clean = runGit(resolvedRoot, ['clean', '-fd']);
  if (clean.code !== 0) throw new Error(clean.stderr.trim() || 'git clean -fd failed');

  const record = {
    snapshot_id: snapshot.snapshot_id,
    rolled_back_at: nowIso(),
    root_dir: resolvedRoot,
    branch: snapshot.baseline.branch,
    head: snapshot.baseline.head,
  };
  writeJson(path.join(resolveSafetyDir(resolvedRoot), 'last-rollback.json'), record);
  return { ...preview, rolled_back: true };
}

module.exports = {
  assessSnapshotReadiness,
  getGitRepoState,
  diffRepoState,
  createSnapshot,
  loadSnapshot,
  latestSnapshot,
  rollbackSnapshot,
  resolveSafetyDir,
  resolveSnapshotDir,
};
