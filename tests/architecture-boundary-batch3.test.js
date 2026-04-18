const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_LIB = path.join(ROOT, 'scripts', 'lib');
const REMOVED_MIGRATION_IMPORTS = [
  'src/core/script-lib/',
  'src/shared/platform-contracts.js',
  'src/types/platform-contracts.js',
];

function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function collectScriptImportOffenders(baseDir) {
  const offenders = [];
  for (const file of listFiles(baseDir)) {
    if (!/\.[cm]?js$/.test(file)) continue;
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    if (/require\([^\n]*scripts\/lib\/|from\s+['"][^'"]*scripts\/lib\//.test(content)) offenders.push(rel);
  }
  return offenders;
}

function collectDirectScriptImportOffenders(baseDir) {
  const offenders = [];
  for (const file of listFiles(baseDir)) {
    if (!/\.[cm]?js$/.test(file)) continue;
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    if (/require\([^\n]*\.\.\/\.\.\/scripts\/|from\s+['"][^'"]*\.\.\/\.\.\/scripts\//.test(content)) offenders.push(rel);
  }
  return offenders;
}

function collectRemovedMigrationImportOffenders(baseDir) {
  const offenders = [];
  for (const file of listFiles(baseDir)) {
    if (!/\.[cm]?js$/.test(file)) continue;
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (rel === 'tests/architecture-boundary-batch3.test.js') continue;
    if (rel.startsWith('src/cli/scaffold/')) continue;
    const content = fs.readFileSync(file, 'utf8');
    if (REMOVED_MIGRATION_IMPORTS.some((specifier) => content.includes(specifier))) offenders.push(rel);
  }
  return offenders;
}

test('src modules do not import scripts modules directly', () => {
  assert.deepEqual(collectScriptImportOffenders(path.join(ROOT, 'src')), []);
});

test('src modules do not import script entrypoint wrappers via ../../scripts', () => {
  assert.deepEqual(collectDirectScriptImportOffenders(path.join(ROOT, 'src')), []);
});

test('internal entry points do not depend on scripts/lib wrappers', () => {
  const offenders = [
    ...collectScriptImportOffenders(path.join(ROOT, 'scripts')),
    ...collectScriptImportOffenders(path.join(ROOT, 'bin')),
    ...collectScriptImportOffenders(path.join(ROOT, 'tests')),
  ];
  assert.deepEqual(offenders, []);
});

test('migrated platform modules are imported from their new src homes', () => {
  const offenders = [
    ...collectRemovedMigrationImportOffenders(path.join(ROOT, 'scripts')),
    ...collectRemovedMigrationImportOffenders(path.join(ROOT, 'bin')),
    ...collectRemovedMigrationImportOffenders(path.join(ROOT, 'tests')),
    ...collectRemovedMigrationImportOffenders(path.join(ROOT, 'src')),
  ];
  assert.deepEqual(offenders, []);
});

test('deprecated migration layers have been removed', () => {
  assert.equal(fs.existsSync(SCRIPT_LIB), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'src', 'core', 'script-lib')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'src', 'types', 'platform-contracts.js')), false);
});

test('script entry points delegate selected checks to src', () => {
  const checks = [
    ['scripts/metadata-check.js', '../src/core/checks/metadata-check.js'],
    ['scripts/build-check.js', '../src/core/checks/build-check.js'],
    ['scripts/install.js', '../src/cli/install-cli.js'],
    ['scripts/uninstall.js', '../src/cli/uninstall-cli.js'],
    ['scripts/ast-rewrite.js', '../src/cli/ast-rewrite-cli.js'],
    ['scripts/eoc-bridge.js', '../src/cli/eoc-bridge-cli.js'],
  ];

  for (const [rel, target] of checks) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(content, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
