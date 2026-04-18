/**
 * @typedef {{ cwd?: string, timeoutMs?: number, maxOutputBytes?: number }} RunCommandOptions
 * @typedef {{
 *   code: number,
 *   timedOut: boolean,
 *   output: string,
 *   durationMs: number,
 *   truncated: boolean,
 *   metric: import('../core/observability.js').CommandMetric,
 * }} RunCommandResult
 */

module.exports = {};
