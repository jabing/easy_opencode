// @ts-nocheck
const fs = require('fs');
const path = require('path');
const { collectFiles } = require('../file-scan.js');
const { JAVA_EXTENSIONS, isJavaFile } = require('../languages.js');
const { isLspAvailable, offsetToLineCol, resolveBackendPreference, runLspRenameSync, shouldAttemptLsp } = require('./lsp-backend.js');
const {
  applyIdentifierEdits,
  collectIdentifierSpans,
  findIdentifierAtOffset,
  findMatchingDelimiter,
  lineColToOffset,
  splitTopLevelCommaList,
} = require('./indexed-utils.js');

function resolveBaseDir(context = {}) {
  if (context.baseDir) return path.resolve(context.baseDir);
  if (context.file) return path.dirname(path.resolve(context.file));
  return process.cwd();
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function writeMaybe(filePath, body, dryRun) {
  if (!dryRun) fs.writeFileSync(filePath, body, 'utf8');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenizeJavaRanges(text) {
  const codeRanges = [];
  let inString = false;
  let inChar = false;
  let inTextBlock = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escape = false;
  let rangeStart = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    const nextTwo = text[index + 2];
    if (inLineComment) {
      if (char === '\n') { inLineComment = false; rangeStart = index + 1; }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') { inBlockComment = false; index += 1; rangeStart = index + 1; }
      continue;
    }
    if (inTextBlock) {
      if (char === '"' && next === '"' && nextTwo === '"') { inTextBlock = false; index += 2; rangeStart = index + 1; }
      continue;
    }
    if (inString) {
      if (!escape && char === '"') { inString = false; rangeStart = index + 1; }
      escape = !escape && char === '\\';
      continue;
    }
    if (inChar) {
      if (!escape && char === "'") { inChar = false; rangeStart = index + 1; }
      escape = !escape && char === '\\';
      continue;
    }
    if (char === '/' && next === '/') {
      if (rangeStart < index) codeRanges.push([rangeStart, index]);
      inLineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      if (rangeStart < index) codeRanges.push([rangeStart, index]);
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' && next === '"' && nextTwo === '"') {
      if (rangeStart < index) codeRanges.push([rangeStart, index]);
      inTextBlock = true;
      index += 2;
      continue;
    }
    if (char === '"') {
      if (rangeStart < index) codeRanges.push([rangeStart, index]);
      inString = true;
      escape = false;
      continue;
    }
    if (char === "'") {
      if (rangeStart < index) codeRanges.push([rangeStart, index]);
      inChar = true;
      escape = false;
      continue;
    }
  }
  if (!inLineComment && !inBlockComment && !inString && !inChar && !inTextBlock && rangeStart < text.length) codeRanges.push([rangeStart, text.length]);
  return codeRanges;
}

function renameJavaIdentifiers(text, fromName, toName) {
  if (!fromName || fromName === toName) return { changed: false, next: text, replacements: 0 };
  const matcher = new RegExp(`\\b${escapeRegExp(fromName)}\\b`, 'g');
  const ranges = tokenizeJavaRanges(text);
  let next = text;
  let replacements = 0;
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const [start, end] = ranges[index];
    const segment = next.slice(start, end);
    const updated = segment.replace(matcher, () => { replacements += 1; return toName; });
    next = `${next.slice(0, start)}${updated}${next.slice(end)}`;
  }
  return { changed: replacements > 0, next, replacements };
}

function qualifyJavaImport(moduleName, importName) {
  const normalizedModule = String(moduleName || '').trim().replace(/;$/g, '');
  const normalizedImport = String(importName || '').trim();
  if (!normalizedModule) return '';
  if (!normalizedImport || normalizedModule.endsWith(`.${normalizedImport}`) || normalizedModule.endsWith('.*')) return normalizedModule;
  return `${normalizedModule}.${normalizedImport}`;
}

function addImportToJava(text, moduleName, importName) {
  const importPath = qualifyJavaImport(moduleName, importName);
  if (!importPath) return { changed: false, next: text, detail: 'No Java import path provided' };
  const statement = `import ${importPath};`;
  const lines = text.split('\n');
  if (lines.some((line) => line.trim() === statement)) return { changed: false, next: text, detail: `Java import already present: ${statement}` };
  let packageIndex = -1;
  let lastImportIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith('package ')) packageIndex = index;
    if (trimmed.startsWith('import ')) lastImportIndex = index;
  }
  const insertionIndex = lastImportIndex >= 0 ? lastImportIndex + 1 : (packageIndex >= 0 ? packageIndex + 1 : 0);
  const nextLines = [...lines];
  if (packageIndex >= 0 && lastImportIndex === -1) nextLines.splice(insertionIndex, 0, '', statement);
  else nextLines.splice(insertionIndex, 0, statement);
  const next = `${nextLines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/g, '')}\n`;
  return { changed: true, next, detail: `Inserted Java import ${statement}` };
}

function removeImportFromJava(text, moduleName, importName) {
  const importPath = qualifyJavaImport(moduleName, importName || '');
  if (!importPath) return { changed: false, next: text, detail: 'No Java import path provided' };
  const statement = `import ${importPath};`;
  const lines = text.split('\n');
  const filtered = lines.filter((line) => line.trim() !== statement);
  if (filtered.length === lines.length) return { changed: false, next: text, detail: `Java import not present: ${statement}` };
  const next = `${filtered.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/g, '')}\n`;
  return { changed: true, next, detail: `Removed Java import ${statement}` };
}

function ensureJavaPublicExport(text, name, kind) {
  const normalizedName = String(name || '').trim();
  const normalizedKind = String(kind || '').trim().toLowerCase();
  if (!normalizedName) return { changed: false, next: text, detail: 'No Java symbol provided for ensure-export' };
  const classKinds = ['class', 'interface', 'enum', 'record'];
  const wantsClass = !normalizedKind || normalizedKind === 'class' || normalizedKind === 'type' || normalizedKind === 'const' || normalizedKind === 'function';
  if (wantsClass) {
    const classPattern = new RegExp(`(^[\\t ]*)(?:public\\s+)?(?:private\\s+|protected\\s+)?((?:(?:abstract|final|sealed|non-sealed|static|strictfp)\\s+)*)(${classKinds.join('|')})\\s+${escapeRegExp(normalizedName)}\\b`, 'm');
    const classMatch = text.match(classPattern);
    if (classMatch) {
      if (/^\s*public\s+/.test(classMatch[0])) return { changed: false, next: text, detail: `Java export already public for ${normalizedName}` };
      const next = text.replace(classPattern, (_, indent, modifiers, classKind) => `${indent}public ${modifiers || ''}${classKind} ${normalizedName}`);
      return { changed: true, next, detail: `Promoted Java ${classMatch[3]} ${normalizedName} to public` };
    }
  }
  const methodPattern = new RegExp(`(^[\\t ]*)(?:public\\s+)?(?:private\\s+|protected\\s+)?((?:(?:static|final|synchronized|abstract|native|default|strictfp)\\s+)*)((?:[A-Za-z0-9_<>,?\\[\\]@.]+\\s+)+)${escapeRegExp(normalizedName)}\\s*\\(`, 'm');
  const methodMatch = text.match(methodPattern);
  if (methodMatch) {
    if (/^\s*public\s+/.test(methodMatch[0])) return { changed: false, next: text, detail: `Java export already public for ${normalizedName}` };
    const next = text.replace(methodPattern, (_, indent, modifiers, returnType) => `${indent}public ${modifiers || ''}${returnType}${normalizedName}(`);
    return { changed: true, next, detail: `Promoted Java member ${normalizedName} to public` };
  }
  return { changed: false, next: text, detail: `Java ensure-export could not find ${normalizedName}` };
}

function extractJavaParamNames(paramList) {
  const names = [];
  for (const segment of splitTopLevelCommaList(paramList)) {
    const cleaned = segment.replace(/@[A-Za-z_][A-Za-z0-9_.]*(\([^)]*\))?/g, ' ').trim();
    const match = cleaned.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:\.\.\.|\[\])?\s*$/);
    if (match) names.push(match[1]);
  }
  return names;
}

function extractJavaLocalNames(maskedBody) {
  const names = [];
  const matcher = /(^|[;{}])\s*(?:final\s+)?(?:[A-Za-z_][A-Za-z0-9_<>,.?\[\]@]*\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*(?==|;|,)/gm;
  let match = matcher.exec(maskedBody);
  while (match) { names.push(match[2]); match = matcher.exec(maskedBody); }
  return Array.from(new Set(names));
}

function extractJavaClasses(masked) {
  const classes = [];
  const matcher = /(?:^|\n)\s*(?:public\s+|protected\s+|private\s+|abstract\s+|final\s+|sealed\s+|non-sealed\s+|static\s+)*(class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm;
  let match = matcher.exec(masked);
  while (match) {
    const absolute = match.index + match[0].lastIndexOf(match[1]);
    const nameStart = match.index + match[0].lastIndexOf(match[2]);
    const braceStart = masked.indexOf('{', absolute);
    if (braceStart < 0) { match = matcher.exec(masked); continue; }
    const braceEnd = findMatchingDelimiter(masked, braceStart, '{', '}');
    if (braceEnd < 0) { match = matcher.exec(masked); continue; }
    classes.push({ kind: match[1], name: match[2], nameSpan: { start: nameStart, end: nameStart + match[2].length }, rangeStart: absolute, rangeEnd: braceEnd + 1, bodyStart: braceStart, bodyEnd: braceEnd, methods: [] });
    match = matcher.exec(masked);
  }
  return classes;
}

function extractJavaMethods(masked, classInfo) {
  const bodyMasked = masked.slice(classInfo.bodyStart + 1, classInfo.bodyEnd);
  const methods = [];
  const matcher = /(?:^|\n)\s*(?:public\s+|protected\s+|private\s+|static\s+|final\s+|abstract\s+|synchronized\s+|native\s+|default\s+|strictfp\s+)*(?:<[^>{}\n]+>\s*)?(?:[A-Za-z_][A-Za-z0-9_<>,.?\[\]@]*\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:throws\s+[^{;]+)?\{/gm;
  let match = matcher.exec(bodyMasked);
  while (match) {
    const absoluteStart = classInfo.bodyStart + 1 + match.index;
    const nameOffset = match[0].lastIndexOf(match[1]);
    const nameStart = absoluteStart + nameOffset;
    const bodyStart = absoluteStart + match[0].lastIndexOf('{');
    const bodyEnd = findMatchingDelimiter(masked, bodyStart, '{', '}');
    if (bodyEnd < 0 || bodyEnd > classInfo.bodyEnd) { match = matcher.exec(bodyMasked); continue; }
    const localNames = new Set([...extractJavaParamNames(match[2]), ...extractJavaLocalNames(masked.slice(bodyStart + 1, bodyEnd))]);
    methods.push({ name: match[1], nameSpan: { start: nameStart, end: nameStart + match[1].length }, rangeStart: absoluteStart, rangeEnd: bodyEnd + 1, localNames });
    match = matcher.exec(bodyMasked);
  }
  return methods;
}

function extractJavaPackageName(masked) {
  const match = masked.match(/(?:^|\n)\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)\s*;/m);
  return match ? match[1] : '';
}

function extractJavaImports(masked) {
  const imports = [];
  const matcher = /(?:^|\n)\s*import\s+(?:static\s+)?([A-Za-z_][A-Za-z0-9_.]*)(?:\.\*)?\s*;/gm;
  let match = matcher.exec(masked);
  while (match) {
    imports.push(match[1]);
    match = matcher.exec(masked);
  }
  return imports;
}

function buildJavaFileInfo(filePath) {
  const text = readText(filePath);
  const codeRanges = tokenizeJavaRanges(text);
  const { masked, spans } = collectIdentifierSpans(text, codeRanges);
  const classes = extractJavaClasses(masked).map((classInfo) => ({ ...classInfo, methods: extractJavaMethods(masked, classInfo) }));
  const packageName = extractJavaPackageName(masked);
  const imports = extractJavaImports(masked);
  const topLevelTypes = classes.map((classInfo) => classInfo.name);
  return { filePath, text, spans, classes, packageName, imports, topLevelTypes };
}

function buildJavaProjectGraph(baseDir) {
  const filePaths = collectFiles(baseDir, JAVA_EXTENSIONS);
  const infos = filePaths.map((filePath) => buildJavaFileInfo(filePath));
  const declarations = [];
  for (const info of infos) {
    for (const classInfo of info.classes) {
      declarations.push({
        name: classInfo.name,
        kind: classInfo.kind,
        packageName: info.packageName,
        fqcn: info.packageName ? `${info.packageName}.${classInfo.name}` : classInfo.name,
        filePath: info.filePath,
        classInfo,
        declarationSpan: classInfo.nameSpan,
      });
    }
  }
  return { infos, declarations };
}

function buildJavaTypeRenameScope(baseDir, name, preferredFilePath = '', toName = '') {
  const normalized = String(name || '').trim();
  const requestedToName = String(toName || '').trim();
  if (!normalized) return null;
  const graph = buildJavaProjectGraph(baseDir);
  let matches = graph.declarations.filter((item) => item.name === normalized);
  if (preferredFilePath) {
    const resolved = path.resolve(preferredFilePath);
    const preferred = matches.find((item) => item.filePath === resolved);
    if (preferred) matches = [preferred];
  }
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    const locations = matches.map((item) => item.fqcn).sort((left, right) => left.localeCompare(right));
    throw new Error(`Java indexed rename-symbol is ambiguous for ${normalized}; matching types found: ${locations.join(', ')}`);
  }
  const declaration = matches[0];
  if (requestedToName && requestedToName !== normalized) {
    const colliding = graph.declarations.find((item) => item.packageName === declaration.packageName && item.name === requestedToName && item.fqcn !== declaration.fqcn);
    if (colliding) {
      throw new Error(`Java indexed rename-symbol would collide with existing type ${colliding.fqcn}`);
    }
  }
  const relevantFiles = graph.infos
    .filter((info) => {
      if (info.filePath === declaration.filePath) return true;
      if (info.packageName && info.packageName === declaration.packageName) return true;
      if ((info.imports || []).includes(declaration.fqcn)) return true;
      return declaration.packageName && info.text.includes(declaration.fqcn);
    })
    .map((info) => info.filePath)
    .sort((left, right) => left.localeCompare(right));
  return {
    kind: 'project-type',
    filePaths: relevantFiles,
    name: declaration.name,
    symbol: declaration.fqcn,
    packageName: declaration.packageName,
    fqcn: declaration.fqcn,
    declarationFilePath: declaration.filePath,
    declaration: { filePath: declaration.filePath, span: declaration.declarationSpan },
    detail: `Java indexed type rename across ${relevantFiles.length} file(s) for ${declaration.fqcn}`,
  };
}

function findContainingJavaClass(classes, span) { return (classes || []).find((item) => item.rangeStart <= span.start && span.end <= item.rangeEnd) || null; }
function findContainingJavaMethod(methods, span) { return (methods || []).find((item) => item.rangeStart <= span.start && span.end <= item.rangeEnd) || null; }
function hasQualifier(text, spanStart, qualifier) { return text.slice(Math.max(0, spanStart - qualifier.length), spanStart) === qualifier; }

function buildJavaRenameAtScope(context) {
  const filePath = path.resolve(context.file);
  const info = buildJavaFileInfo(filePath);
  const offset = lineColToOffset(info.text, context.line, context.col);
  const selected = findIdentifierAtOffset(info.spans, offset);
  if (!selected) throw new Error(`cannot rename at ${context.file}:${context.line}:${context.col} (no identifier)`);
  const requestedToName = String(context.toName || '').trim();
  const classInfo = findContainingJavaClass(info.classes, selected);
  if (!classInfo) return { kind: 'file', filePath, rangeStart: 0, rangeEnd: info.text.length, name: selected.name, symbol: selected.name, detail: 'Java indexed rename in file scope' };
  if (classInfo.nameSpan.start === selected.start && classInfo.nameSpan.end === selected.end) {
    const projectScope = buildJavaTypeRenameScope(resolveBaseDir(context), selected.name, filePath, requestedToName);
    if (projectScope) return projectScope;
  }
  const method = findContainingJavaMethod(classInfo.methods, selected);
  const qualifiedField = hasQualifier(info.text, selected.start, 'this.') || hasQualifier(info.text, selected.start, 'super.');
  if (method && method.localNames.has(selected.name) && !qualifiedField && !(method.nameSpan.start === selected.start && method.nameSpan.end === selected.end)) {
    if (requestedToName && requestedToName !== selected.name && method.localNames.has(requestedToName)) {
      throw new Error(`Java indexed rename-at would collide with existing local binding ${requestedToName} in method ${method.name}`);
    }
    return { kind: 'method', filePath, rangeStart: method.rangeStart, rangeEnd: method.rangeEnd, name: selected.name, symbol: selected.name, detail: `Java indexed rename within method ${method.name}` };
  }
  return { kind: 'class', filePath, rangeStart: classInfo.rangeStart, rangeEnd: classInfo.rangeEnd, name: selected.name, symbol: selected.name, detail: `Java indexed rename within ${classInfo.kind} ${classInfo.name}` };
}

function shouldSkipJavaLocalShadow(fileInfo, span, name) {
  const classInfo = findContainingJavaClass(fileInfo.classes, span);
  const method = classInfo ? findContainingJavaMethod(classInfo.methods, span) : null;
  return Boolean(method && method.localNames.has(name) && !hasQualifier(fileInfo.text, span.start, 'this.') && !hasQualifier(fileInfo.text, span.start, 'super.') && !(method.nameSpan.start === span.start && method.nameSpan.end === span.end));
}

function collectJavaRenameTargets(fileInfo, name, scope) {
  const matches = [];
  for (const span of fileInfo.spans) {
    if (span.name !== name) continue;
    if (scope.kind === 'project-type') {
      if (!(scope.filePaths || []).includes(fileInfo.filePath)) continue;
      if (shouldSkipJavaLocalShadow(fileInfo, span, name)) continue;
      matches.push(span);
      continue;
    }
    if (scope.filePath !== fileInfo.filePath) continue;
    if (!(scope.rangeStart <= span.start && span.end <= scope.rangeEnd)) continue;
    if (scope.kind === 'method') { matches.push(span); continue; }
    if (scope.kind === 'class' && shouldSkipJavaLocalShadow(fileInfo, span, name)) continue;
    matches.push(span);
  }
  return matches;
}

function applyJavaIndexedRename(scope, toName, dryRun) {
  const files = scope.kind === 'project-type' ? (scope.filePaths || []) : [scope.filePath];
  let changedFiles = 0;
  let changedNodes = 0;
  for (const filePath of files) {
    const fileInfo = buildJavaFileInfo(filePath);
    const matches = collectJavaRenameTargets(fileInfo, scope.name, scope);
    if (matches.length === 0) continue;
    const result = applyIdentifierEdits(fileInfo.text, matches, toName);
    if (!result.changed) continue;
    changedFiles += 1;
    changedNodes += result.replacements;
    writeMaybe(filePath, result.next, dryRun);
  }
  return { changedFiles, changedNodes };
}

function findJavaAnchorForScope(scope) {
  if (scope && scope.declaration && scope.declaration.filePath && scope.declaration.span) {
    const info = buildJavaFileInfo(scope.declaration.filePath);
    return { file: scope.declaration.filePath, ...offsetToLineCol(info.text, scope.declaration.span.start) };
  }
  const files = scope.kind === 'project-type' ? (scope.filePaths || []) : [scope.filePath];
  for (const filePath of files) {
    const info = buildJavaFileInfo(filePath);
    for (const span of info.spans) {
      if (span.name !== scope.name) continue;
      if (scope.kind === 'project-type') {
        if (shouldSkipJavaLocalShadow(info, span, scope.name)) continue;
        return { file: filePath, ...offsetToLineCol(info.text, span.start) };
      }
      if (scope.filePath !== filePath) continue;
      if (!(scope.rangeStart <= span.start && span.end <= scope.rangeEnd)) continue;
      if (scope.kind === 'class' && shouldSkipJavaLocalShadow(info, span, scope.name)) continue;
      return { file: filePath, ...offsetToLineCol(info.text, span.start) };
    }
  }
  return null;
}

function tryJavaLspRename(context, scope, anchor) {
  if (!shouldAttemptLsp('java', context) || !anchor) return { attempted: false, result: null, error: null };
  try {
    return {
      attempted: true,
      result: runLspRenameSync('java', { ...context, operation: context.operation || 'rename' }, anchor, {
        detailPrefix: scope.detail.replace('indexed', 'LSP'),
      }),
      error: null,
    };
  } catch (error) {
    if (resolveBackendPreference('java', context) === 'lsp-required') throw new Error(`Java LSP rename failed: ${error.message} [${error.lspFailureKind || 'lsp_error'}]`);
    return { attempted: true, result: null, error };
  }
}

function annotateJavaFallback(result, lspAttempt) {
  if (!lspAttempt || !lspAttempt.attempted) return result;
  if (!lspAttempt.error) return { ...result, lsp_attempted: true };
  return {
    ...result,
    lsp_attempted: true,
    lsp_failed: true,
    lsp_failure_kind: lspAttempt.error.lspFailureKind || 'lsp_error',
    lsp_failure_message: lspAttempt.error.message,
    lsp_server: lspAttempt.error.lspServerCommand || 'jdtls',
    lsp_server_command_resolved: lspAttempt.error.lspServerCommandPath || '',
    backend_fallback: 'indexed_symbol',
  };
}

const provider = {
  id: 'java-semantic',
  label: 'Java indexed-symbol graph provider',
  execution_mode: 'indexed_symbol',
  supported_operations: ['rename-at', 'rename-symbol', 'add-import', 'remove-import', 'ensure-export'],
  supported_primitives: ['rename_at', 'rename_symbol', 'add_import', 'remove_import', 'ensure_export'],
  supported_languages: ['java'],
  cross_file_symbol_graph: true,
  ambiguity_safe: true,
  conflict_safe_failures: true,
  experimental_lsp_backend: true,
  lsp_server_command: 'jdtls',
  lsp_capability_negotiation: true,
  lsp_prepare_rename_support: true,
  lsp_workspace_resource_ops_support: true,
  lsp_server_requests_support: true,
  lsp_workspace_configuration_support: true,
  lsp_project_root_detection: true,
  lsp_server_probe_support: true,
  lsp_failure_classification: true,
  lsp_diagnostics_capture: true,
  lsp_edit_preview_support: true,
  lsp_edit_budget_guards: true,
  lsp_workspace_scope_guards: true,
  lsp_production_readiness_harness: true,
  lsp_real_server_required_for_claim: true,
  lsp_real_server_auto_discovery: true,
  lsp_production_matrix_support: true,
  backend_modes: ['indexed_symbol', 'semantic_ast'],
  isAvailable() { return true; },
  isLspAvailable(context = {}) { return isLspAvailable('java', context); },
  supportsOperation(operation, context = {}) {
    if (!this.supported_operations.includes(operation)) return false;
    if (context.file) return isJavaFile(context.file);
    return context.language === 'java' || collectFiles(resolveBaseDir(context), JAVA_EXTENSIONS).length > 0;
  },
  supportsPrimitive(primitive, context = {}) {
    if (!this.supported_primitives.includes(String(primitive || '').trim())) return false;
    if (context.file) return isJavaFile(context.file);
    return context.language === 'java' || collectFiles(resolveBaseDir(context), JAVA_EXTENSIONS).length > 0;
  },
  renameAt(context) {
    const scope = buildJavaRenameAtScope(context);
    const lspAttempt = tryJavaLspRename(context, scope, { file: path.resolve(context.file), line: Number(context.line), col: Number(context.col) });
    if (lspAttempt.result) return { ...lspAttempt.result, symbol: scope.symbol };
    const result = applyJavaIndexedRename(scope, String(context.toName || '').trim(), context.dryRun === true);
    return annotateJavaFallback({ ...result, symbol: scope.symbol, execution_mode: 'indexed_symbol', semantic: false, detail: scope.detail }, lspAttempt);
  },
  renameSymbol(context) {
    const indexedScope = buildJavaTypeRenameScope(resolveBaseDir(context), String(context.fromName || '').trim(), context.file ? path.resolve(context.file) : '', String(context.toName || '').trim());
    if (indexedScope) {
      const lspAttempt = tryJavaLspRename(context, indexedScope, findJavaAnchorForScope(indexedScope));
      if (lspAttempt.result) return { ...lspAttempt.result, symbol: indexedScope.symbol };
      const result = applyJavaIndexedRename(indexedScope, String(context.toName || '').trim(), context.dryRun === true);
      return annotateJavaFallback({ ...result, symbol: indexedScope.symbol, execution_mode: 'indexed_symbol', semantic: false, detail: indexedScope.detail }, lspAttempt);
    }
    const files = collectFiles(resolveBaseDir(context), JAVA_EXTENSIONS);
    const fromName = String(context.fromName || '').trim();
    const toName = String(context.toName || '').trim();
    const dryRun = context.dryRun === true;
    let changedFiles = 0;
    let changedNodes = 0;
    for (const file of files) {
      const original = readText(file);
      const result = renameJavaIdentifiers(original, fromName, toName);
      if (!result.changed) continue;
      changedFiles += 1;
      changedNodes += result.replacements;
      writeMaybe(file, result.next, dryRun);
    }
    return { changedFiles, changedNodes, execution_mode: 'token_aware', semantic: false, detail: 'Java token-aware rewrite' };
  },
  addImport(context) {
    const file = path.resolve(context.file);
    const original = readText(file);
    const result = addImportToJava(original, context.moduleName, context.importName);
    if (result.changed) writeMaybe(file, result.next, context.dryRun === true);
    return { changedFiles: result.changed ? 1 : 0, changedNodes: result.changed ? 1 : 0, execution_mode: 'token_aware', semantic: false, detail: result.detail.replace('semantic', 'token-aware') };
  },
  removeImport(context) {
    const file = path.resolve(context.file);
    const original = readText(file);
    const result = removeImportFromJava(original, context.moduleName, context.importName);
    if (result.changed) writeMaybe(file, result.next, context.dryRun === true);
    return { changedFiles: result.changed ? 1 : 0, changedNodes: result.changed ? 1 : 0, execution_mode: 'token_aware', semantic: false, detail: result.detail.replace('semantic', 'token-aware') };
  },
  ensureExport(context) {
    const file = path.resolve(context.file);
    const original = readText(file);
    const result = ensureJavaPublicExport(original, context.name, context.kind);
    if (result.changed) writeMaybe(file, result.next, context.dryRun === true);
    return { changedFiles: result.changed ? 1 : 0, changedNodes: result.changed ? 1 : 0, execution_mode: 'token_aware', semantic: false, detail: result.detail.replace('semantic', 'token-aware') };
  },
};

module.exports = { addImportToJava, ensureJavaPublicExport, provider, removeImportFromJava, renameJavaIdentifiers, tokenizeJavaRanges };
