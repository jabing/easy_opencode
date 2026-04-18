/** @typedef {'build' | 'test' | 'lint' | 'typecheck' | 'format'} VerifySchemaKind */
/** @typedef {{ runtime?: string, lint_tool?: string, typecheck_tool?: string, format_tool?: string }} VerifyProfile */
/** @typedef {{ commands?: string[], source?: string | null }} VerifyInput */
/** @typedef {{ version: string, runtime: string, commands: string[], build: string | null, test: string | null, lint: string | null, typecheck: string | null, format: string | null, source: string | null, required: { build: boolean, test: boolean, lint: boolean, typecheck: boolean } }} VerifySchema */

/** @param {unknown} commands @param {RegExp | string | Array<RegExp | string>} patterns */
function pickCommand(commands, patterns) {
  const list = Array.isArray(commands) ? commands : [];
  const matchers = (Array.isArray(patterns) ? patterns : [patterns]).map((item) => item instanceof RegExp ? item : new RegExp(String(item), 'i'));
  return list.find((command) => matchers.some((pattern) => pattern.test(String(command || '')))) || null;
}

/** @param {string} runtime @param {VerifySchemaKind} kind @param {unknown} value */
function commandForTool(runtime, kind, value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/\s/.test(text) || /\//.test(text)) return text;
  if (runtime === 'python' && kind === 'lint' && text === 'ruff') return 'python -m ruff check .';
  if (runtime === 'python' && kind === 'typecheck' && text === 'mypy') return 'python -m mypy .';
  if (runtime === 'python' && kind === 'typecheck' && text === 'pyright') return 'pyright';
  if (runtime === 'python' && kind === 'format' && text === 'ruff-format') return 'python -m ruff format .';
  if (runtime === 'python' && kind === 'format' && text === 'black') return 'python -m black .';
  if (runtime === 'go' && kind === 'typecheck' && text === 'go-build') return 'go build ./...';
  if (runtime === 'go' && kind === 'format' && text === 'gofmt') return 'gofmt -w .';
  if (runtime === 'go' && kind === 'lint' && text === 'golangci-lint') return 'golangci-lint run';
  return text;
}

/** @param {VerifyProfile} [profile] @param {VerifyInput} [verify] @returns {VerifySchema} */
function buildVerifySchema(profile = {}, verify = {}) {
  const runtime = String(profile.runtime || 'unknown').trim() || 'unknown';
  const commands = Array.isArray(verify.commands) ? verify.commands.slice() : [];
  /** @type {VerifySchema} */
  const schema = {
    version: '1.0',
    runtime,
    commands,
    build: null,
    test: null,
    lint: null,
    typecheck: null,
    format: null,
    source: verify.source || null,
    required: {
      build: false,
      test: false,
      lint: false,
      typecheck: false,
    },
  };

  if (runtime === 'node') {
    schema.build = pickCommand(commands, [/\bbuild\b/, /tsc/, /vite build/, /webpack/, /rollup/]);
    schema.test = pickCommand(commands, [/\btest\b/, /vitest/, /jest/, /mocha/, /node --test/]);
    schema.lint = commandForTool(runtime, 'lint', profile.lint_tool) || null;
    schema.typecheck = commandForTool(runtime, 'typecheck', profile.typecheck_tool) || schema.build;
    schema.format = commandForTool(runtime, 'format', profile.format_tool) || null;
  } else if (runtime === 'python') {
    schema.build = pickCommand(commands, [/compileall/, /python -m build/, /uv build/]) || 'python -m compileall .';
    schema.test = pickCommand(commands, [/pytest/, /unittest/]) || 'python -m pytest -q';
    schema.lint = commandForTool(runtime, 'lint', profile.lint_tool) || 'python -m ruff check .';
    schema.typecheck = commandForTool(runtime, 'typecheck', profile.typecheck_tool) || 'python -m mypy .';
    schema.format = commandForTool(runtime, 'format', profile.format_tool) || 'python -m ruff format .';
  } else if (runtime === 'go') {
    schema.build = pickCommand(commands, [/go build/]) || 'go build ./...';
    schema.test = pickCommand(commands, [/go test/]) || 'go test ./...';
    schema.lint = commandForTool(runtime, 'lint', profile.lint_tool) || 'gofmt -w .';
    schema.typecheck = commandForTool(runtime, 'typecheck', profile.typecheck_tool) || schema.build;
    schema.format = commandForTool(runtime, 'format', profile.format_tool) || 'gofmt -w .';
  }

  schema.required = {
    build: Boolean(schema.build),
    test: Boolean(schema.test),
    lint: Boolean(schema.lint),
    typecheck: Boolean(schema.typecheck),
  };
  return schema;
}

module.exports = {
  buildVerifySchema,
};
