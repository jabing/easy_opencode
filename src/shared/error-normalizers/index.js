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
 * @typedef {{ runtime?: string, language?: string, provider?: string, text?: string, tool?: string }} NormalizeFailuresInput
 */
const { normalizePythonFailures } = require('./python.js');

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

/** @param {string | null | undefined} provider */
function normalizeProviderLanguage(provider) {
  const normalized = String(provider || '').toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('python')) return 'python';
  if (normalized.includes('typescript') || normalized.includes('javascript') || normalized === 'node') return 'node';
  if (normalized.includes('go')) return 'go';
  if (normalized.includes('java')) return 'java';
  return '';
}

/** @param {string} text */
function looksLikeGoFailure(text) {
  return (
    /(?:^|\n).+\.go:\d+:\d+:\s+.+/.test(text) ||
    /(?:^|\n)--- FAIL:\s+/.test(text) ||
    /\bundefined:\s+[A-Za-z_][A-Za-z0-9_]*\b/.test(text) ||
    /\bimport cycle not allowed\b/.test(text) ||
    /\bno required module provides package\b/.test(text)
  );
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
  const importResolveRe = /^(package .+ is not in GOROOT.*)$/gm;
  while ((match = importResolveRe.exec(source)) !== null) {
    out.push({
      tool,
      category: 'import_resolve',
      file: null,
      line: null,
      col: null,
      message: String(match[1] || '').trim(),
    });
  }
  const buildFailRe = /^(?:# .+|.+):?\s*(undefined: .+|cannot use .+|cannot assign .+|not enough arguments in call to .+|too many arguments in call to .+|package .+ is not in GOROOT.*)$/gm;
  while ((match = buildFailRe.exec(source)) !== null) {
    if (/\.go:\d+:\d+:/.test(String(match[0] || ''))) continue;
    out.push({
      tool,
      category: /package .+ is not in GOROOT|undefined: /.test(String(match[1] || '')) ? 'import_resolve' : 'compile_error',
      file: null,
      line: null,
      col: null,
      message: String(match[1] || '').trim(),
    });
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
  const packageMissingRe = /^(?:error:\s+)?package\s+([A-Za-z0-9_.]+)\s+does not exist$/gm;
  while ((match = packageMissingRe.exec(source)) !== null) {
    out.push({
      tool,
      category: 'import_resolve',
      file: null,
      line: null,
      col: null,
      symbol: match[1] || '',
      message: `package ${String(match[1] || '').trim()} does not exist`,
    });
  }
  const symbolMissingRe = /^(?:error:\s+)?cannot find symbol$/gm;
  while ((match = symbolMissingRe.exec(source)) !== null) {
    out.push({
      tool,
      category: 'compile_error',
      file: null,
      line: null,
      col: null,
      message: 'cannot find symbol',
    });
  }
  const surefireRe = /^\[ERROR\]\s+(.+?)\s+Time elapsed:.*<<< FAILURE!\s*$/gm;
  while ((match = surefireRe.exec(source)) !== null) {
    out.push({ tool, category: 'test_failure', file: null, line: null, col: null, symbol: match[1] || '', message: 'JUnit/Surefire test failed' });
  }
  return uniqueFailures(out.length ? out : normalizeGeneric(source, tool));
}

/** @param {NormalizeFailuresInput} param0 @returns {FailureItem[]} */
function normalizeFailures({ runtime, language, provider, text, tool }) {
  const source = String(text || '').trim();
  if (!source) return [];
  const providerLanguage = normalizeProviderLanguage(provider);
  const normalizedLanguage = String(language || '').toLowerCase();
  const rt = String(runtime || language || 'unknown').toLowerCase();
  if (providerLanguage === 'node') return normalizeNode(source, tool);
  if (providerLanguage === 'python') return normalizePythonFailures(source, tool);
  if (providerLanguage === 'go') return normalizeGo(source, tool);
  if (providerLanguage === 'java') return normalizeJava(source, tool);
  if (looksLikeGoFailure(source)) return normalizeGo(source, tool);
  if (rt === 'node' || normalizedLanguage === 'typescript' || normalizedLanguage === 'javascript') return normalizeNode(source, tool);
  if (rt === 'python' || normalizedLanguage === 'python') return normalizePythonFailures(source, tool);
  if (rt === 'go' || normalizedLanguage === 'go') return normalizeGo(source, tool);
  if (rt === 'java' || normalizedLanguage === 'java') return normalizeJava(source, tool);
  return uniqueFailures(normalizeGeneric(source, tool));
}

module.exports = {
  normalizeFailures,
  uniqueFailures,
  normalizeGeneric,
  normalizeProviderLanguage,
};
