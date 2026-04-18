const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, runNodeResult, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');
const DEBUG_FIX_LOOP = path.join(ROOT, 'scripts', 'debug-fix-loop.js');

function baseFixture(files = {}) {
  return {
    'package.json': JSON.stringify({
      name: 'batch5-node-project',
      scripts: {
        build: 'node verify-generated.js',
        test: 'node -e "process.exit(0)"',
      },
      dependencies: {
        express: '^4.19.0',
      },
    }, null, 2),
    'src/controllers/.gitkeep': '',
    'src/services/.gitkeep': '',
    'src/repositories/.gitkeep': '',
    'src/schemas/.gitkeep': '',
    'src/routes/index.ts': '',
    'docs/api/index.md': '# API\n',
    'verify-generated.js': [
      "const fs = require('fs');",
      "const path = require('path');",
      "const root = process.cwd();",
      "const routeFile = path.join(root, 'src', 'routes', 'billing-report.route.ts');",
      "const body = fs.readFileSync(routeFile, 'utf8');",
      "const match = body.match(/from '([^']*controllers[^']*)'/);",
      "if (!match) {",
      "  console.error(`${routeFile}(1,1): error TS2307: Cannot find module '<unknown>'`);",
      "  process.exit(1);",
      "}",
      "const specifier = match[1];",
      "const target = path.resolve(path.dirname(routeFile), `${specifier}.ts`);",
      "if (!fs.existsSync(target)) {",
      "  console.error(`${routeFile}(1,1): error TS2307: Cannot find module '${specifier}' or its corresponding type declarations.`);",
      "  process.exit(1);",
      "}",
    ].join('\n'),
    ...files,
  };
}

test('debug-fix-loop repairs broken generated imports and re-runs verify', () => {
  withTempDir((dir) => {
    writeFiles(dir, baseFixture());
  }, (dir) => {
    runNodeResult(GENERATE_FEATURE, ['billing-report', '--root', dir, '--skip-verify'], { cwd: ROOT });
    const routeFile = path.join(dir, 'src', 'routes', 'billing-report.route.ts');
    const before = fs.readFileSync(routeFile, 'utf8').replace('../controllers/billing-report.controller', '../controllers/missing.controller');
    fs.writeFileSync(routeFile, before, 'utf8');

    const result = runNodeJson(DEBUG_FIX_LOOP, [
      '--root', dir,
      '--feature', 'billing-report',
      '--verify', 'npm run build',
      '--verify', 'npm test',
    ], { cwd: ROOT });

    assert.equal(result.ok, true);
    assert.equal(result.root_cause, 'broken_local_imports');
    assert.match(result.files_edited.join('\n'), /billing-report\.route\.ts/);
    const repaired = fs.readFileSync(routeFile, 'utf8');
    assert.match(repaired, /\.\.\/controllers\/billing-report\.controller/);
    assert.equal(result.verify_before.ok, false);
    assert.equal(result.verify_after.ok, true);
  });
});

test('generate-feature runs verify and reports fix-loop result in json output', () => {
  withTempDir((dir) => {
    writeFiles(dir, baseFixture());
  }, (dir) => {
    const result = runNodeJson(GENERATE_FEATURE, ['billing-report', '--root', dir, '--json'], { cwd: ROOT });
    assert.equal(result.verify_run.ok, true);
    assert.equal(result.fix_loop.ok, true);
    assert.equal(result.fix_loop.root_cause, 'no_failure_detected');
    assert.equal(fs.existsSync(path.join(dir, 'src', 'routes', 'billing-report.route.ts')), true);
  });
});

test('debug-fix-loop records failure patterns when verify still fails after repair', () => {
  withTempDir((dir) => {
    writeFiles(dir, baseFixture({
      'verify-generated.js': "console.error('fatal verify failure'); process.exit(1);\n",
    }));
  }, (dir) => {
    runNodeResult(GENERATE_FEATURE, ['billing-report', '--root', dir, '--skip-verify'], { cwd: ROOT });
    const failed = runNodeResult(DEBUG_FIX_LOOP, [
      '--root', dir,
      '--feature', 'billing-report',
      '--verify', 'npm run build',
    ], { cwd: ROOT });
    assert.equal(failed.code, 1);
    const payload = JSON.parse(failed.stdout);
    assert.equal(payload.ok, false);
    const memory = JSON.parse(fs.readFileSync(path.join(dir, '.opencode', 'project-memory.json'), 'utf8'));
    assert.equal(Array.isArray(memory.failure_patterns), true);
    assert.equal(memory.failure_patterns.at(-1).pattern, 'verify-failed');
  });
});
