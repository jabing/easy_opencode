#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { runCommand } = require('../adapters/process-runner.js');
const { normalizeError, ValidationError } = require('../core/errors.js');

/** @typedef {{ _: string[], root?: string, target?: string, timeout?: string, reporter?: string, maxOutputBytes?: string, json?: boolean, [key: string]: string | boolean | string[] | undefined }} RunTestsArgs */
/** @typedef {{ cwd: string, timeoutMs: number, reporter: string, maxOutputBytes: number }} RunTestFileOptions */
/** @typedef {{ file: string, code: number, signal: string | null, timedOut: boolean, durationMs: number, stdout: string, stderr: string, truncated: boolean, metric: unknown }} RunTestFileResult */

function printLine(line = '') {
  process.stdout.write(String(line) + '\n');
}

/** @param {string[]} argv @returns {RunTestsArgs} */
function parseArgs(argv) {
  /** @type {RunTestsArgs} */
  const opts = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const token = String(argv[i] || '');
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      if (key === 'json') opts.json = true;
      else opts[key] = 'true';
      continue;
    }
    opts[key] = next;
    i += 1;
  }
  return opts;
}

/** @param {string} rootDir @param {string | undefined} target @returns {string[]} */
function resolveTestFiles(rootDir, target) {
  const resolved = path.resolve(rootDir, target || 'tests');
  if (!fs.existsSync(resolved)) throw new ValidationError(`test target not found: ${resolved}`);
  const stat = fs.statSync(resolved);
  if (stat.isFile()) return [resolved];
  return fs.readdirSync(resolved)
    .filter(/** @param {string} name */ (name) => name.endsWith('.test.js'))
    .sort()
    .map(/** @param {string} name */ (name) => path.join(resolved, name));
}

/** @param {unknown} output @returns {string} */
function summarizeFailure(output) {
  const text = String(output || '').trim();
  if (!text) return 'no output';
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.slice(-6).join('\n');
}

/** @param {string} filePath @param {RunTestFileOptions} options @returns {Promise<RunTestFileResult>} */
async function runTestFile(filePath, options) {
  const args = [
    '--test',
    filePath,
    '--test-reporter', options.reporter,
  ];
  const result = await runCommand(process.execPath, args, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    maxOutputBytes: options.maxOutputBytes,
  });
  return {
    file: path.relative(options.cwd, filePath),
    code: result.code,
    signal: result.timedOut ? 'SIGTERM' : null,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdout: result.output,
    stderr: '',
    truncated: result.truncated,
    metric: result.metric,
  };
}

/** @param {RunTestFileResult[]} results */
function printHumanSummary(results) {
  printLine(`Test files: ${results.length}`);
  const failed = results.filter((item) => item.code !== 0);
  for (const item of results) {
    const marker = item.code === 0 ? 'PASS' : 'FAIL';
    const extra = item.truncated ? ' truncated' : '';
    printLine(`${marker} ${item.file} (${item.durationMs}ms${extra})`);
    if (item.code !== 0) {
      printLine(summarizeFailure(`${item.stdout}\n${item.stderr}`));
    }
  }
  printLine(`Summary: pass=${results.length - failed.length} fail=${failed.length}`);
}

async function main() {
  try {
    const opts = parseArgs(process.argv);
    const cwd = path.resolve(String(opts.root || process.cwd()));
    const files = resolveTestFiles(cwd, typeof opts.target === 'string' ? opts.target : 'tests');
    const timeoutMs = Number(opts.timeout || process.env.EOC_TEST_TIMEOUT_MS || (process.env.CI ? 180000 : 120000));
    const reporter = typeof opts.reporter === 'string' ? opts.reporter : 'tap';
    const maxOutputBytes = Number(opts.maxOutputBytes || process.env.EOC_TEST_OUTPUT_MAX_BYTES || 30000);
    /** @type {RunTestFileResult[]} */
    const results = [];
    for (const file of files) {
      const result = await runTestFile(file, { cwd, timeoutMs, reporter, maxOutputBytes });
      results.push(result);
    }
    const summary = {
      schema_version: '1.1',
      generated_at: new Date().toISOString(),
      root_dir: cwd,
      timeout_ms: timeoutMs,
      output_max_bytes: maxOutputBytes,
      test_files: results.length,
      pass_count: results.filter((item) => item.code === 0).length,
      fail_count: results.filter((item) => item.code !== 0).length,
      files: results.map((item) => ({
        file: item.file,
        code: item.code,
        signal: item.signal,
        timed_out: item.timedOut,
        duration_ms: item.durationMs,
        truncated: item.truncated,
      })),
    };
    if (opts.json) process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    else printHumanSummary(results);
    process.exit(summary.fail_count === 0 ? 0 : 1);
  } catch (error) {
    const normalized = normalizeError(error);
    console.error(`[run-tests] ${normalized.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  parseArgs,
  resolveTestFiles,
  summarizeFailure,
};
