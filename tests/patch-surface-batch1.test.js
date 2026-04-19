const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { withTempDir, writeFiles, initCommittedGitRepo } = require('./test-helpers.js');

function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'tester',
      GIT_AUTHOR_EMAIL: 'tester@example.com',
      GIT_COMMITTER_NAME: 'tester',
      GIT_COMMITTER_EMAIL: 'tester@example.com',
    },
  });
}

test('collectPatchSurface includes unstaged, staged, and untracked files', () => {
  const { collectPatchSurface } = require('../src/core/git/patch-surface.js');
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'patch-fixture' }, null, 2),
      'src/index.js': 'module.exports = 1;\n',
    });
  }, (dir) => {
    initCommittedGitRepo(dir);
    fs.writeFileSync(path.join(dir, 'src/index.js'), 'module.exports = 2;\n', 'utf8');
    writeFiles(dir, { 'src/staged.js': 'module.exports = 3;\n' });
    git(dir, 'add', 'src/staged.js');
    writeFiles(dir, { 'src/untracked.js': 'module.exports = 4;\n' });
    const surface = collectPatchSurface(dir);
    assert.deepEqual(surface.unstaged_files, ['src/index.js']);
    assert.deepEqual(surface.staged_files, ['src/staged.js']);
    assert.deepEqual(surface.untracked_files, ['src/untracked.js']);
    assert.deepEqual(surface.all_touched_files, ['src/index.js', 'src/staged.js', 'src/untracked.js']);
  });
});

test('collectPatchSurface includes deleted files in the aggregate footprint', () => {
  const { collectPatchSurface } = require('../src/core/git/patch-surface.js');
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'patch-fixture' }, null, 2),
      'src/delete-me.js': 'module.exports = 1;\n',
    });
  }, (dir) => {
    initCommittedGitRepo(dir);
    fs.unlinkSync(path.join(dir, 'src/delete-me.js'));
    const surface = collectPatchSurface(dir);
    assert.deepEqual(surface.deleted_files, ['src/delete-me.js']);
    assert.deepEqual(surface.all_touched_files, ['src/delete-me.js']);
  });
});

test('evaluatePatchFootprint uses the full patch surface for current patch data', () => {
  const { evaluatePatchFootprint } = require('../src/core/implementation/edit-engine.js');
  const evaluation = evaluatePatchFootprint({
    footprint: {
      unstaged_files: ['src/index.js'],
      staged_files: ['src/staged.js'],
      untracked_files: ['src/untracked.js'],
      deleted_files: ['src/delete-me.js'],
    },
    changeSurface: {
      candidate_edit_files: [{ path: 'src/index.js' }],
    },
  });

  assert.deepEqual(evaluation.touched_files, ['src/index.js', 'src/staged.js', 'src/untracked.js', 'src/delete-me.js']);
  assert.deepEqual(evaluation.patch_surface, {
    unstaged_files: ['src/index.js'],
    staged_files: ['src/staged.js'],
    untracked_files: ['src/untracked.js'],
    deleted_files: ['src/delete-me.js'],
    all_touched_files: ['src/delete-me.js', 'src/index.js', 'src/staged.js', 'src/untracked.js'],
  });
});

test('coder loop prompt reflects patch data without change-surface context', () => {
  const { buildNextPromptText } = require('../src/cli/coder-loop-cli.js');
  withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'patch-fixture' }, null, 2),
      'src/delete-me.js': 'module.exports = 1;\n',
    });
  }, (dir) => {
    initCommittedGitRepo(dir);
    fs.unlinkSync(path.join(dir, 'src/delete-me.js'));
    const prompt = buildNextPromptText({
      root_dir: dir,
      objective: 'patch surface check',
      context: {
        profile: { runtime: 'node', language: 'javascript', framework: 'unknown', package_manager: 'npm' },
        targets: [],
        related_tests: [],
        edit_strategy: {},
        task_route: {},
        change_surface: null,
        context_policy: null,
      },
      latest_failures: [],
      checks: [],
      repair_recipe: {},
    });

    assert.match(prompt, /Touched files: src\/delete-me\.js/);
    assert.match(prompt, /Patch surface: staged=0 unstaged=1 untracked=0 deleted=1/);
    assert.doesNotMatch(prompt, /Patch footprint unavailable/);
  });
});

test('coder loop prompt reflects the expanded patch surface', () => {
  const { buildNextPromptText } = require('../src/cli/coder-loop-cli.js');
  const prompt = buildNextPromptText({
    objective: 'patch surface check',
    context: {
      profile: { runtime: 'node', language: 'javascript', framework: 'unknown', package_manager: 'npm' },
      targets: [],
      related_tests: [],
      change_surface: null,
      context_policy: null,
    },
    latest_failures: [],
    checks: [],
    repair_recipe: {},
    current_patch_evaluation: {
      verdict: 'accept',
      touched_files: ['src/index.js', 'src/staged.js', 'src/untracked.js'],
      file_budget: 4,
      unrelated_edit_ratio: 0,
      protected_file_violations: [],
      patch_surface: {
        unstaged_files: ['src/index.js'],
        staged_files: ['src/staged.js'],
        untracked_files: ['src/untracked.js'],
        deleted_files: [],
        all_touched_files: ['src/index.js', 'src/staged.js', 'src/untracked.js'],
      },
    },
  });

  assert.match(prompt, /Patch surface: staged=1 unstaged=1 untracked=1 deleted=0/);
});
