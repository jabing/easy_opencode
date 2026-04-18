const fs = require('fs');
const { collectFiles } = require('../file-scan.js');
const { TEXT_FALLBACK_EXTENSIONS } = require('../languages.js');

/** @param {unknown} value */
function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string | null | undefined} text @param {string | null | undefined} fromName @param {string | null | undefined} toName */
function replaceIdentifier(text, fromName, toName) {
  const safeText = String(text || '');
  if (!fromName || fromName === toName) return { changed: false, next: safeText, replacements: 0 };
  const matcher = new RegExp(`(^|[^A-Za-z0-9_$])(${escapeRegExp(fromName)})(?=$|[^A-Za-z0-9_$])`, 'gm');
  let replacements = 0;
  const next = safeText.replace(matcher, (match, prefix) => {
    replacements += 1;
    return `${prefix}${toName}`;
  });
  return { changed: replacements > 0, next, replacements };
}

/** @typedef {{ baseDir: string, fromName?: string, toName?: string, dryRun?: boolean }} TextFallbackContext */

const provider = {
  id: 'text-fallback',
  label: 'Cross-language text fallback',
  execution_mode: 'text_fallback',
  supported_operations: ['rename-symbol'],
  supported_primitives: ['rename_symbol'],
  supported_languages: ['javascript', 'typescript', 'python', 'go', 'java'],
  /** @param {string} operation */
  supportsOperation(operation) {
    return operation === 'rename-symbol';
  },
  /** @param {unknown} primitive */
  supportsPrimitive(primitive) {
    return String(primitive || '').trim() === 'rename_symbol';
  },
  /** @param {TextFallbackContext} context */
  renameSymbol(context) {
    const baseDir = context.baseDir;
    const fromName = String(context.fromName || '').trim();
    const toName = String(context.toName || '').trim();
    const dryRun = context.dryRun === true;
    const files = collectFiles(baseDir, TEXT_FALLBACK_EXTENSIONS);
    let changedFiles = 0;
    let changedNodes = 0;
    for (const file of files) {
      const original = fs.readFileSync(file, 'utf8');
      const result = replaceIdentifier(original, fromName, toName);
      if (!result.changed) continue;
      changedFiles += 1;
      changedNodes += result.replacements;
      if (!dryRun) fs.writeFileSync(file, result.next, 'utf8');
    }
    return {
      changedFiles,
      changedNodes,
      execution_mode: 'text_fallback',
      semantic: false,
      detail: 'Broad cross-language identifier fallback',
    };
  },
};

module.exports = {
  provider,
  replaceIdentifier,
};
