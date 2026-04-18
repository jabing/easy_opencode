const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ensureDirForFile } = require('../../../shared/fs.js');
const { nowIso } = require('../../../shared/time.js');
const { normalizeKernelEvent } = require('../../../shared/contracts.js');

/** @typedef {{ event_id?: string | null, at?: string | null, ts?: string | null, channel?: string | null, source?: string | null, type?: string | null, event_type?: string | null } & Record<string, unknown>} EventRecord */
/** @typedef {{ event_id?: string | null, at?: string | null, channel?: string | null, source?: string | null, type?: string | null }} EventDefaults */
/** @typedef {{ limit?: number, type?: string, since?: string, reverse?: boolean, channel?: string }} ReadUnifiedEventOptions */

/** @param {string} rootDir */
function resolveUnifiedEventLogPath(rootDir) {
  return path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'kernel', 'events.ndjson');
}

/** @param {EventRecord} [event] @param {EventDefaults} [defaults] @returns {EventRecord} */
function normalizeEvent(event = {}, defaults = {}) {
  const eventId = event.event_id || defaults.event_id || `evt-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const normalized = /** @type {EventRecord} */ (normalizeKernelEvent(event, {
    ...defaults,
    at: event.at || event.ts || defaults.at || nowIso(),
    channel: event.channel || defaults.channel || 'kernel',
    source: event.source || defaults.source || defaults.channel || 'kernel',
    type: event.type || event.event_type || defaults.type || 'event.unknown',
  }));
  normalized.event_id = eventId;
  return normalized;
}

/** @param {string} rootDir @param {EventRecord} [event] @param {EventDefaults} [defaults] */
function appendUnifiedEvent(rootDir, event = {}, defaults = {}) {
  const payload = normalizeEvent(event, defaults);
  const filePath = resolveUnifiedEventLogPath(rootDir);
  ensureDirForFile(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
  return payload;
}

/** @param {string} rootDir @param {ReadUnifiedEventOptions} [options] @returns {EventRecord[]} */
function readUnifiedEvents(rootDir, options = {}) {
  const { limit = 200, type, since, reverse = true, channel } = options;
  const filePath = resolveUnifiedEventLogPath(rootDir);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  /** @type {EventRecord[]} */
  let events = lines
    .map(/** @param {string} line */ (line) => {
      try {
        return normalizeEvent(/** @type {EventRecord} */ (JSON.parse(line)));
      } catch {
        return null;
      }
    })
    .filter(/** @returns {event is EventRecord} */ (event) => Boolean(event));
  if (channel) events = events.filter((event) => event.channel === channel);
  if (type) events = events.filter((event) => event.type === type || event.event_type === type);
  if (since) {
    const sinceTime = new Date(since).getTime();
    if (!Number.isNaN(sinceTime)) events = events.filter((event) => new Date(String(event.at || '')).getTime() >= sinceTime);
  }
  events.sort((a, b) => {
    const left = new Date(String(a.at || '')).getTime();
    const right = new Date(String(b.at || '')).getTime();
    return reverse ? right - left : left - right;
  });
  return events.slice(0, Math.max(1, Number(limit) || 200));
}

module.exports = {
  appendUnifiedEvent,
  normalizeEvent,
  readUnifiedEvents,
  resolveUnifiedEventLogPath,
};
