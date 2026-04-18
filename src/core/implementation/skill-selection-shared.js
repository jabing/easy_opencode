/** @param {string[]} values @param {string | null | undefined} value */
function appendUnique(values, value) {
  if (!value) return values;
  if (!values.includes(value)) values.push(value);
  return values;
}

/** @param {string[] | undefined | null} pairs */
function toVarMap(pairs) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const pair of pairs || []) {
    const idx = String(pair).indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1);
    if (key) out[key] = value;
  }
  return out;
}

/** @param {unknown} value */
function normalizeValue(value) {
  return String(value || '').trim().toLowerCase();
}

/** @param {unknown} value */
function isKnownValue(value) {
  const normalized = normalizeValue(value);
  return Boolean(normalized && normalized !== 'unknown');
}

/** @param {string[] | undefined | null} values */
function normalizeList(values) {
  return Array.from(new Set((values || []).map((value) => normalizeValue(value)).filter(Boolean)));
}

const { deriveRuntimeSupport } = require('../skills/runtime-hints.js');

/** @param {{ actions?: Array<{ when?: { runtime?: string|string[] } }>, runtimes?: string[], frameworks?: string[] }} skill */
function supportedRuntimes(skill) {
  return deriveRuntimeSupport(skill).runtimes;
}

/** @param {{ actions?: Array<{ when?: { runtime?: string|string[] } }> }} skill @param {string} runtime */
function actionSupportsRuntime(skill, runtime) {
  const expected = normalizeValue(runtime);
  if (!expected) return false;
  const supported = supportedRuntimes(skill);
  return supported.length === 0 ? false : supported.includes(expected);
}

/** @param {Record<string, any>} opts */
function allowCrossRuntime(opts) {
  return Boolean(opts && (opts['allow-cross-runtime'] || opts.allowCrossRuntime));
}

/**
 * @param {string[]} supported
 * @param {string} actual
 * @returns {{ status: 'match' | 'mismatch' | 'unspecified' | 'unknown', actual: string | null, supported: string[] }}
 */
function compareSupport(supported, actual) {
  const normalizedSupported = normalizeList(supported);
  const normalizedActual = normalizeValue(actual);
  if (!isKnownValue(normalizedActual)) return { status: 'unknown', actual: normalizedActual || null, supported: normalizedSupported };
  if (normalizedSupported.length === 0) return { status: 'unspecified', actual: normalizedActual, supported: normalizedSupported };
  return {
    status: normalizedSupported.includes(normalizedActual) ? 'match' : 'mismatch',
    actual: normalizedActual,
    supported: normalizedSupported,
  };
}

module.exports = {
  actionSupportsRuntime,
  allowCrossRuntime,
  appendUnique,
  compareSupport,
  isKnownValue,
  normalizeList,
  normalizeValue,
  supportedRuntimes,
  toVarMap,
};
