/**
 * @typedef {'pass'|'fail'|'warn'|'skip'} CheckStatus
 * @typedef {{ pass: number, fail: number, warn: number, skip: number }} CheckCounts
 * @typedef {{ status: CheckStatus|string, check: string, detail: string }} CheckEntry
 * @typedef {{ gate: 'PASS'|'FAIL', strict?: boolean, full?: boolean, counts: CheckCounts, results: CheckEntry[], evidence_bundle?: Record<string, unknown> }} QualityGatePayload
 * @typedef {{ event_id?: string, at?: string, ts?: string, type?: string, event_type?: string, channel?: string, source?: string, run_id?: string|null, step_id?: string|null, status?: string, [key: string]: unknown }} KernelEventRecord
 * @typedef {{ run_id?: string|null, step_id?: string|null, field: string, command: string, workdir: string, timeout_sec: number, log_file?: string|null, context_file?: string|null, status: 'succeeded'|'failed'|string, exit_code: number, timed_out: boolean, stdout: string, stderr: string, duration_ms: number, started_at: string, ended_at: string }} ExecutionResult
 */
const { isRecord, assertString, assertNumber, assertBoolean } = require('./common.js');

/** @param {unknown} value */
function assertCheckCounts(value) {
  if (!isRecord(value)) throw new Error('counts must be an object');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertNumber(record.pass, 'counts.pass');
  assertNumber(record.fail, 'counts.fail');
  assertNumber(record.warn, 'counts.warn');
  assertNumber(record.skip, 'counts.skip');
  return value;
}

/** @param {unknown} value */
function assertCheckEntries(value) {
  if (!Array.isArray(value)) throw new Error('results must be an array');
  for (const [i, item] of value.entries()) {
    if (!isRecord(item)) throw new Error(`results[${i}] must be an object`);
    assertString(item.status, `results[${i}].status`);
    assertString(item.check, `results[${i}].check`);
    assertString(item.detail, `results[${i}].detail`);
  }
  return value;
}

/** @param {Array<{ status?: string }>} results */
function buildCheckCounts(results) {
  return results.reduce((acc, result) => {
    const key = result && typeof result.status === 'string' ? result.status : 'skip';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({ pass: 0, fail: 0, warn: 0, skip: 0 }));
}

/** @param {unknown} value */
function assertQualityGatePayload(value) {
  if (!isRecord(value)) throw new Error('quality gate payload must be an object');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.gate, 'quality-gate.gate');
  assertCheckCounts(record.counts);
  assertCheckEntries(record.results);
  return value;
}

/** @param {unknown} value */
function assertExecutionResult(value) {
  if (!isRecord(value)) throw new Error('execution result must be an object');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.field, 'execution.field');
  assertString(record.command, 'execution.command');
  assertString(record.workdir, 'execution.workdir');
  assertNumber(record.timeout_sec, 'execution.timeout_sec');
  assertString(record.status, 'execution.status');
  assertNumber(record.exit_code, 'execution.exit_code');
  assertBoolean(record.timed_out, 'execution.timed_out');
  if (typeof record.stdout !== 'string') throw new Error('execution.stdout must be a string');
  if (typeof record.stderr !== 'string') throw new Error('execution.stderr must be a string');
  assertNumber(record.duration_ms, 'execution.duration_ms');
  assertString(record.started_at, 'execution.started_at');
  assertString(record.ended_at, 'execution.ended_at');
  return value;
}

/** @param {Record<string, any>} [event] @param {Record<string, any>} [defaults] */
function normalizeKernelEvent(event = {}, defaults = {}) {
  const at = event.at || event.ts || defaults.at || new Date().toISOString();
  const type = event.type || event.event_type || defaults.type || defaults.event_type || 'event.unknown';
  const channel = event.channel || defaults.channel || 'kernel';
  const source = event.source || defaults.source || channel;
  return { ...defaults, ...event, at, ts: at, type, event_type: type, channel, source };
}

/** @param {unknown} value */
function assertKernelEvent(value) {
  if (!isRecord(value)) throw new Error('kernel event must be an object');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(String(record.type || record.event_type || ''), 'event.type');
  assertString(String(record.channel || ''), 'event.channel');
  assertString(String(record.source || ''), 'event.source');
  assertString(String(record.at || record.ts || ''), 'event.at');
  return value;
}

module.exports = {
  assertCheckCounts,
  assertCheckEntries,
  buildCheckCounts,
  assertQualityGatePayload,
  assertExecutionResult,
  normalizeKernelEvent,
  assertKernelEvent,
};
