/**
 * @typedef {{ code?: string, cause?: unknown, details?: Record<string, unknown> }} AppErrorOptions
 */
class AppError extends Error {
  /**
   * @param {string} message
   * @param {AppErrorOptions} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'APP_ERROR';
    this.cause = options.cause;
    this.details = options.details || {};
  }
}

class ValidationError extends AppError {
  /** @param {string} message @param {AppErrorOptions} [options] */
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code || 'VALIDATION_ERROR' });
  }
}

class ExternalCommandError extends AppError {
  /** @param {string} message @param {AppErrorOptions} [options] */
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code || 'EXTERNAL_COMMAND_ERROR' });
  }
}

class RuleExecutionError extends AppError {
  /** @param {string} message @param {AppErrorOptions} [options] */
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code || 'RULE_EXECUTION_ERROR' });
  }
}

/** @param {unknown} error @returns {{ name: string, message: string, code: string, details: Record<string, unknown> }} */
function normalizeError(error) {
  if (error instanceof AppError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      details: error.details,
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message,
      code: 'UNCLASSIFIED_ERROR',
      details: {},
    };
  }
  return {
    name: 'UnknownError',
    message: String(error),
    code: 'UNCLASSIFIED_ERROR',
    details: {},
  };
}

module.exports = {
  AppError,
  ValidationError,
  ExternalCommandError,
  RuleExecutionError,
  normalizeError,
};
