const fs = require('fs');
const path = require('path');
const { collectFiles } = require('../../adapters/file-walker.js');
const { evaluateFileRiskRules } = require('../rules/file-risk-rules.js');
const { IGNORED_DIRS, CODE_EXT } = require('./shared.js');

/** @typedef {{ fail: string[], warn: string[] }} StaticScanFindings */

/** @param {string} root */
function collectCodeFiles(root) {
  return collectFiles(root, { allowedExtensions: CODE_EXT, ignoredDirs: IGNORED_DIRS });
}

/** @param {string} root @param {string} filePath @param {StaticScanFindings} findings */
function scanFile(root, filePath, findings) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(root, filePath).replace(/\\/g, '/');
  const isTest = /(^|\/)(test|tests|__tests__)\/|(\.test\.|\.spec\.)/i.test(rel);
  const isAppCode = /^(src|lib|app)\//.test(rel);
  if (rel === 'scripts/quality-gate.js' || rel === 'src/core/rules/file-risk-rules.js') return;
  const evaluation = evaluateFileRiskRules({ rel, content, isTest, isAppCode });
  for (const finding of evaluation.findings) {
    const rendered = `${finding.message} in ${finding.location || rel}`;
    if (finding.severity === 'error') findings.fail.push(rendered);
    if (finding.severity === 'warn') findings.warn.push(rendered);
  }
}

/** @param {string} root @returns {StaticScanFindings} */
function collectStaticScanResults(root) {
  /** @type {StaticScanFindings} */
  const findings = { fail: [], warn: [] };
  for (const filePath of collectCodeFiles(root)) {
    try {
      scanFile(root, filePath, findings);
    } catch (error) {
      const rel = path.relative(root, filePath).replace(/\\/g, '/');
      findings.warn.push(`[scan] failed to read ${rel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return findings;
}

module.exports = { collectCodeFiles, scanFile, collectStaticScanResults };
