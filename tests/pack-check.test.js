const test = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

test('npm pack dry-run file list excludes runtime .opencode state and keeps static assets', () => {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const stdout = execSync(`${npmCommand} pack --dry-run --json`, {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const payload = JSON.parse(stdout);
  const files = payload[0].files.map((entry) => entry.path).sort();

  assert.ok(files.includes('.opencode/instructions/INSTRUCTIONS.md'));
  assert.ok(files.includes('.opencode/plugins/eoc-hooks.ts'));
  assert.ok(files.includes('.opencode/hooks-config.json'));
  assert.ok(files.includes('.opencode/command-policy.json'));

  const forbiddenPrefixes = [
    '.opencode/coder-loop/',
    '.opencode/implementation-plans/',
    '.opencode/observability/',
    '.opencode/orchestrator/',
    '.opencode/reviews/',
    '.opencode/eoc-run/',
    '.opencode/task-bundles/',
  ];
  for (const prefix of forbiddenPrefixes) {
    assert.ok(!files.some((file) => file.startsWith(prefix)), `expected pack list to exclude ${prefix}`);
  }
});
