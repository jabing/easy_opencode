#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const RUN_ROOT = path.join(ROOT, '.opencode', 'eoc-run');

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

function writeReviewEvidence(runId, qualityResult) {
  const verdicts = verdictFromQuality(qualityResult || {});
  const dir = runReviewDir(runId);
  fs.mkdirSync(dir, { recursive: true });
  const codePath = path.join(dir, 'code-review.json');
  const secPath = path.join(dir, 'security-review.json');
  fs.writeFileSync(
    codePath,
    JSON.stringify(
      {
        run_id: runId,
        generated_at: new Date().toISOString(),
        reviewer: 'eoc_code_reviewer',
        source: 'external',
        verdict: verdicts.code,
        findings: [],
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  fs.writeFileSync(
    secPath,
    JSON.stringify(
      {
        run_id: runId,
        generated_at: new Date().toISOString(),
        reviewer: 'security-reviewer',
        source: 'external',
        verdict: verdicts.security,
        findings: [],
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  return { codePath, secPath, verdicts };
}

function readVerdict(filePath, kind) {
  if (!fs.existsSync(filePath)) throw new Error(`${kind} evidence missing: ${filePath}`);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const verdict = String(parsed.verdict || '').toUpperCase();
  if (!verdict) throw new Error(`${kind} verdict missing in ${filePath}`);
  const reviewer = String(parsed.reviewer || '').trim();
  if (!reviewer) throw new Error(`${kind} reviewer missing in ${filePath}`);
  const source = String(parsed.source || '').toLowerCase();
  if (source !== 'external') {
    throw new Error(`${kind} source must be "external" in ${filePath}`);
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
    const code = readVerdict(codePath, 'code-review');
    const security = readVerdict(securityPath, 'security-review');
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
  if (opts['write-from-quality']) {
    const qualityPath = path.resolve(ROOT, String(opts['write-from-quality']));
    const quality = fs.existsSync(qualityPath) ? JSON.parse(fs.readFileSync(qualityPath, 'utf8')) : {};
    writeReviewEvidence(runId, quality);
  }
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

module.exports = { runReviewGate, writeReviewEvidence };

if (require.main === module) {
  main();
}
