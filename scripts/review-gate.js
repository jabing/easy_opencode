#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const RUN_ROOT = path.join(ROOT, '.opencode', 'eoc-run');
const ALLOWED_VERDICTS = new Set(['APPROVE', 'APPROVE_WITH_WARNINGS', 'REJECT']);
const DISALLOWED_REVIEWERS = new Set(['eoc_code_reviewer', 'security-reviewer']);

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

function runReviewDir(runId) {
  return path.join(RUN_ROOT, runId, 'reviews');
}

function readVerdict(filePath, kind, runId) {
  if (!fs.existsSync(filePath)) throw new Error(`${kind} evidence missing: ${filePath}`);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const evidenceRunId = String(parsed.run_id || '').trim();
  if (!evidenceRunId) throw new Error(`${kind} run_id missing in ${filePath}`);
  if (evidenceRunId !== runId) {
    throw new Error(`${kind} run_id mismatch in ${filePath}: expected=${runId} got=${evidenceRunId}`);
  }
  const verdict = String(parsed.verdict || '').toUpperCase();
  if (!verdict) throw new Error(`${kind} verdict missing in ${filePath}`);
  if (!ALLOWED_VERDICTS.has(verdict)) {
    throw new Error(`${kind} verdict invalid in ${filePath}: ${verdict}`);
  }
  const reviewer = String(parsed.reviewer || '').trim();
  if (!reviewer) throw new Error(`${kind} reviewer missing in ${filePath}`);
  if (DISALLOWED_REVIEWERS.has(reviewer)) {
    throw new Error(`${kind} reviewer is reserved/internal in ${filePath}: ${reviewer}`);
  }
  const source = String(parsed.source || '').toLowerCase();
  if (source !== 'external') {
    throw new Error(`${kind} source must be "external" in ${filePath}`);
  }
  const generatedAt = String(parsed.generated_at || '').trim();
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error(`${kind} generated_at missing or invalid in ${filePath}`);
  }
  if (!Array.isArray(parsed.findings)) {
    throw new Error(`${kind} findings must be an array in ${filePath}`);
  }
  return verdict;
}

function runReviewGate(options = {}) {
  const runId = String(options.runId || '').trim();
  if (!runId) return { ok: false, detail: 'missing runId' };
  try {
    const dir = options.reviewDir ? path.resolve(ROOT, String(options.reviewDir)) : runReviewDir(runId);
    const codePath = options.codeFile ? path.resolve(ROOT, String(options.codeFile)) : path.join(dir, 'code-review.json');
    const securityPath = options.securityFile ? path.resolve(ROOT, String(options.securityFile)) : path.join(dir, 'security-review.json');
    const code = readVerdict(codePath, 'code-review', runId);
    const security = readVerdict(securityPath, 'security-review', runId);
    const verdicts = { code, security };
    const ok = code !== 'REJECT' && security !== 'REJECT';
    return { ok, detail: `code=${code} security=${security}`, verdicts, evidenceDir: dir, codePath, securityPath };
  } catch (err) {
    return { ok: false, detail: String(err.message || err) };
  }
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
  const r = runReviewGate({
    runId,
    reviewDir: opts['review-dir'],
    codeFile: opts['code-file'],
    securityFile: opts['security-file'],
  });
  if (!r.ok) {
    console.error(`[review-gate] FAIL ${r.detail}`);
    process.exit(1);
  }
  console.log(`[review-gate] PASS ${r.detail}`);
}

module.exports = { runReviewGate, verdictFromQuality };

if (require.main === module) {
  main();
}
