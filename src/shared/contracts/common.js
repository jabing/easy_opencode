/** Lightweight runtime contract helpers. */

/** @param {unknown} value */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @param {string} name */

function assertString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
}

/** @param {unknown} value @param {string} name */

function assertNumber(value, name) {
  if (typeof value !== 'number' || Number.isNaN(value)) throw new Error(`${name} must be a number`);
}

/** @param {unknown} value @param {string} name */

function assertBoolean(value, name) {
  if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean`);
}

/** @param {unknown} value @param {string} name */

function assertStringArray(value, name) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${name} must be a string[]`);
  }
}

/** @param {unknown} value @param {string} name */

function assertArray(value, name) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
}

/** @param {unknown} value @param {string} name */

function assertRecord(value, name) {
  if (!isRecord(value)) throw new Error(`${name} must be an object`);
}

/** @param {unknown} value @param {string} name */

function assertCounts(value, name) {
  assertRecord(value, name);
  const record = /** @type {Record<string, unknown>} */ (value);
  assertNumber(record.pass, `${name}.pass`);
  assertNumber(record.fail, `${name}.fail`);
  assertNumber(record.warn, `${name}.warn`);
  assertNumber(record.skip, `${name}.skip`);
}

/** @param {unknown} items @param {string} name */

function assertCheckEntries(items, name) {
  assertArray(items, name);
  const entries = /** @type {unknown[]} */ (items);
  for (const [index, item] of entries.entries()) {
    assertRecord(item, `${name}[${index}]`);
    const record = /** @type {Record<string, unknown>} */ (item);
    assertString(record.status, `${name}[${index}].status`);
    assertString(record.check, `${name}[${index}].check`);
    assertString(record.detail, `${name}[${index}].detail`);
  }
}

/** @param {unknown} value @param {string} name */

function assertIsoDateString(value, name) {
  assertString(value, name);
  const text = /** @type {string} */ (value);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${name} must be an ISO date string`);
}

/** @param {unknown} value */

module.exports = {
  isRecord,
  assertString,
  assertNumber,
  assertBoolean,
  assertStringArray,
  assertArray,
  assertRecord,
  assertCounts,
  assertCheckEntries,
  assertIsoDateString
};
