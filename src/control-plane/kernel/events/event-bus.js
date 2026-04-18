const { appendUnifiedEvent } = require('./event-store.js');

/** @param {string} rootDir @param {Record<string, unknown>} [event] */
function emitKernelEvent(rootDir, event = {}) {
  return appendUnifiedEvent(rootDir, event, { channel: 'kernel', source: 'kernel' });
}

/** @param {string} rootDir @param {string} type @param {Record<string, unknown>} [payload] */
function emitObservabilityEvent(rootDir, type, payload = {}) {
  return appendUnifiedEvent(rootDir, { type, ...payload }, { channel: 'observability', source: 'observability' });
}

module.exports = {
  emitKernelEvent,
  emitObservabilityEvent,
};
