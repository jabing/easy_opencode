#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = process.cwd();
const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.opencode',
]);

const CODE_EXT = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.java',
  '.kt',
  '.rb',
  '.php',
  '.rs',
  '.swift',
]);

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i += 1;
    }
  }
  return opts;
}

function toBool(v) {
  return v === true || v === 'true' || v === '1' || v === 1;
}

function exists(p) {
  return fs.existsSync(path.join(ROOT, p));
}

function walk(dir, acc) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(fullPath, acc);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!CODE_EXT.has(ext)) continue;
    acc.push(fullPath);
  }
}

function collectCodeFiles() {
  const files = [];
  walk(ROOT, files);
  return files;
}

function runCommand(command, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      out += String(d);
    });
    child.stderr.on('data', (d) => {
      err += String(d);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        code: code === null ? 1 : code,
        timedOut: signal === 'SIGTERM',
        output: `${out}${err}`.trim(),
      });
    });
  });
}

function addResult(bucket, status, check, detail) {
  bucket.push({ status, check, detail });
}

function scanFile(filePath, findings) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const isTest = /(^|\/)(test|tests|__tests__)\/|(\.test\.|\.spec\.)/i.test(rel);
  const isAppCode = /^(src|lib|app)\//.test(rel);

  // Keep signal high: only flag debug logs inside product code folders.
  if (isAppCode && /\bconsole\.log\s*\(/.test(content)) {
    findings.warn.push(`[debug] console.log found in ${rel}`);
  }
  // Avoid self-detection from regex definitions in this checker file.
  if (rel === 'scripts/quality-gate.js') return;
  if (/\bdebugger\b/.test(content)) {
    findings.fail.push(`[debugger] debugger statement found in ${rel}`);
  }
  if (isTest && /\b(it|describe|test)\.only\s*\(/.test(content)) {
    findings.fail.push(`[test-only] .only detected in ${rel}`);
  }
  if (isAppCode && /\b(TODO|FIXME)\b/.test(content)) {
    findings.warn.push(`[todo] TODO/FIXME found in ${rel}`);
  }

  const secretLike =
    /\b(api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*["'`][^"'`\r\n]{8,}["'`]/i;
  if (secretLike.test(content)) {
    findings.fail.push(`[secret] possible hardcoded credential in ${rel}`);
  }
}

async function run() {
  const opts = parseArgs(process.argv);
  const full = toBool(opts.full);
  const strict = toBool(opts.strict);
  const jsonMode = toBool(opts.json);
  const timeoutMs = Number(opts.timeout || 180000);
  const results = [];

  addResult(results, exists('package.json') ? 'pass' : 'fail', 'package.json', exists('package.json') ? 'present' : 'missing');
  addResult(results, exists('.gitignore') ? 'pass' : 'fail', '.gitignore', exists('.gitignore') ? 'present' : 'missing');

  let pkg = {};
  if (exists('package.json')) {
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      addResult(results, 'pass', 'package.json.parse', 'valid JSON');
    } catch (e) {
      addResult(results, 'fail', 'package.json.parse', e.message);
    }
  }

  const files = collectCodeFiles();
  const findings = { fail: [], warn: [] };
  for (const f of files) {
    try {
      scanFile(f, findings);
    } catch (e) {
      findings.warn.push(`[scan] failed to read ${path.relative(ROOT, f)}: ${e.message}`);
    }
  }
  addResult(results, findings.fail.length === 0 ? 'pass' : 'fail', 'static.scan.failures', findings.fail.length === 0 ? 'none' : findings.fail.join(' | '));
  addResult(results, findings.warn.length === 0 ? 'pass' : strict ? 'fail' : 'warn', 'static.scan.warnings', findings.warn.length === 0 ? 'none' : findings.warn.join(' | '));

  const scripts = (pkg && pkg.scripts) || {};
  if (full) {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const ordered = [
      ['lint', ['run', 'lint']],
      ['typecheck', ['run', 'typecheck']],
      ['test', ['test']],
      ['build', ['run', 'build']],
    ];
    for (const [name, args] of ordered) {
      if (!scripts[name]) {
        addResult(results, 'skip', `script:${name}`, 'not defined');
        continue;
      }
      const r = await runCommand(npmCmd, args, timeoutMs);
      if (r.timedOut) {
        addResult(results, 'fail', `script:${name}`, `timeout after ${timeoutMs}ms`);
        continue;
      }
      addResult(results, r.code === 0 ? 'pass' : 'fail', `script:${name}`, r.code === 0 ? 'ok' : `exit ${r.code}: ${r.output.slice(0, 300)}`);
    }
  } else {
    addResult(results, 'skip', 'script checks', 'skipped (use --full)');
  }

  const counts = results.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    { pass: 0, fail: 0, warn: 0, skip: 0 }
  );
  const gatePass = counts.fail === 0;

  if (jsonMode) {
    process.stdout.write(
      JSON.stringify(
        {
          gate: gatePass ? 'PASS' : 'FAIL',
          strict,
          full,
          counts,
          results,
        },
        null,
        2
      ) + '\n'
    );
  } else {
    console.log('=== Quality Gate ===');
    console.log(`Mode: ${full ? 'full' : 'fast'}${strict ? ' + strict' : ''}`);
    for (const r of results) {
      const tag = r.status.toUpperCase().padEnd(5);
      console.log(`[${tag}] ${r.check} - ${r.detail}`);
    }
    console.log('');
    console.log(`Summary: pass=${counts.pass} fail=${counts.fail} warn=${counts.warn} skip=${counts.skip}`);
    console.log(`Status: ${gatePass ? 'PASS' : 'FAIL'}`);
  }

  process.exit(gatePass ? 0 : 1);
}

run().catch((err) => {
  console.error(`[quality-gate] ${err.message}`);
  process.exit(1);
});
