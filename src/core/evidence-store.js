const crypto = require('crypto');

/**
 * @typedef {*} JsonValue
 * @typedef {{ id?: string, created_at?: string, tags?: string[], meta?: Record<string, JsonValue> }} EvidenceExtra
 * @typedef {{ id: string, type: string, producer: string, created_at: string, content: JsonValue, digest: string, tags: string[], meta: Record<string, JsonValue> }} EvidenceRecord
 */

/** @param {JsonValue} value @returns {string} */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

/** @param {JsonValue} content @returns {string} */
function digestContent(content) {
  return crypto.createHash('sha256').update(stableStringify(content)).digest('hex');
}

/** @param {string} type @param {string} producer @param {JsonValue} content @param {EvidenceExtra} [extra] @returns {EvidenceRecord} */
function createEvidence(type, producer, content, extra = {}) {
  const normalizedType = String(type || '').trim() || 'unknown';
  const normalizedProducer = String(producer || '').trim() || 'unknown';
  return {
    id: extra.id || `${normalizedType}:${digestContent(/** @type {JsonValue} */ ({ producer: normalizedProducer, content })).slice(0, 16)}`,
    type: normalizedType,
    producer: normalizedProducer,
    created_at: extra.created_at || new Date().toISOString(),
    content,
    digest: digestContent(content),
    tags: Array.isArray(extra.tags) ? extra.tags.slice() : [],
    meta: extra.meta && typeof extra.meta === 'object' ? { ...extra.meta } : {},
  };
}

/** @param {EvidenceRecord[] | null | undefined} evidence */
function summarizeEvidence(evidence) {
  const items = Array.isArray(evidence) ? evidence : [];
  /** @type {Record<string, number>} */
  const byType = {};
  /** @type {Record<string, number>} */
  const byProducer = {};
  for (const item of items) {
    byType[item.type] = (byType[item.type] || 0) + 1;
    byProducer[item.producer] = (byProducer[item.producer] || 0) + 1;
  }
  return {
    count: items.length,
    by_type: byType,
    by_producer: byProducer,
    digests: items.map((item) => ({ id: item.id, type: item.type, digest: item.digest })),
  };
}

module.exports = {
  stableStringify,
  digestContent,
  createEvidence,
  summarizeEvidence,
};
