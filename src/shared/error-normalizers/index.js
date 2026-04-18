/**
 * @typedef {{
 *   tool?: string | undefined,
 *   category?: string | undefined,
 *   file?: string | null | undefined,
 *   line?: number | null | undefined,
 *   col?: number | null | undefined,
 *   code?: string | undefined,
 *   rule?: string | undefined,
 *   symbol?: string | undefined,
 *   message?: string | undefined
 * }} FailureItem
 * @typedef {{ runtime?: string, language?: string, text?: string, tool?: string }} NormalizeFailuresInput
 */

/** @param {FailureItem[] | null | undefined} items @param {number} [max] @returns {FailureItem[]} */
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

/** @param {string | null | undefined} file */
function normalizePath(file) {
  if (!file) return null;
  return String(file).replace(/\\/g, '/');
}

/** @param {string | null | undefined} text @param {string | undefined} tool @returns {FailureItem[]} */
function normalizeGeneric(text, tool) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((line) => ({ tool, category: 'generic_failure', file: null, line: null, col: null, message: line }));
}

/** @param {string | null | undefined} text @param {string | undefined} tool @returns {FailureItem[]} */
function normalizeNode(text, tool) {
  /** @type {FailureItem[]} */
  const out = [];
  const source = String(text || '');
  /** @type {RegExpExecArray | null} */
  let match;
  for (const re of [
    /^(.*)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm,
    /^(.*):(\d+):(\d+)\s+-\s+error\s+(TS\d+):\s+(.+)$/gm,
  ]) {
    while ((match = re.exec(source)) !== null) {
      out.push({
        tool,
        category: 'type_error',
        file: normalizePath(match[1] || ''),
        line: Number(match[2] || 0),
        col: Number(match[3] || 0),
        code: match[4] || '',
        message: String(match[5] || '').trim(),
      });
    }
  }
  const eslintRe = /^(.*):(\d+):(\d+):\s+(error|warning)\s+(.+?)(?:\s{2,}|\s+$)([A-Za-z0-9-_/]+)?$/gm;
  while ((match = eslintRe.exec(source)) !== null) {
    out.push({
      tool,
      category: match[4] === 'error' ? 'lint_error' : 'lint_warning',
      file: normalizePath(match[1] || ''),
      line: Number(match[2] || 0),
      col: Number(match[3] || 0),
      rule: match[6] || '',
      message: String(match[5] || '').trim(),
    });
  }
  const failRe = /^(FAIL|✕)\s+(.+)$/gm;
  while ((match = failRe.exec(source)) !== null) {
    out.push({ tool, category: 'test_failure', file: normalizePath(String(match[2] || '').trim()), line: null, col: null, message: 'Test suite failed' });
  }
  return uniqueFailures(out.length ? out : normalizeGeneric(source, tool));
}

/** @param {string | null | undefined} text @param {string | undefined} tool @returns {FailureItem[]} */
function normalizePython(text, tool) {
  /** @type {FailureItem[]} */
  const out = [];
  const source = String(text || '');
  /** @type {RegExpExecArray | null} */
  let match;
  const pyRe = /^(.+\.py):(\d+):(\d+):\s*([A-Za-z]\d+)?\s*(.+)$/gm;
  while ((match = pyRe.exec(source)) !== null) {
    out.push({
      tool,
      category: tool === 'lint' ? 'lint_error' : tool === 'typecheck' ? 'type_error' : 'runtime_error',
      file: normalizePath(match[1] || ''),
      line: Number(match[2] || 0),
      col: Number(match[3] || 0),
      code: match[4] || '',
      message: String(match[5] || '').trim(),
    });
  }
  const pytestRe = /^(?:FAILED|ERROR)\s+(.+?\.py)(?:::(.+?))?\s+-\s+(.+)$/gm;
  while ((match = pytestRe.exec(source)) !== null) {
    out.push({
      tool,
      category: 'test_failure',
      file: normalizePath(match[1] || ''),
      line: null,
      col: null,
      symbol: match[2] || '',
      message: String(match[3] || '').trim(),
    });
  }
  const tracebackRe = /File "(.+\.py)", line (\d+)(?:, in ([^\n]+))?/gm;
  while ((match = tracebackRe.exec(source)) !== null) {
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
  return uniqueFailures(out.length ? out : normalizeGeneric(source, tool));
}

/** @param {string | null | undefined} text @param {string | undefined} tool @returns {FailureItem[]} */
function normalizeGo(text, tool) {
  /** @type {FailureItem[]} */
  const out = [];
  const source = String(text || '');
  /** @type {RegExpExecArray | null} */
  let match;
  const goRe = /^(.+\.go):(\d+):(\d+):\s+(.+)$/gm;
  while ((match = goRe.exec(source)) !== null) {
    out.push({
      tool,
      category: tool === 'test' ? 'test_failure' : tool === 'lint' ? 'lint_error' : 'compile_error',
      file: normalizePath(match[1] || ''),
      line: Number(match[2] || 0),
      col: Number(match[3] || 0),
      message: String(match[4] || '').trim(),
    });
  }
  const pkgFailRe = /^--- FAIL: (.+?) /gm;
  while ((match = pkgFailRe.exec(source)) !== null) {
    out.push({ tool, category: 'test_failure', file: null, line: null, col: null, symbol: match[1] || '', message: 'Go test failed' });
  }
  return uniqueFailures(out.length ? out : normalizeGeneric(source, tool));
}

/** @param {string | null | undefined} text @param {string | undefined} tool @returns {FailureItem[]} */
function normalizeJava(text, tool) {
  /** @type {FailureItem[]} */
  const out = [];
  const source = String(text || '');
  /** @type {RegExpExecArray | null} */
  let match;
  const javacRe = /^\[?(?:ERROR|error)\]?\s*(.+\.java):\[(\d+),(\d+)\]\s+(.+)$/gm;
  while ((match = javacRe.exec(source)) !== null) {
    out.push({
      tool,
      category: tool === 'test' ? 'test_failure' : 'compile_error',
      file: normalizePath(match[1] || ''),
      line: Number(match[2] || 0),
      col: Number(match[3] || 0),
      message: String(match[4] || '').trim(),
    });
  }
  const gradleRe = /^(.+\.java):(\d+):\s+error:\s+(.+)$/gm;
  while ((match = gradleRe.exec(source)) !== null) {
    out.push({
      tool,
      category: 'compile_error',
      file: normalizePath(match[1] || ''),
      line: Number(match[2] || 0),
      col: null,
      message: String(match[3] || '').trim(),
    });
  }
  const surefireRe = /^\[ERROR\]\s+(.+?)\s+Time elapsed:.*<<< FAILURE!\s*$/gm;
  while ((match = surefireRe.exec(source)) !== null) {
    out.push({ tool, category: 'test_failure', file: null, line: null, col: null, symbol: match[1] || '', message: 'JUnit/Surefire test failed' });
  }
  return uniqueFailures(out.length ? out : normalizeGeneric(source, tool));
}

/** @param {NormalizeFailuresInput} param0 @returns {FailureItem[]} */
function normalizeFailures({ runtime, language, text, tool }) {
  const source = String(text || '').trim();
  if (!source) return [];
  const normalizedLanguage = String(language || '').toLowerCase();
  const rt = String(runtime || language || 'unknown').toLowerCase();
  if (rt === 'node' || normalizedLanguage === 'typescript' || normalizedLanguage === 'javascript') return normalizeNode(source, tool);
  if (rt === 'python' || normalizedLanguage === 'python') return normalizePython(source, tool);
  if (rt === 'go' || normalizedLanguage === 'go') return normalizeGo(source, tool);
  if (rt === 'java' || normalizedLanguage === 'java') return normalizeJava(source, tool);
  return uniqueFailures(normalizeGeneric(source, tool));
}

module.exports = {
  normalizeFailures,
  uniqueFailures,
  normalizeGeneric,
};
