/** @typedef {{ name: string, start: number, end: number }} IdentifierSpan */

/** @param {string} text @param {number} line1 @param {number} col1 @returns {number} */
function lineColToOffset(text, line1, col1) {
  const line = Math.max(1, Number(line1));
  const col = Math.max(1, Number(col1));
  const lines = String(text || '').split(/\r?\n/);
  if (line > lines.length) throw new Error(`line out of range: ${line}`);
  let offset = 0;
  for (let index = 1; index < line; index += 1) {
    const current = lines[index - 1] || '';
    offset += current.length + 1;
  }
  const lineText = lines[line - 1] || '';
  if (col - 1 > lineText.length) throw new Error(`column out of range: ${col}`);
  return offset + (col - 1);
}

/** @param {string} text @param {Array<[number, number]>} codeRanges @returns {string} */
function buildCodeMask(text, codeRanges) {
  const source = String(text || '');
  /** @type {string[]} */
  const chars = Array.from(source, (char) => (char === '\n' ? '\n' : ' '));
  for (const [start, end] of codeRanges || []) {
    for (let index = start; index < end; index += 1) chars[index] = source[index] || '';
  }
  return chars.join('');
}

/** @param {string} text @param {Array<[number, number]>} codeRanges @returns {{ masked: string, spans: IdentifierSpan[] }} */
function collectIdentifierSpans(text, codeRanges) {
  const masked = buildCodeMask(text, codeRanges);
  /** @type {IdentifierSpan[]} */
  const spans = [];
  const matcher = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
  let match = matcher.exec(masked);
  while (match) {
    spans.push({ name: match[0], start: match.index, end: match.index + match[0].length });
    match = matcher.exec(masked);
  }
  return { masked, spans };
}

/** @param {IdentifierSpan[]} spans @param {number} offset @returns {IdentifierSpan | null} */
function findIdentifierAtOffset(spans, offset) {
  const numeric = Number(offset);
  return spans.find((span) => span.start <= numeric && numeric < span.end)
    || spans.find((span) => numeric === span.end)
    || null;
}

/** @param {string} text @param {IdentifierSpan[]} spans @param {string} toName @returns {{ changed: boolean, next: string, replacements: number }} */
function applyIdentifierEdits(text, spans, toName) {
  if (!Array.isArray(spans) || spans.length === 0) return { changed: false, next: String(text || ''), replacements: 0 };
  const sorted = [...spans].sort((left, right) => right.start - left.start);
  let next = String(text || '');
  for (const span of sorted) next = `${next.slice(0, span.start)}${toName}${next.slice(span.end)}`;
  return { changed: true, next, replacements: spans.length };
}

/** @param {string} text @param {number} openIndex @param {string} openChar @param {string} closeChar @returns {number} */
function findMatchingDelimiter(text, openIndex, openChar, closeChar) {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === openChar) depth += 1;
    else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** @param {string} text @returns {string[]} */
function splitTopLevelCommaList(text) {
  /** @type {string[]} */
  const parts = [];
  let current = '';
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let angle = 0;
  for (const char of String(text || '')) {
    if (char === '(') paren += 1;
    else if (char === ')') paren = Math.max(0, paren - 1);
    else if (char === '[') bracket += 1;
    else if (char === ']') bracket = Math.max(0, bracket - 1);
    else if (char === '{') brace += 1;
    else if (char === '}') brace = Math.max(0, brace - 1);
    else if (char === '<') angle += 1;
    else if (char === '>') angle = Math.max(0, angle - 1);

    if (char === ',' && paren === 0 && bracket === 0 && brace === 0 && angle === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

module.exports = {
  applyIdentifierEdits,
  buildCodeMask,
  collectIdentifierSpans,
  findIdentifierAtOffset,
  findMatchingDelimiter,
  lineColToOffset,
  splitTopLevelCommaList,
};
