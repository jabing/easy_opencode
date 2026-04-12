#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SKILLS_DIR = path.join(ROOT, 'skills');

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) {
      opts._.push(t);
      continue;
    }
    const k = t.slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith('--')) opts[k] = true;
    else {
      opts[k] = n;
      i += 1;
    }
  }
  return opts;
}

function parseFrontmatter(content) {
  const normalized = content.replace(/^\uFEFF/, '');
  const m = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
  if (!m) return {};
  const body = m[1];
  const out = {};
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const kv = line.match(/^([a-zA-Z0-9_.-]+)\s*:\s*(.+)\s*$/);
    if (!kv) continue;
    out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function parseUpstream(upstreamPath) {
  if (!fs.existsSync(upstreamPath)) return null;
  const text = fs.readFileSync(upstreamPath, 'utf8');
  const repo = (text.match(/Repository:\s*`?([^\r\n`]+)`?/i) || [])[1] || '';
  const commit = (text.match(/(Synced Commit|Commit):\s*`?([0-9a-f]{7,40})`?/i) || [])[2] || '';
  const license = (text.match(/License:\s*`?([^\r\n`]+)`?/i) || [])[1] || '';
  const syncDate = (text.match(/(Sync Date|Date):\s*`?([0-9-]{8,})`?/i) || [])[2] || '';
  return { repository: repo, commit, license, sync_date: syncDate };
}

function main() {
  const opts = parseArgs(process.argv);
  const quiet = opts.quiet === true;
  const shouldWrite = opts['no-write'] ? false : true;
  const shouldCheck = opts['no-check'] ? false : true;
  const outPath = path.resolve(ROOT, String(opts.write || path.join('skills', 'registry.json')));

  if (!fs.existsSync(SKILLS_DIR)) {
    console.error('[skill-registry] skills directory not found.');
    process.exit(1);
  }

  const dirs = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));

  const failures = [];
  const warnings = [];
  const items = [];
  const names = new Map();

  for (const dir of dirs) {
    const base = path.join(SKILLS_DIR, dir);
    const skillPath = path.join(base, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      failures.push(`${dir}: missing SKILL.md`);
      continue;
    }
    const skillText = fs.readFileSync(skillPath, 'utf8');
    const fm = parseFrontmatter(skillText);
    const declared = String(fm.name || '').trim();
    if (!declared) warnings.push(`${dir}: missing frontmatter name`);
    if (declared && declared !== dir) warnings.push(`${dir}: frontmatter name mismatch (${declared})`);
    const key = declared || dir;
    names.set(key, (names.get(key) || 0) + 1);

    const assets = {
      scripts: fs.existsSync(path.join(base, 'scripts')),
      data: fs.existsSync(path.join(base, 'data')),
      templates: fs.existsSync(path.join(base, 'templates')),
    };
    const upstream = parseUpstream(path.join(base, 'UPSTREAM.md'));
    if (upstream && !upstream.repository) warnings.push(`${dir}: UPSTREAM.md missing repository`);

    items.push({
      dir,
      name: declared || dir,
      description: fm.description || '',
      origin: fm.origin || '',
      version: fm.version || '',
      assets,
      upstream,
      files: {
        skill: path.relative(ROOT, skillPath).replace(/\\/g, '/'),
      },
    });
  }

  for (const [name, count] of names.entries()) {
    if (count > 1) failures.push(`duplicate skill name: ${name}`);
  }

  const registry = {
    generated_at: new Date().toISOString(),
    counts: {
      total_dirs: dirs.length,
      indexed: items.length,
      failures: failures.length,
      warnings: warnings.length,
    },
    skills: items.sort((a, b) => a.dir.localeCompare(b.dir)),
  };

  if (shouldWrite) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  }

  if (!quiet) {
    console.log(`Skills indexed: ${items.length}/${dirs.length}`);
    if (shouldWrite) console.log(`Registry: ${outPath}`);
    if (warnings.length > 0) {
      console.log(`Warnings (${warnings.length}):`);
      warnings.forEach((w) => console.log(`- ${w}`));
    }
    if (failures.length > 0) {
      console.log(`Failures (${failures.length}):`);
      failures.forEach((f) => console.log(`- ${f}`));
    }
  }

  if (shouldCheck && failures.length > 0) {
    process.exit(1);
  }
}

main();
