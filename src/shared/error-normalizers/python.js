/** @typedef {import('./index.js').FailureItem} FailureItem */

/** @param {string | null | undefined} file */
function normalizePath(file) {
  if (!file) return null;
  return String(file).replace(/\\/g, '/');
}

/** @param {FailureItem[] | null | undefined} items @param {number} [max] */
function uniqueFailures(items, max = 40) {
  /** @type {FailureItem[]} */
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = JSON.stringify([
      item.tool || '',
      item.category || '',
      item.file || '',
      item.line || '',
      item.col || '',
      item.code || '',
      item.rule || '',
      item.message || '',
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/** @param {string | null | undefined} text @param {string | undefined} tool */
function normalizePythonFailures(text, tool) {
  /** @type {FailureItem[]} */
  const out = [];
  const source = String(text || '');
  /** @type {RegExpExecArray | null} */
  let match;

  const locationRe = /^(.+\.py):(\d+):(?:(\d+):)?\s*([A-Za-z]\d+)?\s*(.+)$/gm;
  while ((match = locationRe.exec(source)) !== null) {
    out.push({
      tool,
      category: tool === 'lint' ? 'lint_error' : tool === 'typecheck' ? 'type_error' : 'runtime_error',
      file: normalizePath(match[1] || ''),
      line: Number(match[2] || 0),
      col: match[3] ? Number(match[3]) : null,
      code: match[4] || '',
      message: String(match[5] || '').trim(),
    });
  }

  const pytestRe = /^(?:FAILED|ERROR)\s+(.+?\.py)(?:::(.+?))?\s+-\s+(.+)$/gm;
  while ((match = pytestRe.exec(source)) !== null) {
    const message = String(match[3] || '').trim();
    out.push({
      tool,
      category: /assert/i.test(message) ? 'test_assertion' : 'test_failure',
      file: normalizePath(match[1] || ''),
      line: null,
      col: null,
      symbol: match[2] || '',
      message,
    });
  }

  const tracebackFrameRe = /File "(.+?\.py)", line (\d+)(?:, in ([^\n]+))?/gm;
  while ((match = tracebackFrameRe.exec(source)) !== null) {
    out.push({
      tool,
      category: 'runtime_error',
      file: normalizePath(match[1] || ''),
      line: Number(match[2] || 0),
      col: null,
      symbol: match[3] || '',
      message: 'Traceback frame',
    });
  }

  const exceptionMatch = source.match(/^(ModuleNotFoundError|ImportError|AssertionError|SyntaxError|NameError|TypeError|ValueError):\s+(.+)$/m);
  if (exceptionMatch) {
    /** @type {Record<string, string>} */
    const categoryMap = {
      ModuleNotFoundError: 'import_resolve',
      ImportError: 'import_resolve',
      AssertionError: 'test_assertion',
      SyntaxError: 'syntax_error',
      NameError: 'runtime_error',
      TypeError: 'runtime_error',
      ValueError: 'runtime_error',
    };
    const exceptionCode = String(exceptionMatch[1] || '');
    out.push({
      tool,
      category: categoryMap[exceptionCode] || 'runtime_error',
      file: null,
      line: null,
      col: null,
      code: exceptionCode,
      message: String(exceptionMatch[2] || '').trim(),
    });
  }

  if (out.length === 0) {
    return String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((line) => ({ tool, category: 'generic_failure', file: null, line: null, col: null, message: line }));
  }
  return uniqueFailures(out);
}

module.exports = {
  normalizePythonFailures,
};
