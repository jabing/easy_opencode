const { parseArgs } = require('../shared/cli.js');

const EXIT_CODE = Object.freeze({
  OK: 0,
  FAILED: 1,
  INVALID_ARGS: 2,
  ENVIRONMENT: 3,
  TIMEOUT: 124,
});

/** @typedef {{ write(chunk: string): void }} OutputWriter */
/** @typedef {(code: number) => unknown} ExitHandler */
/** @typedef {{ argv?: string[], stdout?: OutputWriter, stderr?: OutputWriter, exit?: ExitHandler, onError?: (error: unknown, context: RunCliContext) => unknown }} RunCliDeps */
/** @typedef {{ argv: string[], stdout: OutputWriter, stderr: OutputWriter, exit: ExitHandler, parseArgs: typeof parseArgs, writeJson: typeof writeJson, printUsage: typeof printUsage }} RunCliContext */

/** @param {OutputWriter} stdout @param {unknown} value */
function writeJson(stdout, value) {
  stdout.write(JSON.stringify(value, null, 2) + '\n');
}

/** @param {OutputWriter} stdout @param {unknown} usageText */
function printUsage(stdout, usageText) {
  stdout.write(String(usageText || '').replace(/\n?$/, '\n'));
}

/** @param {(command: string, args: string[]) => string} formatManagedInvocation @param {Array<[string, ...string[]]>} examples */
function renderManagedUsage(formatManagedInvocation, examples) {
  return ['Usage:', ...examples.map(([command, ...args]) => `  ${formatManagedInvocation(command, args)}`)].join('\n');
}

/** @param {(context: RunCliContext) => unknown} handler @param {RunCliDeps} [deps] */
function runCli(handler, deps = {}) {
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const exit = deps.exit || ((code) => process.exit(code));
  const argv = deps.argv || process.argv;
  try {
    return handler({ argv, stdout, stderr, exit, parseArgs, writeJson, printUsage });
  } catch (error) {
    if (typeof deps.onError === 'function') {
      return deps.onError(error, { stderr, exit, stdout, argv, printUsage, parseArgs, writeJson });
    }
    throw error;
  }
}

module.exports = {
  EXIT_CODE,
  parseArgs,
  printUsage,
  renderManagedUsage,
  runCli,
  writeJson,
};
