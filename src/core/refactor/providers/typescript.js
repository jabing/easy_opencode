// @ts-nocheck
const fs = require('fs');
const path = require('path');
let ts = null;
try {
  ts = require('typescript');
} catch {
  ts = null;
}

const { collectFiles } = require('../file-scan.js');
const { TYPESCRIPT_FAMILY_EXTENSIONS, isTypescriptFamilyFile } = require('../languages.js');

function lineColToOffset(text, line1, col1) {
  const line = Math.max(1, Number(line1));
  const col = Math.max(1, Number(col1));
  const lines = String(text || '').split(/\r?\n/);
  if (line > lines.length) throw new Error(`line out of range: ${line}`);
  let offset = 0;
  for (let i = 1; i < line; i += 1) offset += lines[i - 1].length + 1;
  const lineText = lines[line - 1];
  if (col - 1 > lineText.length) throw new Error(`column out of range: ${col}`);
  return offset + (col - 1);
}

function createLanguageService(baseDir) {
  const files = collectFiles(baseDir, TYPESCRIPT_FAMILY_EXTENSIONS);
  const absFiles = files.map((file) => path.resolve(file));
  const versions = new Map(absFiles.map((file) => [file, 1]));
  const content = new Map(absFiles.map((file) => [file, fs.readFileSync(file, 'utf8')]));
  const host = {
    getCompilationSettings: () => ({
      allowJs: true,
      checkJs: false,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      skipLibCheck: true,
      noEmit: true,
    }),
    getScriptFileNames: () => absFiles,
    getScriptVersion: (fileName) => String(versions.get(path.resolve(fileName)) || 1),
    getScriptSnapshot: (fileName) => {
      const key = path.resolve(fileName);
      const text = content.has(key) ? content.get(key) : (fs.existsSync(key) ? fs.readFileSync(key, 'utf8') : '');
      return ts.ScriptSnapshot.fromString(text || '');
    },
    getCurrentDirectory: () => baseDir,
    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };
  return {
    service: ts.createLanguageService(host, ts.createDocumentRegistry()),
    content,
  };
}

function gatherReplacements(source, fromName, toName) {
  const edits = [];
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === fromName) {
      edits.push({ start: node.getStart(source), end: node.getEnd(), text: toName });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return edits;
}

function applyEdits(text, edits) {
  if (!Array.isArray(edits) || edits.length === 0) return text;
  const sorted = [...edits].sort((left, right) => right.start - left.start);
  let next = text;
  for (const edit of sorted) {
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  }
  return next;
}

function parseSource(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const kind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, kind);
  return { text, source };
}

function writeFileMaybe(filePath, next, dryRun) {
  if (!dryRun) fs.writeFileSync(filePath, next, 'utf8');
}

function quoteModuleName(moduleName) {
  return JSON.stringify(moduleName);
}

const provider = {
  id: 'typescript-semantic',
  label: 'TypeScript semantic provider',
  execution_mode: 'semantic_ast',
  supported_operations: ['rename-at', 'rename-symbol', 'add-import', 'remove-import', 'ensure-export'],
  supported_primitives: ['rename_at', 'rename_symbol', 'add_import', 'remove_import', 'ensure_export'],
  supported_languages: ['javascript', 'typescript'],
  isAvailable() {
    return Boolean(ts);
  },
  supportsOperation(operation, context = {}) {
    if (!ts) return false;
    if (!this.supported_operations.includes(operation)) return false;
    if (context.file) return isTypescriptFamilyFile(context.file);
    return true;
  },
  supportsPrimitive(primitive, context = {}) {
    if (!ts) return false;
    if (!this.supported_primitives.includes(String(primitive || '').trim())) return false;
    if (context.file) return isTypescriptFamilyFile(context.file);
    return true;
  },
  renameSymbol(context) {
    const files = collectFiles(context.baseDir, TYPESCRIPT_FAMILY_EXTENSIONS);
    let changedFiles = 0;
    let changedNodes = 0;
    for (const file of files) {
      const original = fs.readFileSync(file, 'utf8');
      const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true);
      const edits = gatherReplacements(source, context.fromName, context.toName);
      if (edits.length === 0) continue;
      changedFiles += 1;
      changedNodes += edits.length;
      if (!context.dryRun) fs.writeFileSync(file, applyEdits(original, edits), 'utf8');
    }
    return {
      changedFiles,
      changedNodes,
      execution_mode: 'semantic_ast',
      semantic: true,
      detail: 'TypeScript-family AST identifier rewrite',
    };
  },
  renameAt(context) {
    const absoluteTarget = path.resolve(context.file);
    if (!fs.existsSync(absoluteTarget)) throw new Error(`file not found: ${absoluteTarget}`);
    const { service, content } = createLanguageService(context.baseDir);
    const sourceText = content.get(absoluteTarget) || fs.readFileSync(absoluteTarget, 'utf8');
    const position = lineColToOffset(sourceText, context.line, context.col);
    const info = service.getRenameInfo(absoluteTarget, position, { allowRenameOfImportPath: false });
    if (!info || !info.canRename) {
      throw new Error(`cannot rename at ${context.file}:${context.line}:${context.col} (${(info && info.localizedErrorMessage) || 'unknown'})`);
    }
    const locations = service.findRenameLocations(absoluteTarget, position, false, false, false) || [];
    if (locations.length === 0) throw new Error('no rename locations found');
    const editsByFile = new Map();
    for (const location of locations) {
      const fileName = path.resolve(location.fileName);
      const edits = editsByFile.get(fileName) || [];
      edits.push({
        start: location.textSpan.start,
        end: location.textSpan.start + location.textSpan.length,
        text: context.toName,
      });
      editsByFile.set(fileName, edits);
    }
    let changedFiles = 0;
    let changedNodes = 0;
    for (const [fileName, edits] of editsByFile.entries()) {
      const original = content.get(fileName) || fs.readFileSync(fileName, 'utf8');
      changedFiles += 1;
      changedNodes += edits.length;
      if (!context.dryRun) fs.writeFileSync(fileName, applyEdits(original, edits), 'utf8');
    }
    return {
      changedFiles,
      changedNodes,
      symbol: info.displayName || '',
      execution_mode: 'semantic_ast',
      semantic: true,
      detail: 'TypeScript language-service rename',
    };
  },
  addImport(context) {
    const abs = path.resolve(context.file);
    if (!fs.existsSync(abs)) throw new Error(`file not found: ${abs}`);
    const { text, source } = parseSource(abs);
    const alias = String(context.alias || '').trim();
    const isDefault = context.defaultImport === true;
    const isTypeOnly = context.typeOnly === true;
    const specifier = alias ? `${context.importName} as ${alias}` : context.importName;
    const desiredNamed = isDefault ? '' : specifier;
    let existing = null;
    let insertPos = 0;

    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) break;
      insertPos = statement.end;
      const moduleName = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : '';
      if (moduleName === context.moduleName) existing = statement;
    }

    let next = text;
    if (existing) {
      const clause = existing.importClause;
      if (isDefault) {
        if (clause && clause.name) return { changed: false, detail: `default import already exists from ${context.moduleName}`, execution_mode: 'semantic_ast', semantic: true };
        const namedPart = clause && clause.namedBindings ? text.slice(clause.namedBindings.pos, clause.namedBindings.end).trim() : '';
        const replacement = namedPart ? `import ${context.importName}, ${namedPart} from ${quoteModuleName(context.moduleName)};` : `import ${context.importName} from ${quoteModuleName(context.moduleName)};`;
        next = text.slice(0, existing.pos) + replacement + text.slice(existing.end);
        writeFileMaybe(abs, next, context.dryRun);
        return { changed: true, detail: `added default import ${context.importName} from ${context.moduleName}`, execution_mode: 'semantic_ast', semantic: true };
      }
      const clauseText = clause ? text.slice(clause.pos, clause.end) : '';
      if (clauseText.includes(context.importName) || clauseText.includes(specifier)) {
        return { changed: false, detail: `import already present from ${context.moduleName}`, execution_mode: 'semantic_ast', semantic: true };
      }
      if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
        const prefix = clause && clause.name ? `${clause.name.text}, ` : '';
        const typePrefix = isTypeOnly ? 'type ' : '';
        const replacement = `import ${prefix}{ ${typePrefix}${desiredNamed} } from ${quoteModuleName(context.moduleName)};`;
        next = text.slice(0, existing.pos) + replacement + text.slice(existing.end);
        writeFileMaybe(abs, next, context.dryRun);
        return { changed: true, detail: `merged named import ${desiredNamed} from ${context.moduleName}`, execution_mode: 'semantic_ast', semantic: true };
      }
      const namedBindings = clause.namedBindings;
      const insertNamedPos = namedBindings.end - 1;
      const existingNamed = namedBindings.elements.map((element) => text.slice(element.pos, element.end).trim()).filter(Boolean);
      const addition = `${existingNamed.length ? ', ' : ''}${isTypeOnly ? 'type ' : ''}${desiredNamed}`;
      next = text.slice(0, insertNamedPos) + addition + text.slice(insertNamedPos);
      writeFileMaybe(abs, next, context.dryRun);
      return { changed: true, detail: `added named import ${desiredNamed} from ${context.moduleName}`, execution_mode: 'semantic_ast', semantic: true };
    }

    const importLine = `${isTypeOnly ? 'import type' : 'import'} ${isDefault ? context.importName : `{ ${desiredNamed} }`} from ${quoteModuleName(context.moduleName)};\n`;
    next = text.slice(0, insertPos) + (insertPos > 0 ? '\n' : '') + importLine + text.slice(insertPos);
    writeFileMaybe(abs, next, context.dryRun);
    return { changed: true, detail: `inserted import from ${context.moduleName}`, execution_mode: 'semantic_ast', semantic: true };
  },
  removeImport(context) {
    const abs = path.resolve(context.file);
    if (!fs.existsSync(abs)) throw new Error(`file not found: ${abs}`);
    const { text, source } = parseSource(abs);
    let matched = null;
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      const moduleName = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : '';
      if (moduleName === context.moduleName) {
        matched = statement;
        break;
      }
    }
    if (!matched) return { changed: false, detail: `no import found from ${context.moduleName}`, execution_mode: 'semantic_ast', semantic: true };
    if (!context.importName) {
      const next = text.slice(0, matched.pos) + text.slice(matched.end).replace(/^\r?\n/, '');
      writeFileMaybe(abs, next, context.dryRun);
      return { changed: true, detail: `removed import declaration from ${context.moduleName}`, execution_mode: 'semantic_ast', semantic: true };
    }

    const clause = matched.importClause;
    if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
      return { changed: false, detail: `named import ${context.importName} not found in ${context.moduleName}`, execution_mode: 'semantic_ast', semantic: true };
    }
    const remaining = clause.namedBindings.elements.filter((element) => element.name.text !== context.importName && text.slice(element.pos, element.end).trim() !== context.importName);
    if (remaining.length === clause.namedBindings.elements.length) {
      return { changed: false, detail: `named import ${context.importName} not found in ${context.moduleName}`, execution_mode: 'semantic_ast', semantic: true };
    }
    const defaultName = clause.name ? clause.name.text : '';
    if (remaining.length === 0 && !defaultName) {
      const next = text.slice(0, matched.pos) + text.slice(matched.end).replace(/^\r?\n/, '');
      writeFileMaybe(abs, next, context.dryRun);
      return { changed: true, detail: `removed final import ${context.importName} from ${context.moduleName}`, execution_mode: 'semantic_ast', semantic: true };
    }
    const namedText = remaining.map((element) => text.slice(element.pos, element.end).trim()).join(', ');
    const replacement = defaultName ? `import ${defaultName}${namedText ? `, { ${namedText} }` : ''} from ${quoteModuleName(context.moduleName)};` : `import { ${namedText} } from ${quoteModuleName(context.moduleName)};`;
    const next = text.slice(0, matched.pos) + replacement + text.slice(matched.end);
    writeFileMaybe(abs, next, context.dryRun);
    return { changed: true, detail: `removed named import ${context.importName} from ${context.moduleName}`, execution_mode: 'semantic_ast', semantic: true };
  },
  ensureExport(context) {
    const abs = path.resolve(context.file);
    if (!fs.existsSync(abs)) throw new Error(`file not found: ${abs}`);
    const { text, source } = parseSource(abs);
    let alreadyExists = false;
    source.statements.forEach((statement) => {
      const modifiers = statement.modifiers || [];
      const isExported = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      if (!isExported) return;
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name && statement.name.text === context.name) {
        alreadyExists = true;
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (declaration.name && ts.isIdentifier(declaration.name) && declaration.name.text === context.name) alreadyExists = true;
        }
      }
    });
    if (alreadyExists) return { changed: false, detail: `export ${context.name} already exists`, execution_mode: 'semantic_ast', semantic: true };
    const snippet = context.kind === 'const'
      ? `\nexport const ${context.name} = () => {\n  throw new Error('Not implemented');\n};\n`
      : `\nexport function ${context.name}() {\n  throw new Error('Not implemented');\n}\n`;
    writeFileMaybe(abs, `${text.replace(/\s*$/, '')}${snippet}`, context.dryRun);
    return { changed: true, detail: `added export stub ${context.name}`, execution_mode: 'semantic_ast', semantic: true };
  },
};

module.exports = {
  applyEdits,
  createLanguageService,
  gatherReplacements,
  lineColToOffset,
  parseSource,
  provider,
};
