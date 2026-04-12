#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DEFAULT_SUMMARY = path.join(ROOT, 'coverage', 'coverage-summary.json');

function runCoverageCheck(options = {}) {
  const summaryPath = path.resolve(ROOT, String(options.summary || DEFAULT_SUMMARY));
  if (!fs.existsSync(summaryPath)) {
    return { ok: false, detail: `coverage summary not found: ${summaryPath}` };
  }
  const parsed = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const total = parsed.total || {};
  const lines = total.lines || {};
  const pct = Number(lines.pct);
  if (!Number.isFinite(pct)) return { ok: false, detail: 'invalid coverage summary: total.lines.pct missing' };
  const threshold = Number(options.threshold || 80);
  const ok = pct >= threshold;
  return {
    ok,
    detail: `lines=${pct.toFixed(1)}% threshold=${threshold}% source=${summaryPath}`,
    metrics: { lines_pct: pct, threshold, source: summaryPath },
  };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;
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

function main() {
  const opts = parseArgs(process.argv);
  const r = runCoverageCheck({ summary: opts.summary, threshold: opts.threshold });
  if (!r.ok) {
    console.error(`[coverage-check] FAIL ${r.detail}`);
    process.exit(1);
  }
  console.log(`[coverage-check] PASS ${r.detail}`);
}

module.exports = { runCoverageCheck };

if (require.main === module) {
  main();
}
