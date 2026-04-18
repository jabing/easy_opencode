const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function withTempDir(setup, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-test-'));
  try {
    setup(dir);
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeFiles(root, files) {
  for (const [rel, body] of Object.entries(files || {})) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  }
}

function runNode(scriptPath, args = [], options = {}) {
  return execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
  });
}

function runNodeResult(scriptPath, args = [], options = {}) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: typeof error.status === 'number' ? error.status : 1,
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || ''),
    };
  }
}

function runNodeJson(scriptPath, args = [], options = {}) {
  const stdout = runNode(scriptPath, args, options);
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${scriptPath}: ${error.message}\nOutput:\n${stdout}`);
  }
}

function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_NAME: 'tester', GIT_AUTHOR_EMAIL: 'tester@example.com', GIT_COMMITTER_NAME: 'tester', GIT_COMMITTER_EMAIL: 'tester@example.com' },
    encoding: 'utf8',
  });
}

function initCommittedGitRepo(root) {
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'tester');
  git(root, 'config', 'user.email', 'tester@example.com');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
}

function ensureBenchmarkDir(root) {
  const dir = path.join(root, '.opencode', 'observability', 'benchmarks');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeBenchmarkRun(root, run) {
  const dir = ensureBenchmarkDir(root);
  const payload = { suite_name: 'fixture', ...run };
  const file = path.join(dir, `${payload.run_id}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  const completedAt = payload.completed_at ? new Date(payload.completed_at) : new Date();
  fs.utimesSync(file, completedAt, completedAt);
  return file;
}

function makeBenchmarkResult(options = {}) {
  const runtime = options.runtime || 'node';
  const framework = options.framework || 'express';
  const taskFamily = options.task_family || 'endpoint';
  const selectedSkill = options.selected_skill || 'add-express-route';
  const passed = options.passed !== undefined ? Boolean(options.passed) : true;
  const taskSuccess = options.task_success !== undefined ? Boolean(options.task_success) : passed;
  return {
    case_id: options.case_id || `${runtime}-${framework}-${selectedSkill}`,
    passed,
    detected: { runtime, framework, language: options.language || runtime },
    task: {
      task_success: taskSuccess,
      failed_count: options.failed_count !== undefined ? Number(options.failed_count) : (passed ? 0 : 2),
      scaffold_output_count: options.scaffold_output_count !== undefined ? Number(options.scaffold_output_count) : 2,
      scaffold_update_count: options.scaffold_update_count !== undefined ? Number(options.scaffold_update_count) : 1,
      task_family: taskFamily,
      selected_skill: selectedSkill,
      review_verdict: options.review_verdict || (passed ? 'ACCEPT' : 'BLOCK'),
      strategy_action: options.strategy_action || 'implementation_first',
    },
  };
}

module.exports = {
  initCommittedGitRepo,
  makeBenchmarkResult,
  runNode,
  runNodeJson,
  runNodeResult,
  withTempDir,
  writeBenchmarkRun,
  writeFiles,
};
