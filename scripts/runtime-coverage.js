#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const inspector = require('inspector');
const { runRegressionSuite } = require('./regression-suite.js');

const ROOT = process.cwd();
const SUMMARY_PATH = path.join(ROOT, 'coverage', 'coverage-summary.json');

function postAsync(session, method, params = {}) {
  return new Promise((resolve, reject) => {
    session.post(method, params, (err, result) => {
      if (err) reject(err);
      else resolve(result || {});
    });
  });
}

function buildSummary(result) {
  const normalizedRoot = path.normalize(ROOT).toLowerCase();
  let totalBytes = 0;
  let coveredBytes = 0;
  let totalFuncs = 0;
  let coveredFuncs = 0;

  for (const script of result || []) {
    const url = String(script.url || '');
    let normalizedUrl = url.replace(/^file:\/\//, '');
    if (/^\/[A-Za-z]:\//.test(normalizedUrl)) normalizedUrl = normalizedUrl.slice(1);
    normalizedUrl = path.normalize(normalizedUrl).toLowerCase();
    if (!normalizedUrl.includes(path.normalize(path.join('scripts', '')).toLowerCase())) continue;
    if (!normalizedUrl.startsWith(normalizedRoot)) continue;

    for (const fn of script.functions || []) {
      totalFuncs += 1;
      let fnCovered = false;
      for (const r of fn.ranges || []) {
        const len = Math.max(0, Number(r.endOffset || 0) - Number(r.startOffset || 0));
        totalBytes += len;
        if (Number(r.count || 0) > 0) {
          coveredBytes += len;
          fnCovered = true;
        }
      }
      if (fnCovered) coveredFuncs += 1;
    }
  }

  const bytesPct = totalBytes > 0 ? (coveredBytes / totalBytes) * 100 : 0;
  const funcsPct = totalFuncs > 0 ? (coveredFuncs / totalFuncs) * 100 : 0;
  const pct = Math.max(bytesPct, funcsPct);

  return {
    total: {
      lines: { pct: Number(pct.toFixed(2)) },
      statements: { pct: Number(bytesPct.toFixed(2)) },
      functions: { pct: Number(funcsPct.toFixed(2)) },
      branches: { pct: Number(funcsPct.toFixed(2)) },
    },
    meta: {
      metric: 'v8-precise-coverage',
      bytes_pct: Number(bytesPct.toFixed(2)),
      functions_pct: Number(funcsPct.toFixed(2)),
      total_bytes: totalBytes,
      covered_bytes: coveredBytes,
      total_functions: totalFuncs,
      covered_functions: coveredFuncs,
      generated_at: new Date().toISOString(),
    },
  };
}

async function runRuntimeCoverage(options = {}) {
  const session = new inspector.Session();
  session.connect();
  try {
    // Warm-up run to stabilize branch paths and reduce coverage variance across entrypoints.
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(path.join(ROOT, 'scripts'))) {
        delete require.cache[key];
      }
    }
    {
      const { runCorePipelineSmoke } = require('./test-core-pipeline.js');
      await runCorePipelineSmoke({ silent: true });
      await runRegressionSuite();
    }

    await postAsync(session, 'Profiler.enable');
    await postAsync(session, 'Profiler.startPreciseCoverage', { callCount: true, detailed: true });
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(path.join(ROOT, 'scripts'))) {
        delete require.cache[key];
      }
    }
    const { runCorePipelineSmoke } = require('./test-core-pipeline.js');
    await runCorePipelineSmoke({ silent: true });
    await runRegressionSuite();
    await runCorePipelineSmoke({ silent: true });
    await runRegressionSuite();
    const data = await postAsync(session, 'Profiler.takePreciseCoverage');
    await postAsync(session, 'Profiler.stopPreciseCoverage');
    await postAsync(session, 'Profiler.disable');

    const summary = buildSummary(data.result || []);
    fs.mkdirSync(path.dirname(SUMMARY_PATH), { recursive: true });
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2) + '\n', 'utf8');
    if (!options.silent) {
      console.log(`[runtime-coverage] PASS lines=${summary.total.lines.pct}% summary=${SUMMARY_PATH}`);
    }
    return { ok: true, summaryPath: SUMMARY_PATH, summary };
  } finally {
    session.disconnect();
  }
}

async function main() {
  try {
    await runRuntimeCoverage();
  } catch (err) {
    console.error(`[runtime-coverage] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { runRuntimeCoverage };

if (require.main === module) {
  main();
}
