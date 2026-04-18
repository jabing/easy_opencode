const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runNodeJson } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const IMPLEMENT_TASK = path.join(ROOT, 'scripts', 'implement-task.js');
const NODE_FIXTURE = path.join(ROOT, 'fixtures', 'node-api');
const PYTHON_FIXTURE = path.join(ROOT, 'fixtures', 'python-service');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function withFixtureCopy(src, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-implement-e2e-batch2-'));
  try {
    copyDir(src, dir);
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('implement-task black-box allow-cross-runtime keeps rejected runtimes explainable without changing the winner', () => {
  withFixtureCopy(NODE_FIXTURE, (dir) => {
    const result = runNodeJson(IMPLEMENT_TASK, [
      'run',
      '--root', dir,
      '--objective', 'add health endpoint',
      '--allow-cross-runtime',
      '--limit', '20',
      '--no-validate',
      '--no-snapshot',
      '--json',
    ], { cwd: ROOT });

    assert.equal(result.selected_skill.dir, 'add-express-route');
    assert.equal(result.skill_selection_report.selection_basis, 'constraints_then_ranking');
    assert.equal(result.skill_selection_report.allow_cross_runtime, true);
    assert.equal(result.skill_selection_report.rejected_by_reason.runtime_mismatch >= 1, false);

    const fastApi = result.skill_selection_report.accepted_candidates.find((item) => item.dir === 'add-fastapi-endpoint');
    assert.ok(fastApi);
    assert.equal(fastApi.decision.constraints.some((item) => item.kind === 'runtime' && item.status === 'waived'), true);
  });
});

test('implement-task black-box routing keeps django fixtures on django skills and rejects endpoint scaffolds', () => {
  withFixtureCopy(PYTHON_FIXTURE, (dir) => {
    const result = runNodeJson(IMPLEMENT_TASK, [
      'run',
      '--root', dir,
      '--objective', 'new model',
      '--scaffold',
      '--rejected-limit', '20',
      '--no-validate',
      '--no-snapshot',
      '--var', 'subject=LedgerEntry',
      '--json',
    ], { cwd: ROOT });

    assert.equal(result.selected_skill.dir, 'add-django-model');
    assert.ok(result.scaffold.outputs.includes('app/models/ledger_entry.py'));
    assert.equal(fs.existsSync(path.join(dir, 'app/models/ledger_entry.py')), true);
    assert.equal(fs.existsSync(path.join(dir, 'src/routes/ledger-entry.ts')), false);

    const rejectedExpress = result.skill_selection_report.rejected_candidates.find((item) => item.dir === 'add-express-route');
    assert.ok(rejectedExpress);
    assert.equal(rejectedExpress.constraints.some((item) => item.kind === 'runtime' && item.status === 'failed'), true);
    assert.equal(result.skill_selection_report.report_version, '2.0');
  });
});
