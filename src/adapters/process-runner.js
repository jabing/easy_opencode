const { spawn } = require('child_process');
const { ExternalCommandError, normalizeError } = require('../core/errors.js');
const { createCommandMetric, createTimer } = require('../core/observability.js');

/**
 * @typedef {import('../types/process-runner.js').RunCommandOptions} RunCommandOptions
 * @typedef {import('../types/process-runner.js').RunCommandResult} RunCommandResult
 */

/** @param {unknown} value @param {number} fallback */
function toPositiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? Math.floor(normalized) : fallback;
}

/** @param {string} target @param {unknown} data @param {{ maxBytes: number, bytesUsed: number, truncated: boolean }} state */
function appendChunk(target, data, state) {
  if (state.truncated) return target;
  const chunk = Buffer.isBuffer(data) ? /** @type {{ toString(encoding?: string): string }} */ (data).toString('utf8') : String(data);
  const chunkBytes = Buffer.byteLength(chunk, 'utf8');
  const nextBytes = state.bytesUsed + chunkBytes;
  if (nextBytes <= state.maxBytes) {
    state.bytesUsed = nextBytes;
    return target + chunk;
  }

  const remainingBytes = Math.max(0, state.maxBytes - state.bytesUsed);
  if (remainingBytes === 0) {
    state.truncated = true;
    return target;
  }

  let sliceEnd = 0;
  let sliceBytes = 0;
  while (sliceEnd < chunk.length) {
    const codePoint = chunk.codePointAt(sliceEnd);
    const charLength = codePoint !== undefined && codePoint > 0xFFFF ? 2 : 1;
    const segment = chunk.slice(sliceEnd, sliceEnd + charLength);
    const segmentBytes = Buffer.byteLength(segment, 'utf8');
    if (sliceBytes + segmentBytes > remainingBytes) break;
    sliceBytes += segmentBytes;
    sliceEnd += charLength;
  }

  state.bytesUsed += sliceBytes;
  state.truncated = true;
  return target + chunk.slice(0, sliceEnd);
}

/** @param {unknown} error @param {string} command @param {string[]} args */
function buildSpawnErrorResult(error, command, args) {
  const normalized = normalizeError(new ExternalCommandError('failed to spawn external command', { cause: error, details: { command, args } }));
  return normalized.message;
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {RunCommandOptions} [options]
 * @returns {Promise<RunCommandResult>}
 */
function runCommand(command, args, options = {}) {
  if (typeof command !== 'string' || !command.trim()) {
    throw new TypeError('runCommand requires a non-empty command string');
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new TypeError('runCommand requires string[] args');
  }

  const cwd = typeof options.cwd === 'string' && options.cwd.trim() ? options.cwd : process.cwd();
  const timeoutMs = toPositiveInteger(options.timeoutMs, 180000);
  const maxOutputBytes = toPositiveInteger(options.maxOutputBytes, 20000);
  const timer = createTimer();

  return new Promise((resolve) => {
    /** @type {ReturnType<typeof setTimeout> | null} */
    let killTimer = null;
    let finished = false;
    let timedOut = false;
    let out = '';
    let err = '';
    const outState = { maxBytes: maxOutputBytes, bytesUsed: 0, truncated: false };
    const errState = { maxBytes: maxOutputBytes, bytesUsed: 0, truncated: false };

    /** @param {number} code @param {boolean} didTimeOut @param {string} output */
    function finalize(code, didTimeOut, output) {
      if (finished) return;
      finished = true;
      if (killTimer) {
        clearTimeout(killTimer);
        killTimer = null;
      }
      const durationMs = timer.stop();
      const truncated = outState.truncated || errState.truncated;
      resolve({
        code,
        timedOut: didTimeOut,
        output,
        durationMs,
        truncated,
        metric: createCommandMetric({ command, args, durationMs, code, timedOut: didTimeOut, truncated }),
      });
    }

    let child;
    try {
      child = spawn(command, args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      finalize(1, false, buildSpawnErrorResult(error, command, args));
      return;
    }

    killTimer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on('data', /** @param {unknown} data */ (data) => {
      out = appendChunk(out, data, outState);
    });
    child.stderr.on('data', /** @param {unknown} data */ (data) => {
      err = appendChunk(err, data, errState);
    });
    child.on('error', /** @param {unknown} error */ (error) => {
      finalize(1, false, buildSpawnErrorResult(error, command, args));
    });
    child.on('close', /** @param {number | null} code @param {string | null} signal */ (code, signal) => {
      const output = `${out}${err}`.trim();
      const finalCode = typeof code === 'number' ? code : 1;
      const didTimeOut = timedOut || signal === 'SIGTERM';
      const truncated = outState.truncated || errState.truncated;
      finalize(finalCode, didTimeOut, truncated ? `${output}\n[output truncated]`.trim() : output);
    });
  });
}

module.exports = { runCommand };
