const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runNodeJson } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const IMPLEMENT_TASK = path.join(ROOT, 'scripts', 'implement-task.js');
const GO_FIXTURE = path.join(ROOT, 'fixtures', 'go-service');
const JAVA_FIXTURE = path.join(ROOT, 'fixtures', 'java-service');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-implement-e2e-batch3-'));
  try {
    copyDir(src, dir);
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('implement-task black-box routes generic endpoint objective to go handler skills on go fixtures', () => {
  withFixtureCopy(GO_FIXTURE, (dir) => {
    const result = runNodeJson(IMPLEMENT_TASK, [
      'run', '--root', dir, '--objective', 'add endpoint', '--no-validate', '--no-snapshot', '--rejected-limit', '20', '--json',
    ], { cwd: ROOT });

    assert.equal(result.selected_skill.dir, 'add-go-handler');
    assert.equal(result.skill_selection_report.selected.dir, 'add-go-handler');
    const rejectedFastApi = result.skill_selection_report.rejected_candidates.find((item) => item.dir === 'add-fastapi-endpoint');
    assert.ok(rejectedFastApi);
    assert.equal(rejectedFastApi.constraints.some((item) => item.kind === 'runtime' && item.status === 'failed'), true);
  });
});

test('implement-task black-box routes generic endpoint objective to spring controller skills on java fixtures', () => {
  withFixtureCopy(JAVA_FIXTURE, (dir) => {
    const result = runNodeJson(IMPLEMENT_TASK, [
      'run', '--root', dir, '--objective', 'add endpoint', '--no-validate', '--no-snapshot', '--rejected-limit', '20', '--json',
    ], { cwd: ROOT });

    assert.equal(result.selected_skill.dir, 'add-spring-controller');
    assert.equal(result.skill_selection_report.selected.dir, 'add-spring-controller');
    const rejectedExpress = result.skill_selection_report.rejected_candidates.find((item) => item.dir === 'add-express-route');
    assert.ok(rejectedExpress);
    assert.equal(rejectedExpress.constraints.some((item) => item.kind === 'runtime' && item.status === 'failed'), true);
  });
});
