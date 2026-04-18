const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const TYPECHECK = path.join(ROOT, 'scripts', 'typecheck.js');

function walkJs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(abs, out);
    else if (entry.isFile() && abs.endsWith('.js')) out.push(abs);
  }
  return out;
}

test('batch17 restores green typecheck baseline and removes stale quarantine entries', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'typecheck.quarantine.json'), 'utf8'));
  const manifestPaths = manifest.files.map((item) => item.path).sort();
  const srcFiles = walkJs(path.join(ROOT, 'src')).map((file) => path.relative(ROOT, file).replace(/\\/g, '/')).sort();
  const quarantinedByMarker = srcFiles.filter((file) => /@ts-nocheck/.test(fs.readFileSync(path.join(ROOT, file), 'utf8').slice(0, 160))).sort();

  assert.deepEqual(quarantinedByMarker, manifestPaths);
  for (const file of [
    'src/cli/eoc-scheduler-cli.js',
    'src/core/project/git-state.js',
    'src/core/project/memory-history.js',
  ]) {
    assert.ok(!manifestPaths.includes(file), `${file} should be strict-safe in batch17`);
  }

  const report = runNodeJson(TYPECHECK, ['--json'], { cwd: ROOT });
  assert.equal(report.ok, true);
  assert.equal(report.total_src_files, srcFiles.length);
  assert.ok(report.strict_checked >= 148, `expected strict_checked >= 148, got ${report.strict_checked}`);
  assert.ok(report.quarantined <= 45, `expected quarantined <= 45, got ${report.quarantined}`);
  assert.equal(report.strict_checked + report.quarantined, report.total_src_files);
});
