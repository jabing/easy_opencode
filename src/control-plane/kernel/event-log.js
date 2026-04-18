const { emitKernelEvent } = require('./events/event-bus.js');
const { resolveUnifiedEventLogPath } = require('./events/event-store.js');

/** @param {string} rootDir */
function resolveEventLogPath(rootDir) {
  return resolveUnifiedEventLogPath(rootDir);
}

/** @param {string} rootDir @param {Record<string, unknown>} event */
function appendKernelEvent(rootDir, event) {
  return emitKernelEvent(rootDir, event);
}

module.exports = {
  appendKernelEvent,
  resolveEventLogPath,
};
