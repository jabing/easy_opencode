const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const execPolicy = require('../policy/execution-policy.js');
const { appendKernelEvent } = require('./event-log.js');
const { nowIso } = require('../../shared/time.js');
const { ensureDir } = require('../../shared/fs.js');
const { normalizeKernelEvent, assertExecutionResult } = require('../../shared/contracts.js');

/**
 * @typedef {{
 *   rootDir?: string,
 *   runDir?: string,
 *   runId?: string|null,
 *   stepId?: string|null,
 *   executableField?: string,
 *   timeoutSec?: number,
 *   policy?: unknown,
 *   command?: string,
 *   workdir?: string,
 *   logFile?: string|null,
 *   contextFile?: string|null,
 *   mode?: 'sync'|'async'|string,
 *   metadata?: Record<string, unknown>|null,
 * }} ExecutionOptions
 *
 * @typedef {{ file: string, args: string[] }} ParsedCommand
 *
 * @typedef {{
 *   rootDir: string,
 *   runId: string|null,
 *   stepId: string|null,
 *   executableField: string,
 *   policy: unknown,
 *   command: string,
 *   parsed: ParsedCommand,
 *   workdir: string,
 *   timeoutSec: number,
 *   logFile: string|null,
 *   contextFile: string|null,
 *   mode: 'sync'|'async',
 *   metadata: Record<string, unknown>,
 * }} NormalizedExecutionOptions
 *
 * @typedef {{ run_id?: string|null, step_id?: string|null, field: string, command: string, workdir: string, timeout_sec: number, log_file?: string|null, context_file?: string|null, status: string, exit_code: number, timed_out: boolean, stdout: string, stderr: string, duration_ms: number, started_at: string, ended_at: string }} ExecutionResultRecord
 *
 * @typedef {{
 *   status: string,
 *   exit_code: number,
 *   timed_out?: boolean,
 *   stdout?: string,
 *   stderr?: string,
 *   duration_ms: number,
 *   started_at: string,
 *   ended_at: string,
 * }} ExecutionPartial
 */

/** @param {ExecutionOptions} [options] */
function normalizeExecutionOptions(options = {}) {
  const rootDir = path.resolve(String(options.rootDir || process.cwd()));
  const runId = options.runId ? String(options.runId) : null;
  const stepId = options.stepId ? String(options.stepId) : null;
  const executableField = String(options.executableField || 'command');
  const timeoutSecRaw = options.timeoutSec === undefined ? 600 : options.timeoutSec;
  const policyInput = typeof options.runDir === 'string' ? { rootDir, runDir: options.runDir } : { rootDir };
  const policy = options.policy || execPolicy.loadCommandPolicy(policyInput);
  const command = execPolicy.validateRunnableCommand(options.command, executableField, stepId || runId || 'executor', policy);
  const parsed = /** @type {ParsedCommand} */ (execPolicy.splitCommand(command));
  const workdir = execPolicy.normalizeWorkdir(options.workdir || rootDir, rootDir, stepId || runId || 'executor');
  const timeoutSec = execPolicy.normalizeTimeout(timeoutSecRaw, policy, stepId || runId || 'executor');
  return /** @type {NormalizedExecutionOptions} */ ({
    rootDir,
    runId,
    stepId,
    executableField,
    policy,
    command,
    parsed,
    workdir,
    timeoutSec,
    logFile: options.logFile ? path.resolve(String(options.logFile)) : null,
    contextFile: options.contextFile ? path.resolve(String(options.contextFile)) : null,
    mode: options.mode === 'sync' ? 'sync' : 'async',
    metadata: options.metadata && typeof options.metadata === 'object' ? options.metadata : {},
  });
}

/** @param {string|null} contextFile @param {Record<string, unknown>} payload */
function writeContextFile(contextFile, payload) {
  if (!contextFile) return;
  ensureDir(path.dirname(contextFile));
  fs.writeFileSync(contextFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

/** @param {string|null} logFile @param {unknown} text */
function appendLog(logFile, text) {
  if (!logFile) return;
  ensureDir(path.dirname(logFile));
  fs.appendFileSync(logFile, String(text), 'utf8');
}

/** @param {NormalizedExecutionOptions} normalized */
function createExecutionStartedEvent(normalized) {
  return normalizeKernelEvent({
    event_type: 'kernel.executor.started',
    run_id: normalized.runId,
    step_id: normalized.stepId,
    field: normalized.executableField,
    mode: normalized.mode,
    command: normalized.command,
    workdir: normalized.workdir,
    timeout_sec: normalized.timeoutSec,
  }, { channel: 'kernel', source: 'kernel' });
}

/** @param {NormalizedExecutionOptions} normalized @param {{ status: string, exit_code: number, timed_out: boolean, duration_ms: number }} result */
function createExecutionFinishedEvent(normalized, result) {
  return normalizeKernelEvent({
    event_type: 'kernel.executor.finished',
    run_id: normalized.runId,
    step_id: normalized.stepId,
    field: normalized.executableField,
    mode: normalized.mode,
    command: normalized.command,
    workdir: normalized.workdir,
    timeout_sec: normalized.timeoutSec,
    status: result.status,
    exit_code: result.exit_code,
    timed_out: result.timed_out,
    duration_ms: result.duration_ms,
  }, { channel: 'kernel', source: 'kernel' });
}

/** @param {NormalizedExecutionOptions} normalized */
function buildContextPayload(normalized) {
  return {
    run_id: normalized.runId,
    step_id: normalized.stepId,
    field: normalized.executableField,
    command: normalized.command,
    parsed: {
      file: normalized.parsed.file,
      args: normalized.parsed.args,
    },
    workdir: normalized.workdir,
    timeout_sec: normalized.timeoutSec,
    mode: normalized.mode,
    metadata: normalized.metadata,
    started_at: nowIso(),
  };
}

/** @param {NormalizedExecutionOptions} normalized @param {ExecutionPartial} partial */
function buildResult(normalized, partial) {
  const result = {
    run_id: normalized.runId,
    step_id: normalized.stepId,
    field: normalized.executableField,
    command: normalized.command,
    workdir: normalized.workdir,
    timeout_sec: normalized.timeoutSec,
    log_file: normalized.logFile,
    context_file: normalized.contextFile,
    status: partial.status,
    exit_code: partial.exit_code,
    timed_out: Boolean(partial.timed_out),
    stdout: partial.stdout || '',
    stderr: partial.stderr || '',
    duration_ms: partial.duration_ms,
    started_at: partial.started_at,
    ended_at: partial.ended_at,
  };
  return /** @type {ExecutionResultRecord} */ (assertExecutionResult(result));
}


/** @param {ExecutionOptions} [options] */
function executeCommandSync(options = {}) {
  const normalized = normalizeExecutionOptions({ ...options, mode: 'sync' });
  const startedAt = nowIso();
  const startedMs = Date.now();
  writeContextFile(normalized.contextFile, buildContextPayload(normalized));
  if (normalized.logFile) {
    ensureDir(path.dirname(normalized.logFile));
    fs.writeFileSync(normalized.logFile, '', 'utf8');
  }
  appendKernelEvent(normalized.rootDir, createExecutionStartedEvent(normalized));
  appendLog(normalized.logFile, `[start] ${normalized.command}\n`);

  let result;
  try {
    const spawned = spawnSync(normalized.parsed.file, normalized.parsed.args, {
      cwd: normalized.workdir,
      shell: false,
      windowsHide: true,
      encoding: 'utf8',
      timeout: normalized.timeoutSec * 1000,
    });
    const stdout = String(spawned.stdout || '');
    const stderr = String(spawned.stderr || '');
    appendLog(normalized.logFile, stdout);
    appendLog(normalized.logFile, stderr);
    result = buildResult(normalized, {
      status: spawned.error || spawned.signal === 'SIGTERM' || spawned.status !== 0 ? 'failed' : 'succeeded',
      exit_code: typeof spawned.status === 'number' ? spawned.status : 1,
      timed_out: Boolean(spawned.error && String(spawned.error.message || '').toLowerCase().includes('timeout')),
      stdout,
      stderr: spawned.error ? `${stderr}${stderr && !stderr.endsWith('\n') ? '\n' : ''}${String(spawned.error.message || spawned.error)}` : stderr,
      duration_ms: Date.now() - startedMs,
      started_at: startedAt,
      ended_at: nowIso(),
    });
  } catch (err) {
    const error = /** @type {{ message?: unknown }} */ (err);
    appendLog(normalized.logFile, `${String(error.message || err)}\n`);
    result = buildResult(normalized, {
      status: 'failed',
      exit_code: 1,
      timed_out: false,
      stdout: '',
      stderr: String(error.message || err),
      duration_ms: Date.now() - startedMs,
      started_at: startedAt,
      ended_at: nowIso(),
    });
  }
  appendKernelEvent(normalized.rootDir, createExecutionFinishedEvent(normalized, result));
  return result;
}

/** @param {ExecutionOptions} [options] */
function executeCommand(options = {}) {
  const normalized = normalizeExecutionOptions({ ...options, mode: 'async' });
  const startedAt = nowIso();
  const startedMs = Date.now();
  writeContextFile(normalized.contextFile, buildContextPayload(normalized));
  if (normalized.logFile) {
    ensureDir(path.dirname(normalized.logFile));
    fs.writeFileSync(normalized.logFile, '', 'utf8');
  }
  appendKernelEvent(normalized.rootDir, createExecutionStartedEvent(normalized));
  appendLog(normalized.logFile, `[start] ${normalized.command}\n`);

  return new Promise((resolve) => {
    try {
      const child = spawn(normalized.parsed.file, normalized.parsed.args, {
        cwd: normalized.workdir,
        shell: false,
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let resolved = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, normalized.timeoutSec * 1000);

      child.stdout.on('data', /** @param {unknown} chunk */ (chunk) => {
        const text = String(chunk);
        stdout += text;
        appendLog(normalized.logFile, text);
      });
      child.stderr.on('data', /** @param {unknown} chunk */ (chunk) => {
        const text = String(chunk);
        stderr += text;
        appendLog(normalized.logFile, text);
      });
      child.on('error', /** @param {{ message?: unknown } | unknown} err */ (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        const error = /** @type {{ message?: unknown }} */ (err);
        const result = buildResult(normalized, {
          status: 'failed',
          exit_code: 1,
          timed_out: false,
          stdout,
          stderr: `${stderr}${stderr && !stderr.endsWith('\n') ? '\n' : ''}${String(error.message || err)}`,
          duration_ms: Date.now() - startedMs,
          started_at: startedAt,
          ended_at: nowIso(),
        });
        appendLog(normalized.logFile, `${String(error.message || err)}\n`);
        appendKernelEvent(normalized.rootDir, createExecutionFinishedEvent(normalized, result));
        resolve(result);
      });
      child.on('close', /** @param {number | null} code */ (code) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        const exitCode = typeof code === 'number' ? code : 1;
        const result = buildResult(normalized, {
          status: !timedOut && exitCode === 0 ? 'succeeded' : 'failed',
          exit_code: exitCode,
          timed_out: timedOut,
          stdout,
          stderr,
          duration_ms: Date.now() - startedMs,
          started_at: startedAt,
          ended_at: nowIso(),
        });
        appendKernelEvent(normalized.rootDir, createExecutionFinishedEvent(normalized, result));
        resolve(result);
      });
    } catch (err) {
      const error = /** @type {{ message?: unknown }} */ (err);
      appendLog(normalized.logFile, `${String(error.message || err)}\n`);
      const result = buildResult(normalized, {
        status: 'failed',
        exit_code: 1,
        timed_out: false,
        stdout: '',
        stderr: String(error.message || err),
        duration_ms: Date.now() - startedMs,
        started_at: startedAt,
        ended_at: nowIso(),
      });
      appendKernelEvent(normalized.rootDir, createExecutionFinishedEvent(normalized, result));
      resolve(result);
    }
  });
}

module.exports = {
  normalizeExecutionOptions,
  executeCommand,
  executeCommandSync,
};
