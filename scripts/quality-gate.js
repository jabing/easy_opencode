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
    let child;
    try {
      child = spawn(command, args, {
        cwd: ROOT,
        shell: process.platform === 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({
        code: 1,
        timedOut: false,
        output: String(error.message || error),
      });
      return;
    }
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
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        code: 1,
        timedOut: false,
        output: String(error.message || error),
      });
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

function parseFrontmatter(content) {
  const normalized = content.replace(/^\uFEFF/, '');
  const m = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
  if (!m) return {};
  const body = m[1];
  const out = {};
  for (const line of body.split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_.-]+)\s*:\s*(.+)\s*$/);
    if (!kv) continue;
    out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function countCommands() {
  const dir = path.join(ROOT, 'commands');
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.md')).length;
}

function countSkills() {
  const dir = path.join(ROOT, 'skills');
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md'))).length;
}

function countAgentsFromInstall() {
  const installPath = path.join(ROOT, 'scripts', 'install.js');
  const text = fs.readFileSync(installPath, 'utf8');
  const m = text.match(/function buildAgents\([^)]*\)\s*\{\s*return\s*\{([\s\S]*?)\n\s*\}\s*\}/);
  if (!m) throw new Error('cannot parse buildAgents()');
  const body = m[1];
  const keys = [...body.matchAll(/^\s{4}(?:'([^']+)'|([a-zA-Z0-9_-]+))\s*:\s*\{/gm)].map((x) => x[1] || x[2]);
  return keys.length;
}

function parseCountTuple(text, re) {
  const m = text.match(re);
  if (!m) throw new Error('count tuple not found');
  return { agents: Number(m[1]), skills: Number(m[2]), commands: Number(m[3]) };
}

function validateMetadataConsistency() {
  const actual = {
    agents: countAgentsFromInstall(),
    skills: countSkills(),
    commands: countCommands(),
  };
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const agentsMd = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  const tuples = [
    ['README.md', parseCountTuple(readme, /-\s*(\d+)\s+specialized agents[\s\S]*?-\s*(\d+)\+?\s+skills[\s\S]*?-\s*(\d+)\s+commands/i)],
    ['AGENTS.md', parseCountTuple(agentsMd, /with\s+(\d+)\s+specialized agents,\s*(\d+)\+?\s+skills,\s*(\d+)\s+commands/i)],
    ['package.json', parseCountTuple(String(pkg.description || ''), /with\s+(\d+)\s+specialized agents,\s*(\d+)\+?\s+skills,\s*(\d+)\s+commands/i)],
  ];

  const mismatches = [];
  for (const [name, t] of tuples) {
    if (t.agents !== actual.agents) mismatches.push(`${name}:agents=${t.agents} expected=${actual.agents}`);
    if (t.skills !== actual.skills) mismatches.push(`${name}:skills=${t.skills} expected=${actual.skills}`);
    if (t.commands !== actual.commands) mismatches.push(`${name}:commands=${t.commands} expected=${actual.commands}`);
  }
  return {
    ok: mismatches.length === 0,
    detail: mismatches.length === 0 ? `ok agents=${actual.agents} skills=${actual.skills} commands=${actual.commands}` : mismatches.join(' | '),
  };
}

function validateSkillsAndWriteRegistry() {
  const skillsDir = path.join(ROOT, 'skills');
  if (!fs.existsSync(skillsDir)) {
    return { ok: false, detail: 'skills directory missing' };
  }
  const dirs = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));

  const failures = [];
  const names = new Map();
  const skills = [];

  for (const dir of dirs) {
    const base = path.join(skillsDir, dir);
    const skillFile = path.join(base, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      failures.push(`${dir}: missing SKILL.md`);
      continue;
    }
    const content = fs.readFileSync(skillFile, 'utf8');
    const fm = parseFrontmatter(content);
    const name = String(fm.name || dir).trim();
    names.set(name, (names.get(name) || 0) + 1);
    skills.push({
      dir,
      name,
      origin: fm.origin || '',
      version: fm.version || '',
      assets: {
        scripts: fs.existsSync(path.join(base, 'scripts')),
        data: fs.existsSync(path.join(base, 'data')),
        templates: fs.existsSync(path.join(base, 'templates')),
      },
    });
  }

  for (const [name, count] of names.entries()) {
    if (count > 1) failures.push(`duplicate skill name: ${name}`);
  }

  const registry = {
    generated_at: new Date().toISOString(),
    counts: { total_dirs: dirs.length, indexed: skills.length, failures: failures.length },
    skills,
  };
  fs.writeFileSync(path.join(skillsDir, 'registry.json'), JSON.stringify(registry, null, 2) + '\n', 'utf8');

  return { ok: failures.length === 0, detail: failures.length === 0 ? 'ok' : failures.join(' | ') };
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

async function runInternalScript(name) {
  if (name === 'lint') {
    const { runMetadataCheck } = require('./metadata-check.js');
    const r = runMetadataCheck();
    return { code: r.ok ? 0 : 1, output: r.ok ? r.detail : r.failures.join(' | ') };
  }
  if (name === 'typecheck') {
    const { runTypecheck } = require('./typecheck.js');
    const r = runTypecheck();
    const note = r.degraded ? `checked=${r.checked}; degraded=typescript-unavailable` : `checked=${r.checked}`;
    return { code: r.ok ? (r.degraded ? 2 : 0) : 1, output: r.ok ? note : r.failures.slice(0, 5).join(' | ') };
  }
  if (name === 'build') {
    const { runBuildCheck } = require('./build-check.js');
    const r = runBuildCheck();
    return { code: r.ok ? 0 : 1, output: r.ok ? 'ok' : (r.missing || []).join(' | ') };
  }
  if (name === 'test') {
    const { runCorePipelineSmoke } = require('./test-core-pipeline.js');
    const r = await runCorePipelineSmoke({ silent: true });
    return { code: r && r.ok ? 0 : 1, output: r && r.runId ? `run_id=${r.runId}` : 'unknown' };
  }
  if (name === 'coverage') {
    const { runRuntimeCoverage } = require('./runtime-coverage.js');
    const { runCoverageCheck } = require('./coverage-check.js');
    await runRuntimeCoverage({ silent: true });
    const cov = runCoverageCheck({ summary: path.join(ROOT, 'coverage', 'coverage-summary.json'), threshold: 75 });
    return { code: cov.ok ? 0 : 1, output: cov.detail };
  }
  return null;
}

async function runQualityGate(options = {}) {
  const full = toBool(options.full);
  const strict = toBool(options.strict);
  const jsonMode = toBool(options.json);
  const timeoutMs = Number(options.timeout || 180000);
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

  // Skill structure gate: validate inventory and emit skills/registry.json.
  const skillGate = validateSkillsAndWriteRegistry();
  addResult(results, skillGate.ok ? 'pass' : 'fail', 'skills.registry', skillGate.detail);

  // Metadata consistency gate: README/AGENTS/package counts must match filesystem truth.
  const metadataGate = validateMetadataConsistency();
  addResult(
    results,
    metadataGate.ok ? 'pass' : 'fail',
    'metadata.consistency',
    metadataGate.detail
  );

  const scripts = (pkg && pkg.scripts) || {};
  if (full) {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const ordered = [
      ['lint', ['run', 'lint']],
      ['typecheck', ['run', 'typecheck']],
      ['test', ['test']],
      ['coverage', ['run', 'coverage']],
      ['build', ['run', 'build']],
    ];
    for (const [name, args] of ordered) {
      if (!scripts[name]) {
        addResult(results, 'skip', `script:${name}`, 'not defined');
        continue;
      }
      const internal = await runInternalScript(name);
      if (internal) {
        if (name === 'typecheck' && internal.code === 2) {
          addResult(
            results,
            strict ? 'fail' : 'warn',
            `script:${name}`,
            `degraded: ${internal.output}`
          );
          continue;
        }
        addResult(
          results,
          internal.code === 0 ? 'pass' : 'fail',
          `script:${name}`,
          internal.code === 0 ? `ok (${internal.output})` : `internal fail: ${internal.output.slice(0, 300)}`
        );
        continue;
      }
      const r = await runCommand(npmCmd, args, timeoutMs);
      if (/EPERM/i.test(r.output || '')) {
        addResult(results, 'fail', `script:${name}`, 'spawn EPERM (cannot bypass full gate)');
        continue;
      }
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

  const payload = {
    gate: gatePass ? 'PASS' : 'FAIL',
    strict,
    full,
    counts,
    results,
  };

  if (!options.silent) {
    if (jsonMode) {
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
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
  }

  return payload;
}

async function main() {
  try {
    const opts = parseArgs(process.argv);
    const result = await runQualityGate(opts);
    process.exit(result.gate === 'PASS' ? 0 : 1);
  } catch (err) {
    console.error(`[quality-gate] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { runQualityGate };

if (require.main === module) {
  main();
}
