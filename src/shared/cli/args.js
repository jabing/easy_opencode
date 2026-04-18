/**
 * @typedef {{ _: string[], var: string[], [key: string]: string | boolean | string[] }} ParsedCliOptions
 * @typedef {{ cmd: string, opts: ParsedCliOptions }} ParsedCliArgs
 */

/**
 * Parse a simple `--key value` CLI shape with repeated `--var key=value` pairs.
 * Bare `--flag` options are treated as booleans and positional arguments are
 * collected under `opts._`.
 *
 * @param {string[]} argv
 * @param {{ commandIndex?: number, defaultCommand?: string, listFlags?: string[] }} [options]
 * @returns {ParsedCliArgs}
 */
function parseCliArgs(argv, options = {}) {
  const commandIndex = Number.isInteger(options.commandIndex) ? /** @type {number} */ (options.commandIndex) : 2;
  const defaultCommand = String(options.defaultCommand || 'run');
  const listFlags = new Set(Array.isArray(options.listFlags) ? options.listFlags : ['var']);
  const cmd = String(argv[commandIndex] || defaultCommand);
  /** @type {ParsedCliOptions} */
  const opts = { _: [], var: [] };
  for (let index = commandIndex + 1; index < argv.length; index += 1) {
    const token = String(argv[index]);
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = index + 1 < argv.length ? argv[index + 1] : undefined;
    if (listFlags.has(key)) {
      if (!next || String(next).startsWith('--')) throw new Error(`Missing value for --${key}`);
      const current = Array.isArray(opts[key]) ? /** @type {string[]} */ (opts[key]) : [];
      current.push(String(next));
      opts[key] = current;
      index += 1;
      continue;
    }
    if (!next || String(next).startsWith('--')) {
      opts[key] = true;
      continue;
    }
    opts[key] = String(next);
    index += 1;
  }
  return { cmd, opts };
}

module.exports = {
  parseCliArgs,
};
