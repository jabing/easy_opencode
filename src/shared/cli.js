const MULTI_VALUE_SENTINEL = Symbol('multiValue');

/**
 * @typedef {{
 *   _: string[],
 *   [key: string]: unknown,
 * }} ParsedCliArgs
 * @typedef {{
 *   startIndex?: number,
 *   multiValueKeys?: string[],
 *   initial?: Record<string, unknown>,
 * }} ParseArgsOptions
 */

/** @param {string[] | readonly string[] | null | undefined} argv @param {ParseArgsOptions} [options] @returns {ParsedCliArgs} */
function parseArgs(argv, options = {}) {
  const startIndex = Number.isInteger(options.startIndex) ? /** @type {number} */ (options.startIndex) : 2;
  const multiValueKeys = new Set(Array.isArray(options.multiValueKeys) ? options.multiValueKeys : []);
  const initial = /** @type {ParsedCliArgs} */ (Object.assign({ _: [] }, options.initial || {}));
  const args = Array.isArray(argv) ? argv : [];

  for (let i = startIndex; i < args.length; i += 1) {
    const token = args[i];
    if (!String(token).startsWith('--')) {
      initial._.push(String(token));
      continue;
    }

    const key = String(token).slice(2);
    const next = args[i + 1];
    const expectsMultiValue = multiValueKeys.has(key);

    if (!next || String(next).startsWith('--')) {
      if (expectsMultiValue) {
        throw new Error(`Missing value for --${key}`);
      }
      initial[key] = true;
      continue;
    }

    if (expectsMultiValue) {
      const existing = initial[key];
      if (!Array.isArray(existing)) initial[key] = [];
      /** @type {unknown[]} */ (initial[key]).push(String(next));
    } else {
      initial[key] = String(next);
    }
    i += 1;
  }

  return initial;
}

/** @param {unknown} value */
function toBool(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

module.exports = {
  parseArgs,
  toBool,
  MULTI_VALUE_SENTINEL,
};
