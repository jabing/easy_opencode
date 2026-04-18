const {
  EXIT_CODE,
  buildUsage,
  handleCliError,
  parseCliArgs,
  resolveIo,
  resolveRootOption,
  writeJson,
} = require('./lib/shared.js');

/** @param {(command: string, args: string[]) => string} formatManagedInvocation */
function createUsage(formatManagedInvocation) {
  return buildUsage(formatManagedInvocation, [
    ['bootstrap', '--json'],
    ['bootstrap', '--apply', '--preset', 'node-team', '--json'],
    ['bootstrap', '--apply', '--bundle', 'release-governance', '--json'],
    ['bootstrap', '--apply', '--preset', 'node-platform', '--bundle', 'release-governance', '--mode', 'platform', '--json'],
  ]);
}

/** @param {string[]} argv */
function parseArgs(argv) {
  return parseCliArgs(argv, { multiValueKeys: ['bundle', 'preset'] });
}

/** @param {unknown} value @returns {string[]} */
function normalizeList(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean)));
}

/** @param {ReturnType<typeof parseArgs>} opts */
function resolveBundles(opts) {
  return normalizeList(opts.bundle);
}

/** @param {ReturnType<typeof parseArgs>} opts */
function resolvePresets(opts) {
  return normalizeList(opts.preset);
}

/** @param {{ write(chunk: string): void }} stdout @param {{ root: string, result: Record<string, unknown> }} payload */
function printHuman(stdout, payload) {
  stdout.write(`bootstrap root: ${payload.root}\n`);
  stdout.write(`apply: ${payload.result.apply === true ? 'yes' : 'no'}\n`);
  if (Array.isArray(payload.result.recommended_presets)) {
    stdout.write(`recommended presets: ${payload.result.recommended_presets.join(', ') || 'none'}\n`);
  }
  if (Array.isArray(payload.result.effective_bundles)) {
    stdout.write(`effective bundles: ${payload.result.effective_bundles.join(', ') || 'none'}\n`);
  }
}

/** @param {{
 * bootstrapEcosystem?: (rootDir: string, options: Record<string, unknown>) => Record<string, unknown>,
 * argv?: string[],
 * stdout?: { write(chunk: string): void },
 * stderr?: { write(chunk: string): void },
 * exit?: (code: number) => void,
 * formatManagedInvocation?: ((command: string, args: string[]) => string),
 * }} [deps] */
function main(deps = {}) {
  const io = resolveIo({
    argv: deps.argv,
    stdout: deps.stdout,
    stderr: deps.stderr,
    exit: deps.exit,
    formatManagedInvocation: deps.formatManagedInvocation,
  });

  try {
    if (typeof deps.bootstrapEcosystem !== 'function') {
      throw new Error('bootstrapEcosystem is required');
    }

    const opts = parseArgs(io.argv);
    if (opts.help || opts.h) {
      io.stdout.write(createUsage(io.formatManagedInvocation) + '\n');
      io.exit(EXIT_CODE.OK);
      return;
    }

    const root = resolveRootOption(opts, opts._[0]);
    const payload = {
      command: 'bootstrap',
      root,
      result: deps.bootstrapEcosystem(root, {
        apply: opts.apply === true,
        bootstrap: opts.apply === true,
        presets: resolvePresets(opts),
        bundles: resolveBundles(opts),
        mode: typeof opts.mode === 'string' ? opts.mode : null,
      }),
    };

    if (opts.json) {
      writeJson(io.stdout, payload);
      return;
    }
    printHuman(io.stdout, payload);
  } catch (error) {
    handleCliError(io.stderr, 'bootstrap', error, {
      usage: createUsage(io.formatManagedInvocation),
      exitCode: EXIT_CODE.INVALID_ARGS,
      exit: io.exit,
    });
  }
}

module.exports = {
  createUsage,
  main,
  normalizeList,
  parseArgs,
  printHuman,
  resolveBundles,
  resolvePresets,
};
