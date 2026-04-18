const path = require('path');
const { parseArgs: baseParseArgs } = require('../../shared/cli.js');

/** @typedef {{ write(chunk: string): void }} WritableLike */
/** @typedef {{ argv?: string[] | undefined, stdout?: WritableLike | undefined, stderr?: WritableLike | undefined, exit?: ((code: number) => void) | undefined, formatManagedInvocation?: ((command: string, args: string[]) => string) | undefined }} CliDeps */
/** @typedef {{ argv: string[], stdout: WritableLike, stderr: WritableLike, exit: (code: number) => void, formatManagedInvocation: (command: string, args: string[]) => string }} ResolvedCliIo */

const EXIT_CODE = Object.freeze({
  OK: 0,
  FAILED: 1,
  INVALID_ARGS: 2,
  ENVIRONMENT: 3,
  TIMEOUT: 124,
});

/** @param {string[]} argv @param {{ startIndex?: number, multiValueKeys?: string[], initial?: Record<string, unknown> }} [options] */
function parseCliArgs(argv, options) {
  return baseParseArgs(argv, options);
}

/** @param {(command: string, args: string[]) => string} formatManagedInvocation @param {string[][]} examples */
function buildUsage(formatManagedInvocation, examples) {
  return ['Usage:', ...examples.map((example) => {
    const command = example[0] || '';
    const args = example.slice(1);
    return `  ${formatManagedInvocation(command, args)}`;
  })].join('\n');
}

/** @param {CliDeps} [deps] @returns {ResolvedCliIo} */
function resolveIo(deps = {}) {
  return {
    argv: deps.argv || process.argv,
    stdout: deps.stdout || process.stdout,
    stderr: deps.stderr || process.stderr,
    exit: deps.exit || ((code) => process.exit(code)),
    formatManagedInvocation: deps.formatManagedInvocation || ((command, args) => [command].concat(args || []).join(' ')),
  };
}

/** @param {Record<string, unknown>} opts @param {string | undefined} positionalRoot */
function resolveRootOption(opts, positionalRoot) {
  const rootArg = typeof opts.root === 'string' ? opts.root : positionalRoot || process.cwd();
  return path.resolve(String(rootArg));
}

/** @param {WritableLike} stdout @param {unknown} value */
function writeJson(stdout, value) {
  stdout.write(JSON.stringify(value, null, 2) + '\n');
}

/** @param {WritableLike} stderr @param {string} commandName @param {unknown} error @param {{ usage?: string, exitCode?: number, exit?: (code: number) => void }} [options] */
function handleCliError(stderr, commandName, error, options = {}) {
  const message = error instanceof Error ? error.message : String(error);
  stderr.write(`[${commandName}] ${message}\n`);
  if (options.usage) stderr.write(options.usage + '\n');
  if (typeof options.exit === 'function') options.exit(options.exitCode || EXIT_CODE.FAILED);
}

module.exports = {
  EXIT_CODE,
  buildUsage,
  handleCliError,
  parseCliArgs,
  resolveIo,
  resolveRootOption,
  writeJson,
};
