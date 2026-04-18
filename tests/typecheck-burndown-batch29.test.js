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

test('batch29 makes debug-fix-loop strict-safe and keeps quarantine self-consistent', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'typecheck.quarantine.json'), 'utf8'));
  const manifestPaths = manifest.files.map((item) => item.path).sort();
  const srcFiles = walkJs(path.join(ROOT, 'src')).map((file) => path.relative(ROOT, file).replace(/\\/g, '/')).sort();
  const quarantinedByMarker = srcFiles.filter((file) => /@ts-nocheck/.test(fs.readFileSync(path.join(ROOT, file), 'utf8').slice(0, 200))).sort();

  assert.deepEqual(quarantinedByMarker, manifestPaths);

  assert.ok(!manifestPaths.includes('src/core/repair/debug-fix-loop.js'));
  assert.ok(!/@ts-nocheck/.test(fs.readFileSync(path.join(ROOT, 'src/core/repair/debug-fix-loop.js'), 'utf8').slice(0, 200)));

  for (const file of [
    'src/core/gates/review-helpers.js',
    'src/core/refactor/service.js',
    'src/core/skills/scaffold/updates.js',
  ]) {
    assert.ok(manifestPaths.includes(file), `${file} should stay quarantined in batch29`);
    assert.match(fs.readFileSync(path.join(ROOT, file), 'utf8').slice(0, 200), /@ts-nocheck/, `${file} should carry @ts-nocheck in batch29`);
  }

  const report = runNodeJson(TYPECHECK, ['--json'], { cwd: ROOT });
  assert.equal(report.ok, true);
  assert.equal(report.total_src_files, 193);
  assert.equal(report.strict_checked, 179);
  assert.equal(report.quarantined, 14);
  assert.equal(report.strict_checked + report.quarantined, report.total_src_files);
});
