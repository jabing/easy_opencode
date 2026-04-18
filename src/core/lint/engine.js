const fs = require('fs');
const path = require('path');
const { collectFiles } = require('../../adapters/file-walker.js');
const { loadLintConfig } = require('./config.js');

/** @type {any | null} */
let ts = null;
try {
  ts = require('typescript');
} catch {
  ts = null;
}

/**
 * @typedef {'error' | 'warn'} LintSeverity
 * @typedef {{ file: string, line: number | null, column: number | null, rule: string, severity: LintSeverity, message: string }} LintFinding
 * @typedef {{ ok: boolean, errors: number, warnings: number, files: number, findings: LintFinding[], maxWarnings: number, configPath: string | null }} LintResult
 */

/** @param {string} filePath @param {string[]} include */
function matchesInclude(filePath, include) {
  const normalized = filePath.split(path.sep).join('/');
  return include.some((pattern) => {
    const p = String(pattern || '');
    if (!p.includes('*')) return normalized === p || normalized.startsWith(`${p.replace(/\/$/, '')}/`);
    const prefix = p.split('**')[0] || p;
    const cleanPrefix = prefix.replace(/\/$/, '');
    return normalized.startsWith(cleanPrefix);
  });
}

/** @param {string} root @param {{ include: string[], extensions: string[], ignoreDirs: string[] }} config */
function collectLintFiles(root, config) {
  const files = collectFiles(root, {
    allowedExtensions: new Set(config.extensions.map((item) => String(item).toLowerCase())),
    ignoredDirs: new Set(config.ignoreDirs),
  });
  return files.filter((file) => matchesInclude(path.relative(root, file), config.include));
}

/** @param {string} text @param {string} rel @param {(finding: LintFinding) => void} push @param {Record<string, 'off' | 'warn' | 'error'>} rules */
function runTextRules(text, rel, push, rules) {
  if (rules['no-trailing-whitespace'] && rules['no-trailing-whitespace'] !== 'off') {
    const severity = /** @type {LintSeverity} */ (rules['no-trailing-whitespace'] === 'error' ? 'error' : 'warn');
    const lines = text.split(/\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = (lines[index] || '').replace(/\r$/, '');
      if (/[ \t]+$/.test(line)) {
        push({ file: rel, line: index + 1, column: line.length, rule: 'no-trailing-whitespace', severity, message: 'Trailing whitespace is not allowed.' });
      }
    }
  }
  if (rules['eol-last'] && rules['eol-last'] !== 'off' && text.length > 0 && !text.endsWith('\n')) {
    const severity = /** @type {LintSeverity} */ (rules['eol-last'] === 'error' ? 'error' : 'warn');
    const lines = text.split(/\r?\n/);
    const lastLine = lines.length > 0 ? (lines[lines.length - 1] || '') : '';
    push({ file: rel, line: lines.length, column: lastLine.length + 1, rule: 'eol-last', severity, message: 'File must end with a newline.' });
  }
}

/** @param {any} node @param {any} sourceFile @param {string} rel @param {(finding: LintFinding) => void} push @param {Record<string, 'off' | 'warn' | 'error'>} rules */
function walkAst(node, sourceFile, rel, push, rules) {
  if (!ts) return;
  if (rules['no-debugger'] && rules['no-debugger'] !== 'off' && ts.isDebuggerStatement(node)) {
    const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    push({ file: rel, line: pos.line + 1, column: pos.character + 1, rule: 'no-debugger', severity: rules['no-debugger'] === 'error' ? 'error' : 'warn', message: 'Unexpected debugger statement.' });
  }
  if (rules['no-var'] && rules['no-var'] !== 'off' && ts.isVariableDeclarationList(node)) {
    if ((node.flags & ts.NodeFlags.BlockScoped) === 0) {
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      push({ file: rel, line: pos.line + 1, column: pos.character + 1, rule: 'no-var', severity: rules['no-var'] === 'error' ? 'error' : 'warn', message: 'Unexpected var, use let or const instead.' });
    }
  }
  ts.forEachChild(node, /** @param {any} child */ (child) => walkAst(child, sourceFile, rel, push, rules));
}

/** @param {string} file @param {string} root @param {Record<string, 'off' | 'warn' | 'error'>} rules @param {(finding: LintFinding) => void} push */
function lintFile(file, root, rules, push) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');
  runTextRules(text, rel, push, rules);
  if (!ts) return;
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const diagnostics = Array.isArray(sourceFile.parseDiagnostics) ? sourceFile.parseDiagnostics : [];
  for (const diagnostic of diagnostics) {
    const start = typeof diagnostic.start === 'number' ? diagnostic.start : 0;
    const pos = sourceFile.getLineAndCharacterOfPosition(start);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    push({ file: rel, line: pos.line + 1, column: pos.character + 1, rule: 'parse-error', severity: 'error', message });
  }
  walkAst(sourceFile, sourceFile, rel, push, rules);
}

/** @param {string} [root] @returns {LintResult} */
function runLint(root = process.cwd()) {
  const config = loadLintConfig(root);
  const files = collectLintFiles(root, config);
  /** @type {LintFinding[]} */
  const findings = [];
  for (const file of files) lintFile(file, root, config.rules, (finding) => findings.push(finding));
  const errors = findings.filter((item) => item.severity === 'error').length;
  const warnings = findings.filter((item) => item.severity === 'warn').length;
  const ok = errors === 0 && warnings <= config.maxWarnings;
  return {
    ok,
    errors,
    warnings,
    files: files.length,
    findings,
    maxWarnings: config.maxWarnings,
    configPath: fs.existsSync(path.join(root, 'opencode-lint.json')) ? path.join(root, 'opencode-lint.json') : null,
  };
}

/** @param {LintResult} result */
function formatLintResult(result) {
  if (result.findings.length === 0) return `[lint] PASS files=${result.files} errors=0 warnings=0`;
  const lines = [`[lint] ${result.ok ? 'PASS' : 'FAIL'} files=${result.files} errors=${result.errors} warnings=${result.warnings}`];
  for (const item of result.findings.slice(0, 50)) {
    const location = [item.file, item.line, item.column].filter((value) => value !== null).join(':');
    lines.push(`- ${location} ${item.severity} ${item.rule}: ${item.message}`);
  }
  if (result.findings.length > 50) lines.push(`- ... ${result.findings.length - 50} more finding(s)`);
  return lines.join('\n');
}

/** @param {string[]} argv */
function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
  };
}

/** @param {string[]} [argv] */
function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = runLint();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatLintResult(result)}\n`);
  }
  if (!result.ok) process.exit(1);
}

module.exports = {
  collectLintFiles,
  formatLintResult,
  lintFile,
  main,
  matchesInclude,
  parseArgs,
  runLint,
  runTextRules,
  walkAst,
};
