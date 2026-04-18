#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const METRICS = ['lines', 'statements', 'functions', 'branches']

function parseArgs(argv) {
  const opts = {}
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      opts[key] = true
    } else {
      opts[key] = next
      i += 1
    }
  }
  return opts
}

function readSummary(summaryPath) {
  const absolute = path.resolve(ROOT, String(summaryPath || path.join('coverage', 'coverage-summary.json')))
  if (!fs.existsSync(absolute)) {
    return { ok: false, detail: `coverage summary not found: ${absolute}` }
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || !parsed.total || typeof parsed.total !== 'object') {
      return { ok: false, detail: `coverage summary missing total block: ${absolute}` }
    }
    return { ok: true, absolute, parsed }
  } catch (error) {
    return { ok: false, detail: `invalid coverage summary JSON: ${error.message}` }
  }
}

function runCoverageCheck(options = {}) {
  const threshold = Number(options.threshold || 80)
  if (!Number.isFinite(threshold)) {
    return { ok: false, detail: `invalid threshold: ${options.threshold}` }
  }

  const loaded = readSummary(options.summary)
  if (!loaded.ok) return loaded

  const totals = loaded.parsed.total
  const seen = []
  const failed = []

  for (const metric of METRICS) {
    const pct = Number(totals?.[metric]?.pct)
    if (!Number.isFinite(pct)) continue
    seen.push(`${metric}=${pct}`)
    if (pct < threshold) {
      failed.push(`${metric}=${pct} < ${threshold}`)
    }
  }

  if (seen.length === 0) {
    return { ok: false, detail: `coverage summary has no supported metrics: ${loaded.absolute}` }
  }

  return {
    ok: failed.length === 0,
    detail: failed.length === 0 ? `ok (${seen.join(', ')})` : failed.join(' | '),
    summaryPath: loaded.absolute,
    threshold,
    metrics: seen,
  }
}

function main() {
  const opts = parseArgs(process.argv)
  const result = runCoverageCheck({
    summary: opts.summary,
    threshold: opts.threshold,
  })
  if (!result.ok) {
    console.error(`[coverage-check] FAIL ${result.detail}`)
    process.exit(1)
  }
  console.log(`[coverage-check] PASS ${result.detail}`)
}

module.exports = { runCoverageCheck }

if (require.main === module) {
  main()
}
