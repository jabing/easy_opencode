const path = require('path');
const { EXIT_CODE, buildUsage, handleCliError, parseCliArgs, resolveIo, writeJson } = require('./lib/shared.js');
const { assertProjectProfileContract } = require('../shared/contracts.js');

/**
 * @typedef {{ kind: string, command: string }} ValidationCommand
 * @typedef {{
 *   runtime: string,
 *   language: string,
 *   framework: string,
 *   confidence: string|number,
 *   app_type?: string,
 *   package_manager?: string,
 *   repo_shape?: string,
 *   detected_by?: string,
 *   build_tool?: string,
 *   test_runner?: string,
 *   lint_tool?: string,
 *   typecheck_tool?: string,
 *   format_tool?: string,
 *   entrypoints?: string[],
 *   config_files?: string[],
 *   validation_gaps?: string[],
 *   validation: ValidationCommand[],
 *   profile_notes?: string[],
 * }} ProjectProfileLike
 * @typedef {{ _: string[], [key: string]: string | boolean | string[] }} ParsedArgs
 * @typedef {{ write(chunk: string): void }} WritableLike
 * @typedef {{
 *   detectProjectProfile?: (root: string) => ProjectProfileLike,
 *   formatManagedInvocation?: (command: string, args: string[]) => string,
 *   argv?: string[],
 *   stdout?: WritableLike,
 *   stderr?: WritableLike,
 *   exit?: (code: number) => void,
 * }} MainDeps
 */

/** @param {(command: string, args: string[]) => string} formatManagedInvocation */
function createUsage(formatManagedInvocation) {
  return buildUsage(formatManagedInvocation, [
    ['project-profile', '--json'],
    ['project-profile', '--root', '/path/to/project'],
  ]);
}

/** @param {string[]} argv @returns {ParsedArgs} */
function parseArgs(argv) {
  return /** @type {ParsedArgs} */ (parseCliArgs(argv));
}

/** @param {WritableLike} stream @param {string} title @param {string[] | string | undefined} values */
function printList(stream, title, values) {
  if (!values || values.length === 0) return;
  stream.write(`${title}: ${Array.isArray(values) ? values.join(', ') : String(values)}\n`);
}

/** @param {WritableLike} stream @param {ProjectProfileLike} profile @param {string} root */
function printHuman(stream, profile, root) {
  stream.write(`Root: ${root}\n`);
  stream.write(`Runtime: ${profile.runtime}\n`);
  stream.write(`Language: ${profile.language}\n`);
  stream.write(`Framework: ${profile.framework}\n`);
  stream.write(`App type: ${profile.app_type || 'unknown'}\n`);
  stream.write(`Package manager: ${profile.package_manager || 'n/a'}\n`);
  stream.write(`Repo shape: ${profile.repo_shape || 'unknown'}\n`);
  stream.write(`Confidence: ${profile.confidence}\n`);
  stream.write(`Detected by: ${profile.detected_by || 'n/a'}\n`);
  stream.write(`Build tool: ${profile.build_tool || 'n/a'}\n`);
  stream.write(`Test runner: ${profile.test_runner || 'n/a'}\n`);
  stream.write(`Lint tool: ${profile.lint_tool || 'n/a'}\n`);
  stream.write(`Typecheck tool: ${profile.typecheck_tool || 'n/a'}\n`);
  stream.write(`Format tool: ${profile.format_tool || 'n/a'}\n`);
  printList(stream, 'Entrypoints', profile.entrypoints);
  printList(stream, 'Config files', profile.config_files);
  printList(stream, 'Validation gaps', profile.validation_gaps);
  stream.write(`Validation commands: ${profile.validation.length}\n`);
  for (const item of profile.validation) {
    stream.write(`- ${item.kind}: ${item.command}\n`);
  }
  if (Array.isArray(profile.profile_notes) && profile.profile_notes.length > 0) {
    stream.write('Notes:\n');
    for (const note of profile.profile_notes) stream.write(`- ${note}\n`);
  }
}

/** @param {MainDeps} [deps] */
function main(deps = {}) {
  const io = resolveIo({
    argv: deps.argv,
    stdout: deps.stdout,
    stderr: deps.stderr,
    exit: deps.exit,
    formatManagedInvocation: deps.formatManagedInvocation,
  });
  const detectProjectProfile = deps.detectProjectProfile || (() => { throw new Error('detectProjectProfile is required'); });

  try {
    const opts = parseArgs(io.argv);
    if (opts.help || opts.h) {
      io.stdout.write(createUsage(io.formatManagedInvocation) + '\n');
      io.exit(EXIT_CODE.OK);
      return;
    }
    const rootArg = typeof opts.root === 'string' ? opts.root : opts._[0] || process.cwd();
    const root = path.resolve(String(rootArg));
    const profile = detectProjectProfile(root);
    assertProjectProfileContract(profile);
    if (opts.json) {
      writeJson(io.stdout, profile);
      return;
    }
    printHuman(io.stdout, profile, root);
  } catch (error) {
    handleCliError(io.stderr, 'project-profile', error, {
      usage: createUsage(io.formatManagedInvocation),
      exitCode: EXIT_CODE.FAILED,
      exit: io.exit,
    });
  }
}

module.exports = {
  createUsage,
  main,
  parseArgs,
  printHuman,
  printList,
};
