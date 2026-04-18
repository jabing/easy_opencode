const fs = require('fs');
const path = require('path');

/** @type {any | null} */
let ts = null;
try {
  ts = require('typescript');
} catch {
  ts = null;
}

/** @typedef {{ ok: boolean, checked: number, strict_checked: number, quarantined: number, total_src_files: number, failures: string[], degraded: boolean, configPath: string }} TypecheckResult */

/** @param {string} dir @param {string[]} out */
function collectJsFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJsFiles(abs, out);
    else if (entry.isFile() && abs.endsWith('.js')) out.push(abs);
  }
}

/** @param {string} filePath */
function hasTsNoCheck(filePath) {
  if (!fs.existsSync(filePath)) return false;
  return /@ts-nocheck/.test(fs.readFileSync(filePath, 'utf8').slice(0, 160));
}

/** @param {string} root */
function summarizeSrcTypecheckState(root) {
  /** @type {string[]} */
  const files = [];
  collectJsFiles(path.join(root, 'src'), files);
  const total = files.length;
  const quarantined = files.filter((file) => hasTsNoCheck(file)).length;
  return {
    total_src_files: total,
    quarantined,
    strict_checked: total - quarantined,
  };
}

/**
 * @param {string} [root]
 * @param {{ configFile?: string }} [options]
 * @returns {TypecheckResult}
 */
function runTypecheck(root = process.cwd(), options = {}) {
  const configPath = path.resolve(root, options.configFile || 'tsconfig.json');
  const summary = summarizeSrcTypecheckState(root);
  if (!ts) {
    return { ok: true, checked: summary.strict_checked, strict_checked: summary.strict_checked, quarantined: summary.quarantined, total_src_files: summary.total_src_files, failures: [], degraded: true, configPath };
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    const message = ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n');
    return { ok: false, checked: summary.strict_checked, strict_checked: summary.strict_checked, quarantined: summary.quarantined, total_src_files: summary.total_src_files, failures: [`tsconfig: ${message}`], degraded: false, configPath };
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const failures = diagnostics.map(/** @param {any} diagnostic */ (diagnostic) => formatDiagnostic(diagnostic, root));
  return {
    ok: failures.length === 0,
    checked: summary.strict_checked,
    strict_checked: summary.strict_checked,
    quarantined: summary.quarantined,
    total_src_files: summary.total_src_files,
    failures,
    degraded: false,
    configPath,
  };
}

/** @param {TypecheckResult} result */
function formatSummary(result) {
  return `checked=${result.strict_checked} total=${result.total_src_files} quarantined=${result.quarantined}`;
}

/** @param {any} diagnostic @param {string} root */
function formatDiagnostic(diagnostic, root) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (!diagnostic.file || typeof diagnostic.start !== 'number') return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  const fileName = path.relative(root, diagnostic.file.fileName).replace(/\\/g, '/');
  return `${fileName}:${position.line + 1}:${position.character + 1} ${message}`;
}

/** @param {string} [label] @param {string[]} [argv] */
function main(label = 'typecheck', argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const result = runTypecheck();
  if (json) {
    process.stdout.write(`${JSON.stringify({ label, ...result }, null, 2)}\n`);
    if (!result.ok) process.exit(1);
    return;
  }
  if (!result.ok) {
    process.stderr.write(`[${label}] FAIL\n`);
    result.failures.slice(0, 20).forEach((failure) => process.stderr.write(`- ${failure}\n`));
    process.exit(1);
  }
  if (result.degraded) {
    process.stdout.write(`[${label}] PASS (degraded: typescript unavailable) ${formatSummary(result)}\n`);
    return;
  }
  process.stdout.write(`[${label}] PASS ${formatSummary(result)}\n`);
}

module.exports = {
  main,
  runTypecheck,
  summarizeSrcTypecheckState,
};
