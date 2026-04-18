const fs = require('fs');
const path = require('path');

/**
 * @typedef {{ path: string, exists: boolean, imports: string[], exports: string[], symbols: string[], line_count: number }} FileSummary
 */

/** @param {string[]} arr @param {string} value @param {number} [limit] */
function pushUnique(arr, value, limit = 20) {
  if (!value || arr.includes(value) || arr.length >= limit) return;
  arr.push(value);
}

/** @param {string} root @param {string} relPath @returns {FileSummary} */
function summarizeGenericFile(root, relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) {
    return { path: relPath, exists: false, imports: [], exports: [], symbols: [], line_count: 0 };
  }
  const text = fs.readFileSync(abs, 'utf8');
  const ext = path.extname(relPath).toLowerCase();
  /** @type {FileSummary} */
  const summary = {
    path: relPath,
    exists: true,
    line_count: text.split(/\r?\n/).length,
    imports: [],
    exports: [],
    symbols: [],
  };

  /** @type {Record<string, { imports: RegExp[], symbols: RegExp[], exports: RegExp[] }>} */
  const regexesByExt = {
    '.py': {
      imports: [/^(?:from\s+[^\n]+\s+import\s+.+|import\s+.+)$/gm],
      symbols: [/^(?:async\s+def|def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/gm],
      exports: [],
    },
    '.go': {
      imports: [/^import\s+(?:\(([^)]*)\)|"([^"]+)")/gm],
      symbols: [/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)/gm, /^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+/gm],
      exports: [/^(?:func|type|const|var)\s+([A-Z][A-Za-z0-9_]*)/gm],
    },
    '.java': {
      imports: [/^import\s+[^;]+;/gm],
      symbols: [/\b(?:class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)/gm, /\b(?:public|protected|private)?\s*(?:static\s+)?[A-Za-z0-9_<>\[\], ?]+\s+([a-zA-Z_][A-Za-z0-9_]*)\s*\(/gm],
      exports: [/\bpublic\s+(?:class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)/gm],
    },
  };

  const ruleSet = regexesByExt[ext];
  if (!ruleSet) return summary;

  for (const re of ruleSet.imports || []) {
    let match;
    while ((match = re.exec(text)) !== null) pushUnique(summary.imports, match[0].trim());
  }
  for (const re of ruleSet.exports || []) {
    let match;
    while ((match = re.exec(text)) !== null) {
      const value = match[1];
      if (typeof value === 'string') pushUnique(summary.exports, value);
    }
  }
  for (const re of ruleSet.symbols || []) {
    let match;
    while ((match = re.exec(text)) !== null) {
      const value = match[1];
      if (typeof value === 'string') pushUnique(summary.symbols, value);
    }
  }

  return summary;
}

/**
 * @param {string} root
 * @param {string} relPath
 * @param {undefined | { createSourceFile: Function, ScriptTarget: { Latest: unknown }, forEachChild: Function, isImportDeclaration: Function, isStringLiteral: Function, isNamespaceImport: Function, isNamedImports: Function, isFunctionDeclaration: Function, isClassDeclaration: Function, isInterfaceDeclaration: Function, isTypeAliasDeclaration: Function, isVariableStatement: Function, isIdentifier: Function, SyntaxKind: { ExportKeyword: unknown } }} ts
 * @returns {FileSummary}
 */
function summarizeJsTsFile(root, relPath, ts) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) {
    return { path: relPath, exists: false, imports: [], exports: [], symbols: [], line_count: 0 };
  }
  const ext = path.extname(relPath).toLowerCase();
  if (!['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'].includes(ext)) {
    return summarizeGenericFile(root, relPath);
  }

  const text = fs.readFileSync(abs, 'utf8');
  /** @type {FileSummary} */
  const summary = {
    path: relPath,
    exists: true,
    line_count: text.split(/\r?\n/).length,
    imports: [],
    exports: [],
    symbols: [],
  };

  if (!ts) {
    const importMatches = text.match(/^import\s.+$/gm) || [];
    const exportMatches = text.match(/^export\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z0-9_]+)/gm) || [];
    summary.imports = importMatches.slice(0, 20);
    summary.exports = exportMatches.map((line) => line.replace(/^.*?\s([A-Za-z0-9_]+).*$/, '$1')).slice(0, 20);
    summary.symbols = summary.exports.slice(0, 20);
    return summary;
  }

  /** @type {string[]} */
  const imports = [];
  /** @type {string[]} */
  const exports = [];
  /** @type {string[]} */
  const symbols = [];
  const tsApi = ts;
  const source = tsApi.createSourceFile(abs, text, tsApi.ScriptTarget.Latest, true);

  /** @param {any} node */
  function visit(node) {
    if (tsApi.isImportDeclaration(node)) {
      const mod = node.moduleSpecifier && tsApi.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '';
      const clause = node.importClause;
      /** @type {string[]} */
      const parts = [];
      if (clause && clause.name) parts.push(`default:${clause.name.text}`);
      if (clause && clause.namedBindings) {
        if (tsApi.isNamespaceImport(clause.namedBindings)) {
          parts.push(`* as ${clause.namedBindings.name.text}`);
        } else if (tsApi.isNamedImports(clause.namedBindings)) {
          parts.push(clause.namedBindings.elements.map((/** @type {{ name: { text: string } }} */ e) => e.name.text).join(', '));
        }
      }
      pushUnique(imports, `${parts.join(' ')} from ${mod}`.trim());
    }
    const modifiers = Array.isArray(node.modifiers) ? node.modifiers : [];
    const isExported = modifiers.some((/** @type {{ kind: unknown }} */ m) => m.kind === tsApi.SyntaxKind.ExportKeyword);
    if (isExported) {
      const name = node.name && node.name.text;
      if (name) pushUnique(exports, name);
    }
    if ((tsApi.isFunctionDeclaration(node) || tsApi.isClassDeclaration(node) || tsApi.isInterfaceDeclaration(node) || tsApi.isTypeAliasDeclaration(node)) && node.name) {
      pushUnique(symbols, node.name.text);
    }
    if (tsApi.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.name && tsApi.isIdentifier(decl.name)) pushUnique(symbols, decl.name.text);
      }
    }
    tsApi.forEachChild(node, visit);
  }

  visit(source);
  summary.imports = imports;
  summary.exports = exports;
  summary.symbols = symbols;
  return summary;
}

module.exports = {
  summarizeGenericFile,
  summarizeJsTsFile,
};
