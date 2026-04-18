#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { assertTestStabilityContract } = require('../src/shared/contracts.js');

function parseArgs(argv) {
  const opts = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) opts[key] = true;
    else { opts[key] = next; i += 1; }
  }
  return opts;
}

function summarizeText(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return (lines[0] || '').slice(0, 240);
}

function copyWorkspace(srcRoot) {
  const destRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-test-stability-'));
  copyDir(srcRoot, destRoot, new Set(['.git', 'node_modules']));
  return destRoot;
}

function copyDir(src, dest, excludeNames) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludeNames.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath, excludeNames);
    else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(srcPath), destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function runOnce(cwd, timeoutMs) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const result = spawnSync('npm', ['test', '--silent'], {
    cwd,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, CI: process.env.CI || '1' },
  });
  return {
    started_at: startedAt,
    duration_ms: Date.now() - start,
    code: typeof result.status === 'number' ? result.status : 1,
    signal: result.signal || null,
    timed_out: Boolean(result.error && result.error.code === 'ETIMEDOUT'),
    summary: result.error && result.error.code === 'ETIMEDOUT'
      ? `timed out after ${timeoutMs}ms`
      : summarizeText(`${result.stdout || ''}\n${result.stderr || ''}`) || (typeof result.status === 'number' && result.status === 0 ? 'ok' : 'failed'),
  };
}

function buildSummary(options, iterations) {
  const failed = iterations.filter((item) => item.code !== 0);
  return {
    schema_name: 'test_stability_summary',
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    stable: failed.length === 0,
    repeat_count: iterations.length,
    pass_count: iterations.length - failed.length,
    fail_count: failed.length,
    workspace_mode: options.tempCopy ? 'temp_copy' : 'in_place',
    ci_mode: process.env.CI ? 'ci' : 'local',
    iteration_timeout_ms: options.timeoutMs,
    first_failure: failed[0] || null,
    iterations,
  };
}

function printHuman(summary) {
  console.log(`Test stability: ${summary.stable ? 'stable' : 'unstable'}`);
  console.log(`Workspace: ${summary.workspace_mode}`);
  console.log(`Repeat count: ${summary.repeat_count}`);
  for (const [index, iteration] of summary.iterations.entries()) {
    console.log(`- [${iteration.code === 0 ? 'pass' : 'fail'}] #${index + 1}: ${iteration.summary} (${iteration.duration_ms}ms)`);
  }
  console.log(`Counts: pass=${summary.pass_count} fail=${summary.fail_count}`);
}

function main() {
  const opts = parseArgs(process.argv);
  const root = path.resolve(String(opts.root || process.cwd()));
  const repeat = Math.max(1, Number(opts.repeat || 5));
  const timeoutMs = Math.max(1000, Number(opts['iteration-timeout-ms'] || process.env.EOC_TEST_STABILITY_TIMEOUT_MS || 10 * 60 * 1000));
  const keepGoing = Boolean(opts['keep-going']);
  const tempCopy = Boolean(opts['temp-copy']);
  const workspace = tempCopy ? copyWorkspace(root) : root;
  const iterations = [];
  try {
    for (let i = 0; i < repeat; i += 1) {
      const iteration = runOnce(workspace, timeoutMs);
      iteration.iteration = i + 1;
      iterations.push(iteration);
      if (iteration.code !== 0 && !keepGoing) break;
    }
    const summary = buildSummary({ tempCopy, timeoutMs }, iterations);
    if (opts.json) { assertTestStabilityContract(summary); process.stdout.write(JSON.stringify(summary, null, 2) + '\n'); }
    else printHuman(summary);
    process.exit(summary.stable && iterations.length === repeat ? 0 : 1);
  } finally {
    if (tempCopy) fs.rmSync(workspace, { recursive: true, force: true });
  }
}

module.exports = {
  buildSummary,
  copyDir,
  copyWorkspace,
  main,
  parseArgs,
  runOnce,
  summarizeText,
};

if (require.main === module) main();
