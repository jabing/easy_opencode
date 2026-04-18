const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runNodeJson } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const IMPLEMENT_TASK = path.join(ROOT, 'scripts', 'implement-task.js');
const FIXTURE = path.join(ROOT, 'fixtures', 'node-api');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function withFixtureCopy(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-implement-e2e-'));
  try {
    copyDir(FIXTURE, dir);
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('implement-task black-box routing keeps node fixtures on node skills and emits explainable selection data', () => {
  withFixtureCopy((dir) => {
    const result = runNodeJson(IMPLEMENT_TASK, [
      'run',
      '--root', dir,
      '--objective', 'add health endpoint',
      '--scaffold',
      '--no-validate',
      '--no-snapshot',
      '--var', 'name=health',
      '--json',
    ], { cwd: ROOT });

    assert.equal(result.selected_skill.dir, 'add-express-route');
    assert.ok(result.scaffold.outputs.includes('src/routes/health.ts'));
    assert.ok(result.scaffold.outputs.includes('src/services/health.service.ts'));
    assert.equal(result.scaffold.outputs.some((item) => /app\/routers\/health\.py$/.test(item)), false);
    assert.equal(fs.existsSync(path.join(dir, 'src/routes/health.ts')), true);
    assert.equal(fs.existsSync(path.join(dir, 'app/routers/health.py')), false);

    assert.ok(result.skill_selection_report);
    assert.equal(result.skill_selection_report.selected.dir, 'add-express-route');
    const rejectedFastApi = result.skill_selection_report.rejected_candidates.find((item) => item.dir === 'add-fastapi-endpoint');
    assert.ok(rejectedFastApi);
    assert.equal(rejectedFastApi.constraints.some((item) => item.kind === 'runtime' && item.status === 'failed'), true);
    assert.match(result.selected_skill.decision.summary, /accepted:/i);
  });
});
