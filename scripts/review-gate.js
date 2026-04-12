#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function verdictFromQuality(quality) {
  const results = Array.isArray(quality && quality.results) ? quality.results : [];
  const fails = results.filter((r) => r.status === 'fail');
  const warns = results.filter((r) => r.status === 'warn');
  const securityHardFail = fails.some((r) => String(r.check || '').includes('static.scan.failures'));

  const code =
    fails.length > 0 ? 'REJECT' : warns.length > 0 ? 'APPROVE_WITH_WARNINGS' : 'APPROVE';
  const security =
    securityHardFail ? 'REJECT' : warns.length > 0 ? 'APPROVE_WITH_WARNINGS' : 'APPROVE';
  return { code, security, fails: fails.length, warns: warns.length };
}

function writeEvidence(runId, payload) {
  const dir = path.join(ROOT, '.opencode', 'eoc-run', runId);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'review-evidence.json');
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return out;
}

function runReviewGate(options = {}) {
  const runId = String(options.runId || '').trim();
  if (!runId) return { ok: false, detail: 'missing runId' };
  const quality = options.qualityResult || {};
  const verdicts = verdictFromQuality(quality);
  const payload = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    verdicts,
  };
  const evidencePath = writeEvidence(runId, payload);
  const ok = verdicts.code !== 'REJECT' && verdicts.security !== 'REJECT';
  return { ok, detail: `code=${verdicts.code} security=${verdicts.security}`, verdicts, evidencePath };
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
  const runId = opts['run-id'];
  const qualityPath = opts.quality ? path.resolve(ROOT, String(opts.quality)) : '';
  const quality = qualityPath && fs.existsSync(qualityPath) ? JSON.parse(fs.readFileSync(qualityPath, 'utf8')) : {};
  const r = runReviewGate({ runId, qualityResult: quality });
  if (!r.ok) {
    console.error(`[review-gate] FAIL ${r.detail}`);
    process.exit(1);
  }
  console.log(`[review-gate] PASS ${r.detail}`);
}

module.exports = { runReviewGate };

if (require.main === module) {
  main();
}
