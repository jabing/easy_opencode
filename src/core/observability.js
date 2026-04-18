/**
 * @typedef {{ command: string, argsCount: number, durationMs: number, exitCode: number, timedOut: boolean, truncated: boolean }} CommandMetric
 */

/** @param {number} [startedAt] */
function createTimer(startedAt = Date.now()) {
  return {
    stop() {
      return Math.max(0, Date.now() - startedAt);
    },
  };
}

/**
 * @param {{ command: string, args: string[], durationMs: number, code: number, timedOut: boolean, truncated: boolean }} input
 * @returns {CommandMetric}
 */
function createCommandMetric(input) {
  return {
    command: input.command,
    argsCount: input.args.length,
    durationMs: input.durationMs,
    exitCode: input.code,
    timedOut: input.timedOut,
    truncated: input.truncated,
  };
}

module.exports = {
  createTimer,
  createCommandMetric,
};
