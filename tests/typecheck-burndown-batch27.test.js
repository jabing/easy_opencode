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

test('batch27 makes install, project memory, and python refactor provider strict-safe', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'typecheck.quarantine.json'), 'utf8'));
  const manifestPaths = manifest.files.map((item) => item.path).sort();
  const srcFiles = walkJs(path.join(ROOT, 'src')).map((file) => path.relative(ROOT, file).replace(/\\/g, '/')).sort();
  const quarantinedByMarker = srcFiles.filter((file) => /@ts-nocheck/.test(fs.readFileSync(path.join(ROOT, file), 'utf8').slice(0, 200))).sort();

  assert.deepEqual(quarantinedByMarker, manifestPaths);

  for (const file of [
    'src/cli/install-cli.js',
    'src/core/project/memory.js',
    'src/core/refactor/providers/python.js',
  ]) {
    assert.ok(!manifestPaths.includes(file), `${file} should be strict-safe in batch27`);
    assert.ok(!/@ts-nocheck/.test(fs.readFileSync(path.join(ROOT, file), 'utf8').slice(0, 200)), `${file} should not carry @ts-nocheck in batch27`);
  }

  for (const file of [
    'src/cli/ast-rewrite-cli.js',
    'src/core/project/memory-detect.js',
    'src/core/refactor/providers/typescript.js',
  ]) {
    assert.ok(manifestPaths.includes(file), `${file} should remain quarantined after batch27`);
  }

  const report = runNodeJson(TYPECHECK, ['--json'], { cwd: ROOT });
  assert.equal(report.ok, true);
  assert.equal(report.total_src_files, 193);
  assert.ok(report.strict_checked >= 172, `expected strict_checked >= 172, got ${report.strict_checked}`);
  assert.ok(report.quarantined <= 21, `expected quarantined <= 21, got ${report.quarantined}`);
  assert.equal(report.strict_checked + report.quarantined, report.total_src_files);
});
