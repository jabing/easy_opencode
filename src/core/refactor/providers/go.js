// @ts-nocheck
const fs = require('fs');
const path = require('path');
const { collectFiles } = require('../file-scan.js');
const { GO_EXTENSIONS, isGoFile } = require('../languages.js');
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

function quoteImportPath(moduleName) {
  return `"${String(moduleName || '').replace(/^"|"$/g, '')}"`;
}

function importStatement(moduleName, alias = '') {
  const quoted = quoteImportPath(moduleName);
  const normalizedAlias = String(alias || '').trim();
  return normalizedAlias ? `${normalizedAlias} ${quoted}` : quoted;
}

function tokenizeGoRanges(text) {
  const codeRanges = [];
  let inString = false;
  let inRawString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escape = false;
  let rangeStart = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        rangeStart = index + 1;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
        rangeStart = index + 1;
      }
      continue;
    }
    if (inString) {
      if (!escape && char === '"') {
        inString = false;
        rangeStart = index + 1;
      }
      escape = !escape && char === '\\';
      continue;
    }
    if (inRawString) {
      if (char === '`') {
        inRawString = false;
        rangeStart = index + 1;
      }
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
    if (char === '"') {
      if (rangeStart < index) codeRanges.push([rangeStart, index]);
      inString = true;
      escape = false;
      continue;
    }
    if (char === '`') {
      if (rangeStart < index) codeRanges.push([rangeStart, index]);
      inRawString = true;
      continue;
    }
  }
  if (!inLineComment && !inBlockComment && !inString && !inRawString && rangeStart < text.length) {
    codeRanges.push([rangeStart, text.length]);
  }
  return codeRanges;
}

function renameGoIdentifiers(text, fromName, toName) {
  if (!fromName || fromName === toName) return { changed: false, next: text, replacements: 0 };
  const matcher = new RegExp(`\\b${escapeRegExp(fromName)}\\b`, 'g');
  const ranges = tokenizeGoRanges(text);
  let next = text;
  let replacements = 0;
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const [start, end] = ranges[index];
    const segment = next.slice(start, end);
    const updated = segment.replace(matcher, () => {
      replacements += 1;
      return toName;
    });
    next = `${next.slice(0, start)}${updated}${next.slice(end)}`;
  }
  return { changed: replacements > 0, next, replacements };
}

function normalizeImportBlock(body) {
  return String(body || '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/g, '') + '\n';
}

function addGoImport(text, moduleName, alias = '') {
  const statement = importStatement(moduleName, alias);
  const normalized = readTextContent(text);
  if (normalized.split('\n').map((line) => line.trim()).includes(statement)) {
    return { changed: false, body: normalized, alreadyPresent: true };
  }
  const blockMatch = normalized.match(/import\s*\(([^]*?)\n\)/m);
  if (blockMatch && typeof blockMatch.index === 'number') {
    const insertAt = blockMatch.index + 'import (\n'.length;
    const body = `${normalized.slice(0, insertAt)}\t${statement}\n${normalized.slice(insertAt)}`;
    return { changed: true, body: normalizeImportBlock(body) };
  }
  const singleMatch = normalized.match(/^import\s+(.+)$/m);
  if (singleMatch && typeof singleMatch.index === 'number') {
    const lineStart = singleMatch.index;
    const lineEnd = lineStart + singleMatch[0].length;
    const body = `${normalized.slice(0, lineStart)}import (\n\t${singleMatch[1].trim()}\n\t${statement}\n)${normalized.slice(lineEnd)}`;
    return { changed: true, body: normalizeImportBlock(body) };
  }
  const packageMatch = normalized.match(/^package\s+\w+\n/m);
  if (packageMatch && typeof packageMatch.index === 'number') {
    const insertAt = packageMatch.index + packageMatch[0].length;
    const body = `${normalized.slice(0, insertAt)}\nimport (\n\t${statement}\n)\n${normalized.slice(insertAt)}`;
    return { changed: true, body: normalizeImportBlock(body) };
  }
  return { changed: true, body: normalizeImportBlock(`import (\n\t${statement}\n)\n${normalized}`) };
}

function removeGoImport(text, moduleName) {
  const normalized = readTextContent(text);
  const quoted = quoteImportPath(moduleName);
  const lines = normalized.split('\n');
  let changed = false;
  const kept = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed === quoted || trimmed.endsWith(` ${quoted}`) || trimmed === `import ${quoted}`) {
      changed = true;
      continue;
    }
    kept.push(line);
  }
  let body = kept.join('\n');
  body = body.replace(/import\s*\(\s*\n\)/g, '');
  return { changed, body: normalizeImportBlock(body), alreadyPresent: !changed };
}

function readTextContent(value) {
  return String(value || '').replace(/\r\n/g, '\n');
}

function exportedName(name) {
  const normalized = String(name || '');
  if (!normalized) return '';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function resolvePackageFiles(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  return fs.readdirSync(dir)
    .filter((entry) => entry.endsWith('.go'))
    .map((entry) => path.join(dir, entry))
    .sort((left, right) => left.localeCompare(right));
}

function extractGoBindingNamesFromList(listText) {
  const names = [];
  for (const segment of splitTopLevelCommaList(listText)) {
    const match = segment.match(/^\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s+(?:\.\.\.\s*)?(?:\*|\[|map\b|chan\b|func\b|interface\b|struct\b|[A-Za-z_])/);
    if (!match) continue;
    names.push(...match[1].split(',').map((item) => item.trim()).filter(Boolean));
  }
  return names;
}

function extractGoSignatureBindings(signatureText) {
  let cursor = String(signatureText || '').replace(/^\s*func\s*/, '');
  const names = [];
  if (cursor.startsWith('(')) {
    const end = findMatchingDelimiter(cursor, 0, '(', ')');
    if (end > 0) {
      names.push(...extractGoBindingNamesFromList(cursor.slice(1, end)));
      cursor = cursor.slice(end + 1).trimStart();
    }
  }
  const nameMatch = cursor.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
  if (!nameMatch) return names;
  cursor = cursor.slice(nameMatch[0].length).trimStart();
  if (!cursor.startsWith('(')) return names;
  const end = findMatchingDelimiter(cursor, 0, '(', ')');
  if (end < 0) return names;
  names.push(...extractGoBindingNamesFromList(cursor.slice(1, end)));
  return Array.from(new Set(names));
}

function extractGoLocalBindings(maskedBody) {
  const names = [];
  const patterns = [
    /\b(?:var|const)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /(^|[\s;({])([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s*:=/gm,
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(maskedBody);
    while (match) {
      const value = pattern === patterns[0] ? match[1] : match[2];
      names.push(...String(value || '').split(',').map((item) => item.trim()).filter(Boolean));
      match = pattern.exec(maskedBody);
    }
  }
  return Array.from(new Set(names));
}

function findGoSignatureBodyStart(maskedText, fromIndex) {
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let index = fromIndex; index < maskedText.length; index += 1) {
    const char = maskedText[index];
    if (char === '(') parenDepth += 1;
    else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (char === '[') bracketDepth += 1;
    else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === '{' && parenDepth === 0 && bracketDepth === 0) return index;
  }
  return -1;
}

function extractGoFunctions(text, masked) {
  const functions = [];
  let braceDepth = 0;
  for (let index = 0; index < masked.length; index += 1) {
    const char = masked[index];
    if (char === '{') {
      braceDepth += 1;
      continue;
    }
    if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (braceDepth !== 0 || !/^func\b/.test(masked.slice(index))) continue;
    const declMatch = /^func\s*(\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(masked.slice(index));
    if (!declMatch) continue;
    const name = declMatch[2];
    const nameOffset = declMatch[0].lastIndexOf(name);
    const nameStart = index + nameOffset;
    const nameEnd = nameStart + name.length;
    const bodyStart = findGoSignatureBodyStart(masked, index);
    if (bodyStart < 0) continue;
    const bodyEnd = findMatchingDelimiter(masked, bodyStart, '{', '}');
    if (bodyEnd < 0) continue;
    const signatureText = text.slice(index, bodyStart);
    const localNames = new Set([
      ...extractGoSignatureBindings(signatureText),
      ...extractGoLocalBindings(masked.slice(bodyStart + 1, bodyEnd)),
    ]);
    functions.push({ name, nameSpan: { start: nameStart, end: nameEnd }, rangeStart: index, rangeEnd: bodyEnd + 1, localNames });
    index = bodyEnd;
  }
  return functions;
}

function buildTopLevelDepthMap(maskedText) {
  let depth = 0;
  const map = new Array(maskedText.length).fill(0);
  for (let index = 0; index < maskedText.length; index += 1) {
    map[index] = depth;
    const char = maskedText[index];
    if (char === '{') depth += 1;
    else if (char === '}') depth = Math.max(0, depth - 1);
  }
  return map;
}

function isTopLevelAt(depthMap, index) {
  return (depthMap[index] || 0) === 0;
}

function pushTopLevelNames(target, value) {
  for (const name of String(value || '').split(',')) {
    const normalized = name.trim();
    if (normalized) target.add(normalized);
  }
}

function extractGoTopLevelDeclarations(masked) {
  const names = new Set();
  const depthMap = buildTopLevelDepthMap(masked);
  const patterns = [
    /(?:^|\n)\s*func\s*(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
    /(?:^|\n)\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm,
    /(?:^|\n)\s*(?:var|const)\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s*(?:(?:\.\.\.\s*)?(?:\*|\[|map\b|chan\b|func\b|interface\b|struct\b|[A-Za-z_])|=)/gm,
    /(?:^|\n)\s*(?:var|const)\s*\(([^]*?)\n\s*\)/gm,
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(masked);
    while (match) {
      if (isTopLevelAt(depthMap, match.index)) {
        if (pattern === patterns[3]) {
          const block = match[1] || '';
          const lineMatcher = /(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s+(?:(?:\.\.\.\s*)?(?:\*|\[|map\b|chan\b|func\b|interface\b|struct\b|[A-Za-z_])|=)/g;
          let lineMatch = lineMatcher.exec(block);
          while (lineMatch) {
            pushTopLevelNames(names, lineMatch[1]);
            lineMatch = lineMatcher.exec(block);
          }
        } else {
          pushTopLevelNames(names, match[1]);
        }
      }
      match = pattern.exec(masked);
    }
  }
  return Array.from(names).sort((left, right) => left.localeCompare(right));
}

function buildGoFileInfo(filePath) {
  const text = readText(filePath);
  const codeRanges = tokenizeGoRanges(text);
  const { masked, spans } = collectIdentifierSpans(text, codeRanges);
  const functions = extractGoFunctions(text, masked);
  const topLevelDeclarations = extractGoTopLevelDeclarations(masked);
  const topLevelDeclarationEntries = [];
  const seenDeclarationKeys = new Set();
  for (const name of topLevelDeclarations) {
    const declarationSpan = spans.find((span) => {
      if (span.name !== name) return false;
      if (!isTopLevelAt(buildTopLevelDepthMap(masked), span.start)) return false;
      const fn = findContainingGoFunction(functions, span);
      if (fn && fn.localNames.has(name) && !(fn.nameSpan.start === span.start && fn.nameSpan.end === span.end)) return false;
      return true;
    });
    if (!declarationSpan) continue;
    const key = `${name}:${declarationSpan.start}:${declarationSpan.end}`;
    if (seenDeclarationKeys.has(key)) continue;
    seenDeclarationKeys.add(key);
    topLevelDeclarationEntries.push({ name, span: { start: declarationSpan.start, end: declarationSpan.end } });
  }
  return { filePath, text, spans, functions, topLevelDeclarations, topLevelDeclarationEntries };
}

function buildGoPackageGraph(filePaths) {
  const infos = (filePaths || []).map((filePath) => buildGoFileInfo(filePath));
  const topLevelDeclarations = Array.from(new Set(infos.flatMap((info) => info.topLevelDeclarations || []))).sort((left, right) => left.localeCompare(right));
  const declarationMap = new Map();
  for (const info of infos) {
    for (const entry of info.topLevelDeclarationEntries || []) {
      if (!declarationMap.has(entry.name)) declarationMap.set(entry.name, []);
      declarationMap.get(entry.name).push({ filePath: info.filePath, span: entry.span });
    }
  }
  return {
    filePaths: infos.map((info) => info.filePath),
    infos,
    topLevelDeclarations,
    declarationMap,
    packageDir: infos.length > 0 ? path.dirname(infos[0].filePath) : '',
  };
}

function summarizeGoPackageGraphs(graphs) {
  return (graphs || []).map((graph) => path.relative(process.cwd(), graph.packageDir || path.dirname((graph.filePaths || [])[0] || '.')) || '.');
}

function buildGoRenameSymbolScope(context) {
  const fromName = String(context.fromName || '').trim();
  const toName = String(context.toName || '').trim();
  if (!fromName) return null;
  const files = collectFiles(resolveBaseDir(context), GO_EXTENSIONS);
  const byDir = new Map();
  for (const filePath of files) {
    const dir = path.dirname(filePath);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(filePath);
  }
  const matches = [];
  for (const filePaths of byDir.values()) {
    const graph = buildGoPackageGraph(filePaths.sort((left, right) => left.localeCompare(right)));
    if ((graph.topLevelDeclarations || []).includes(fromName)) matches.push(graph);
  }
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    const locations = summarizeGoPackageGraphs(matches);
    throw new Error(`Go indexed rename-symbol is ambiguous for ${fromName}; matching package declarations found in ${locations.join(', ')}`);
  }
  const graph = matches[0];
  if (toName && toName !== fromName && (graph.topLevelDeclarations || []).includes(toName)) {
    throw new Error(`Go indexed rename-symbol would collide with existing package declaration ${toName} in ${path.relative(process.cwd(), graph.packageDir || path.dirname(graph.filePaths[0] || '.')) || '.'}`);
  }
  const declaration = (graph.declarationMap.get(fromName) || [])[0] || null;
  return {
    kind: 'package',
    filePaths: graph.filePaths,
    name: fromName,
    symbol: fromName,
    packageDir: graph.packageDir,
    topLevelDeclarations: [...(graph.topLevelDeclarations || [])],
    declaration,
    detail: `Go indexed package rename across ${graph.filePaths.length} file(s)`,
  };
}

function findContainingGoFunction(functions, span) {
  return (functions || []).find((item) => item.rangeStart <= span.start && span.end <= item.rangeEnd) || null;
}

function collectGoRenameTargets(fileInfo, name, scope) {
  const matches = [];
  for (const span of fileInfo.spans) {
    if (span.name !== name) continue;
    if (scope.kind === 'function') {
      if (scope.filePath !== fileInfo.filePath) continue;
      if (scope.rangeStart <= span.start && span.end <= scope.rangeEnd) matches.push(span);
      continue;
    }
    const fn = findContainingGoFunction(fileInfo.functions, span);
    if (fn && fn.localNames.has(name) && !(fn.nameSpan.start === span.start && fn.nameSpan.end === span.end)) continue;
    matches.push(span);
  }
  return matches;
}

function applyGoIndexedRename(scope, toName, dryRun) {
  const files = scope.kind === 'function' ? [scope.filePath] : scope.filePaths;
  let changedFiles = 0;
  let changedNodes = 0;
  for (const filePath of files) {
    const fileInfo = buildGoFileInfo(filePath);
    const matches = collectGoRenameTargets(fileInfo, scope.name, scope);
    if (matches.length === 0) continue;
    const result = applyIdentifierEdits(fileInfo.text, matches, toName);
    if (!result.changed) continue;
    changedFiles += 1;
    changedNodes += result.replacements;
    writeMaybe(filePath, result.next, dryRun);
  }
  return { changedFiles, changedNodes };
}

function buildGoRenameAtScope(context) {
  const filePath = path.resolve(context.file);
  const info = buildGoFileInfo(filePath);
  const offset = lineColToOffset(info.text, context.line, context.col);
  const selected = findIdentifierAtOffset(info.spans, offset);
  if (!selected) throw new Error(`cannot rename at ${context.file}:${context.line}:${context.col} (no identifier)`);
  const requestedToName = String(context.toName || '').trim();
  const fn = findContainingGoFunction(info.functions, selected);
  if (fn && fn.localNames.has(selected.name) && !(fn.nameSpan.start === selected.start && fn.nameSpan.end === selected.end)) {
    if (requestedToName && requestedToName !== selected.name && fn.localNames.has(requestedToName)) {
      throw new Error(`Go indexed rename-at would collide with existing local binding ${requestedToName} in function ${fn.name}`);
    }
    return { kind: 'function', filePath, rangeStart: fn.rangeStart, rangeEnd: fn.rangeEnd, name: selected.name, symbol: selected.name, detail: `Go indexed rename within function ${fn.name}` };
  }
  const packageGraph = buildGoPackageGraph(resolvePackageFiles(filePath));
  if (requestedToName && requestedToName !== selected.name && (packageGraph.topLevelDeclarations || []).includes(requestedToName)) {
    throw new Error(`Go indexed rename-at would collide with existing package declaration ${requestedToName} in ${path.relative(process.cwd(), packageGraph.packageDir || path.dirname(filePath)) || '.'}`);
  }
  return {
    kind: 'package',
    filePaths: packageGraph.filePaths,
    name: selected.name,
    symbol: selected.name,
    packageDir: packageGraph.packageDir,
    topLevelDeclarations: [...(packageGraph.topLevelDeclarations || [])],
    detail: 'Go indexed rename across package files',
  };
}

function findGoAnchorForScope(scope) {
  if (scope && scope.declaration && scope.declaration.filePath && scope.declaration.span) {
    const info = buildGoFileInfo(scope.declaration.filePath);
    return { file: scope.declaration.filePath, ...offsetToLineCol(info.text, scope.declaration.span.start) };
  }
  const files = scope.kind === 'function' ? [scope.filePath] : (scope.filePaths || []);
  for (const filePath of files) {
    const info = buildGoFileInfo(filePath);
    for (const span of info.spans) {
      if (span.name !== scope.name) continue;
      if (scope.kind === 'function' && !(scope.rangeStart <= span.start && span.end <= scope.rangeEnd)) continue;
      const fn = findContainingGoFunction(info.functions, span);
      if (scope.kind !== 'function' && fn && fn.localNames.has(scope.name) && !(fn.nameSpan.start === span.start && fn.nameSpan.end === span.end)) continue;
      return { file: filePath, ...offsetToLineCol(info.text, span.start) };
    }
  }
  return null;
}

function tryGoLspRename(context, scope, anchor) {
  if (!shouldAttemptLsp('go', context) || !anchor) return { attempted: false, result: null, error: null };
  try {
    return {
      attempted: true,
      result: runLspRenameSync('go', { ...context, operation: context.operation || 'rename' }, anchor, {
        detailPrefix: scope.kind === 'function' ? scope.detail.replace('indexed', 'LSP') : scope.detail.replace('indexed', 'LSP'),
      }),
      error: null,
    };
  } catch (error) {
    if (resolveBackendPreference('go', context) === 'lsp-required') throw new Error(`Go LSP rename failed: ${error.message} [${error.lspFailureKind || 'lsp_error'}]`);
    return { attempted: true, result: null, error };
  }
}

function annotateGoFallback(result, lspAttempt) {
  if (!lspAttempt || !lspAttempt.attempted) return result;
  if (!lspAttempt.error) return { ...result, lsp_attempted: true };
  return {
    ...result,
    lsp_attempted: true,
    lsp_failed: true,
    lsp_failure_kind: lspAttempt.error.lspFailureKind || 'lsp_error',
    lsp_failure_message: lspAttempt.error.message,
    lsp_server: lspAttempt.error.lspServerCommand || 'gopls',
    lsp_server_command_resolved: lspAttempt.error.lspServerCommandPath || '',
    backend_fallback: 'indexed_symbol',
  };
}

const provider = {
  id: 'go-semantic',
  label: 'Go indexed-symbol graph provider',
  execution_mode: 'indexed_symbol',
  supported_operations: ['rename-at', 'rename-symbol', 'add-import', 'remove-import', 'ensure-export'],
  supported_primitives: ['rename_at', 'rename_symbol', 'add_import', 'remove_import', 'ensure_export'],
  supported_languages: ['go'],
  cross_file_symbol_graph: true,
  ambiguity_safe: true,
  conflict_safe_failures: true,
  experimental_lsp_backend: true,
  lsp_server_command: 'gopls',
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
  isLspAvailable(context = {}) { return isLspAvailable('go', context); },
  supportsOperation(operation, context = {}) {
    if (!this.supported_operations.includes(operation)) return false;
    if (context.file) return isGoFile(context.file);
    return context.language === 'go' || collectFiles(resolveBaseDir(context), GO_EXTENSIONS).length > 0;
  },
  supportsPrimitive(primitive, context = {}) {
    if (!this.supported_primitives.includes(String(primitive || '').trim())) return false;
    if (context.file) return isGoFile(context.file);
    return context.language === 'go' || collectFiles(resolveBaseDir(context), GO_EXTENSIONS).length > 0;
  },
  renameAt(context) {
    const scope = buildGoRenameAtScope(context);
    const lspAttempt = tryGoLspRename(context, scope, { file: path.resolve(context.file), line: Number(context.line), col: Number(context.col) });
    if (lspAttempt.result) return { ...lspAttempt.result, symbol: scope.symbol };
    const result = applyGoIndexedRename(scope, String(context.toName || '').trim(), context.dryRun === true);
    return annotateGoFallback({ ...result, symbol: scope.symbol, execution_mode: 'indexed_symbol', semantic: false, detail: scope.detail }, lspAttempt);
  },
  renameSymbol(context) {
    const indexedScope = buildGoRenameSymbolScope(context);
    if (indexedScope) {
      const lspAttempt = tryGoLspRename(context, indexedScope, findGoAnchorForScope(indexedScope));
      if (lspAttempt.result) return { ...lspAttempt.result, symbol: indexedScope.symbol };
      const result = applyGoIndexedRename(indexedScope, String(context.toName || '').trim(), context.dryRun === true);
      return annotateGoFallback({ ...result, symbol: indexedScope.symbol, execution_mode: 'indexed_symbol', semantic: false, detail: indexedScope.detail }, lspAttempt);
    }
    const files = collectFiles(resolveBaseDir(context), GO_EXTENSIONS);
    let changedFiles = 0;
    let changedNodes = 0;
    for (const file of files) {
      const original = readText(file);
      const result = renameGoIdentifiers(original, String(context.fromName || '').trim(), String(context.toName || '').trim());
      if (!result.changed) continue;
      changedFiles += 1;
      changedNodes += result.replacements;
      writeMaybe(file, result.next, context.dryRun === true);
    }
    return { changedFiles, changedNodes, execution_mode: 'token_aware', semantic: false, detail: 'Go token-aware rename via identifier-safe edits' };
  },
  addImport(context) {
    const filePath = path.resolve(context.file);
    const original = readText(filePath);
    const result = addGoImport(original, String(context.moduleName || '').trim(), context.alias ? String(context.alias).trim() : '');
    if (result.changed) writeMaybe(filePath, result.body, context.dryRun === true);
    return { changedFiles: result.alreadyPresent ? 0 : (result.changed ? 1 : 0), changedNodes: result.alreadyPresent ? 0 : (result.changed ? 1 : 0), execution_mode: 'token_aware', semantic: false, detail: result.changed ? 'Go token-aware import update' : 'Go token-aware import already present' };
  },
  removeImport(context) {
    const filePath = path.resolve(context.file);
    const original = readText(filePath);
    const result = removeGoImport(original, String(context.moduleName || '').trim());
    if (result.changed) writeMaybe(filePath, result.body, context.dryRun === true);
    return { changedFiles: result.changed ? 1 : 0, changedNodes: result.changed ? 1 : 0, execution_mode: 'token_aware', semantic: false, detail: result.changed ? 'Go token-aware import removal' : 'Go import removal already satisfied' };
  },
  ensureExport(context) {
    const originalName = String(context.name || '').trim();
    const nextName = exportedName(originalName);
    if (!originalName || originalName === nextName) return { changedFiles: 0, changedNodes: 0, execution_mode: 'token_aware', semantic: false, detail: 'Go symbol already exported' };
    const files = resolvePackageFiles(context.file);
    let changedFiles = 0;
    let changedNodes = 0;
    for (const file of files) {
      const original = readText(file);
      const result = renameGoIdentifiers(original, originalName, nextName);
      if (!result.changed) continue;
      changedFiles += 1;
      changedNodes += result.replacements;
      writeMaybe(file, result.next, context.dryRun === true);
    }
    return { changedFiles, changedNodes, execution_mode: 'token_aware', semantic: false, detail: `Promoted Go symbol ${originalName} to exported ${nextName}` };
  },
};

module.exports = { addGoImport, provider, removeGoImport, renameGoIdentifiers, tokenizeGoRanges };
