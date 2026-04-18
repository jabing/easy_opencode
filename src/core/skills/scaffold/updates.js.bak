// @ts-nocheck
const fs = require('fs');
const path = require('path');
const { ensureDirForFile } = require('../../../shared/fs.js');
const { resolveScaffoldPrimitive } = require('../../code-primitives.js');
const { renderString } = require('./naming.js');

function normalizeUpdateText(text) {
  return String(text || '').replace(/\r\n/g, '\n').trim();
}

function appendBlockToText(existing, block) {
  const current = String(existing || '');
  const normalizedCurrent = current.replace(/\r\n/g, '\n');
  const trimmedCurrent = normalizedCurrent.replace(/\s+$/g, '');
  const normalizedBlock = normalizeUpdateText(block);
  if (!normalizedBlock) return { changed: false, body: current };
  if (normalizeUpdateText(normalizedCurrent).includes(normalizedBlock)) {
    return { changed: false, body: current, alreadyPresent: true };
  }
  const separator = trimmedCurrent ? '\n\n' : '';
  return { changed: true, body: `${trimmedCurrent}${separator}${normalizedBlock}\n` };
}

function prependBlockToText(existing, block) {
  const current = String(existing || '');
  const normalizedCurrent = current.replace(/\r\n/g, '\n');
  const normalizedBlock = normalizeUpdateText(block);
  if (!normalizedBlock) return { changed: false, body: current };
  if (normalizeUpdateText(normalizedCurrent).includes(normalizedBlock)) {
    return { changed: false, body: current, alreadyPresent: true };
  }
  const suffix = normalizedCurrent.trim() ? `\n\n${normalizedCurrent.replace(/^\n+/g, '')}` : '\n';
  return { changed: true, body: `${normalizedBlock}${suffix}` };
}

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function renderValue(value, vars) {
  if (typeof value === 'string') return renderString(value, vars);
  if (Array.isArray(value)) return value.map((item) => renderValue(item, vars));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) out[key] = renderValue(entry, vars);
  return out;
}

function compileAnchor(anchor) {
  if (!anchor) return null;
  if (anchor.regex) {
    return { kind: 'regex', matcher: new RegExp(String(anchor.regex), anchor.flags || '') };
  }
  if (anchor.literal !== undefined) {
    return { kind: 'literal', matcher: String(anchor.literal) };
  }
  if (typeof anchor === 'string') {
    return { kind: 'literal', matcher: anchor };
  }
  return null;
}

function findAnchorRange(text, anchorSpec) {
  const compiled = compileAnchor(anchorSpec);
  if (!compiled) return null;
  if (compiled.kind === 'literal') {
    const idx = text.indexOf(compiled.matcher);
    if (idx === -1) return null;
    return { start: idx, end: idx + compiled.matcher.length, match: compiled.matcher };
  }
  const match = compiled.matcher.exec(text);
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length, match: match[0] };
}

function resolveLocator(update, projectRoot, vars) {
  const locator = renderValue(update.locator || update.target_locator || {}, vars) || {};
  const candidates = [];
  const explicitFile = renderString(update.file || '', vars);
  if (explicitFile) candidates.push(explicitFile);
  for (const item of coerceArray(locator.candidates || locator.files)) {
    const rendered = String(item || '').trim();
    if (rendered && !candidates.includes(rendered)) candidates.push(rendered);
  }
  const fallback = String(locator.default || locator.fallback || '').trim();
  if (fallback && !candidates.includes(fallback)) candidates.push(fallback);
  const strategy = String(locator.strategy || (explicitFile ? 'explicit' : 'first_existing')).trim() || 'first_existing';
  const createIfMissing = locator.create_if_missing !== undefined ? Boolean(locator.create_if_missing) : undefined;
  const onlyIfExists = locator.only_if_exists !== undefined ? Boolean(locator.only_if_exists) : undefined;
  const matched = candidates.find((candidate) => fs.existsSync(path.resolve(projectRoot, candidate)));
  if (matched) {
    return {
      file: matched,
      matched: true,
      strategy,
      candidates,
      create_if_missing: createIfMissing,
      only_if_exists: onlyIfExists,
      label: locator.label || null,
    };
  }
  if (strategy === 'explicit' && explicitFile) {
    return {
      file: explicitFile,
      matched: false,
      strategy,
      candidates,
      create_if_missing: createIfMissing,
      only_if_exists: onlyIfExists,
      label: locator.label || null,
    };
  }
  if (fallback) {
    return {
      file: fallback,
      matched: false,
      strategy,
      candidates,
      create_if_missing: createIfMissing,
      only_if_exists: onlyIfExists,
      label: locator.label || null,
    };
  }
  if (candidates[0]) {
    return {
      file: candidates[0],
      matched: false,
      strategy,
      candidates,
      create_if_missing: createIfMissing,
      only_if_exists: onlyIfExists,
      label: locator.label || null,
    };
  }
  return {
    file: '',
    matched: false,
    strategy,
    candidates,
    create_if_missing: createIfMissing,
    only_if_exists: onlyIfExists,
    label: locator.label || null,
  };
}

function normalizeNewline(body) {
  return String(body || '').replace(/\r\n/g, '\n');
}

function lineBoundsForIndex(text, index) {
  const normalized = normalizeNewline(text);
  const safeIndex = Math.max(0, Math.min(normalized.length, index));
  const start = normalized.lastIndexOf('\n', Math.max(safeIndex - 1, 0));
  const lineStart = start === -1 ? 0 : start + 1;
  const end = normalized.indexOf('\n', safeIndex);
  const lineEnd = end === -1 ? normalized.length : end;
  const line = normalized.slice(lineStart, lineEnd);
  return { lineStart, lineEnd, line };
}

function indentTextBlock(block, indent) {
  const normalizedBlock = normalizeUpdateText(block);
  if (!normalizedBlock) return '';
  const prefix = String(indent || '');
  return normalizedBlock.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n');
}

function resolveAnchorIndentation(text, anchorRange, options = {}) {
  const mode = String(options.indent_mode || 'none').trim().toLowerCase();
  if (!anchorRange || !mode || mode === 'none') return '';
  const { line } = lineBoundsForIndex(text, anchorRange.start);
  const anchorIndent = (line.match(/^\s*/) || [''])[0];
  const trimmed = line.trim();
  if (mode === 'anchor') return anchorIndent;
  if (mode === 'anchor_block') return `${anchorIndent}${String(options.indent_unit || '    ')}`;
  if (mode === 'auto') {
    if (trimmed.endsWith(':')) return `${anchorIndent}${String(options.indent_unit || '    ')}`;
    return anchorIndent;
  }
  return '';
}

function insertRelativeToAnchor(existing, block, options = {}) {
  const current = normalizeNewline(existing);
  const normalizedBlock = normalizeUpdateText(block);
  if (!normalizedBlock) return { changed: false, body: existing };
  const anchorRange = findAnchorRange(current, options.anchor);
  if (!anchorRange) {
    return { changed: false, body: existing, missingAnchor: true };
  }
  const mode = String(options.position || 'after').toLowerCase();
  const indentation = resolveAnchorIndentation(current, anchorRange, options);
  const renderedBlock = indentation ? indentTextBlock(normalizedBlock, indentation) : normalizedBlock;
  if (normalizeUpdateText(current).includes(renderedBlock)) {
    return { changed: false, body: existing, alreadyPresent: true };
  }
  let insertionIndex = mode === 'before' ? anchorRange.start : anchorRange.end;
  if (mode === 'after_line') {
    const lineEnd = current.indexOf('\n', anchorRange.end);
    insertionIndex = lineEnd === -1 ? current.length : lineEnd + 1;
  } else if (mode === 'before_line') {
    const lineStart = current.lastIndexOf('\n', Math.max(anchorRange.start - 1, 0));
    insertionIndex = lineStart === -1 ? 0 : lineStart + 1;
  }
  let prefix = current.slice(0, insertionIndex);
  let suffix = current.slice(insertionIndex);
  const wantsBlankLine = Boolean(options.blank_line !== false);
  const insertText = wantsBlankLine ? `${renderedBlock}\n` : renderedBlock;
  if (prefix && !prefix.endsWith('\n')) prefix += '\n';
  if (suffix && !suffix.startsWith('\n')) suffix = `\n${suffix}`;
  if (wantsBlankLine && suffix.startsWith('\n') && !suffix.startsWith('\n\n')) suffix = `\n${suffix}`;
  return { changed: true, body: `${prefix}${insertText}${suffix}` };
}

function insertImportStatement(existing, statement, options = {}) {
  const current = normalizeNewline(existing);
  const normalizedStatement = normalizeUpdateText(statement);
  if (!normalizedStatement) return { changed: false, body: existing };
  if (current.split('\n').map((line) => line.trim()).includes(normalizedStatement)) {
    return { changed: false, body: existing, alreadyPresent: true };
  }
  const lines = current ? current.split('\n') : [];
  let packageLineIndex = -1;
  let lastImportIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('package ')) packageLineIndex = i;
    if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) lastImportIndex = i;
  }
  let insertionIndex = lastImportIndex >= 0 ? lastImportIndex + 1 : (packageLineIndex >= 0 ? packageLineIndex + 1 : 0);
  if (options.anchor) {
    const anchorRange = findAnchorRange(current, options.anchor);
    if (anchorRange) {
      const prefix = current.slice(0, anchorRange.start);
      insertionIndex = prefix.split('\n').length - 1;
    }
  }
  let renderedStatement = normalizedStatement;
  const previousLine = lines[Math.max(0, insertionIndex - 1)] || '';
  if (previousLine.trim() === 'import (' && !/^\s/.test(renderedStatement)) {
    renderedStatement = `${String(options.indent_statement || '\t')}${renderedStatement}`;
  }
  const nextLines = [...lines];
  nextLines.splice(insertionIndex, 0, renderedStatement);
  const body = `${nextLines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/g, '')}\n`;
  return { changed: true, body };
}

function parseSimplePythonAllNames(body) {
  const match = normalizeNewline(body).match(/^__all__\s*=\s*\[([^\]]*)\]/m);
  if (!match) return null;
  const names = match[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^['"]|['"]$/g, ''));
  return { raw: match[0], names };
}

function ensurePythonAllExport(existing, exportName) {
  const normalizedName = String(exportName || '').trim();
  if (!normalizedName) return { changed: false, body: existing };
  const current = normalizeNewline(existing);
  const parsed = parseSimplePythonAllNames(current);
  if (parsed) {
    if (parsed.names.includes(normalizedName)) {
      return { changed: false, body: existing, alreadyPresent: true };
    }
    const nextNames = [...parsed.names, normalizedName];
    const nextLine = `__all__ = [${nextNames.map((name) => JSON.stringify(name)).join(', ')}]`;
    return { changed: true, body: `${current.replace(parsed.raw, nextLine).replace(/\s+$/g, '')}\n` };
  }
  return appendBlockToText(current, `__all__ = [${JSON.stringify(normalizedName)}]`);
}

function deriveExportName(update) {
  const explicit = String(update.export_name || update.export_symbol || '').trim();
  if (explicit) return explicit;
  const statement = String(update.export_statement || '').trim();
  const directMatch = statement.match(/^__all__\s*=\s*\[(.*)\]$/m);
  if (!directMatch) return '';
  const parts = directMatch[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^['"]|['"]$/g, ''));
  return parts[parts.length - 1] || '';
}

function resolvePatchStrategy(update, primitive) {
  const strategy = String(update.strategy || update.insert_strategy || '').trim().toLowerCase();
  if (strategy) return strategy;
  if (primitive === 'add_import') return 'import';
  if (primitive === 'insert_registration') return 'after_anchor';
  return 'append';
}

function applyBasicPatch(existing, content, patch = {}) {
  const primitive = resolveScaffoldPrimitive(patch);
  const strategy = resolvePatchStrategy(patch, primitive);
  const anchor = patch.anchor || patch.insert_anchor || patch.before_anchor || patch.after_anchor || null;
  if (primitive === 'add_import') {
    return insertImportStatement(existing, content, { anchor });
  }
  if (strategy === 'prepend') return prependBlockToText(existing, content);
  if (strategy === 'insert_after' || strategy === 'after_anchor') {
    return insertRelativeToAnchor(existing, content, { anchor, position: 'after_line', blank_line: patch.blank_line, indent_mode: patch.indent_mode, indent_unit: patch.indent_unit });
  }
  if (strategy === 'insert_before' || strategy === 'before_anchor') {
    return insertRelativeToAnchor(existing, content, { anchor, position: 'before_line', blank_line: patch.blank_line, indent_mode: patch.indent_mode, indent_unit: patch.indent_unit });
  }
  if (anchor) {
    const defaultPosition = patch.before_anchor ? 'before_line' : 'after_line';
    return insertRelativeToAnchor(existing, content, { anchor, position: defaultPosition, blank_line: patch.blank_line, indent_mode: patch.indent_mode, indent_unit: patch.indent_unit });
  }
  return primitive === 'ensure_line'
    ? appendBlockToText(existing, normalizeUpdateText(content))
    : appendBlockToText(existing, content);
}

function applyPatchWithFallback(existing, content, patch = {}) {
  const outcome = applyBasicPatch(existing, content, patch);
  if (!outcome.missingAnchor) return outcome;
  const fallback = String(patch.on_missing_anchor || '').trim().toLowerCase();
  if (fallback === 'append') return { ...appendBlockToText(existing, content), missingAnchor: false, fellBack: 'append' };
  if (fallback === 'prepend') return { ...prependBlockToText(existing, content), missingAnchor: false, fellBack: 'prepend' };
  return outcome;
}

function createCompositeState(existing) {
  return {
    body: normalizeNewline(existing),
    changed: false,
    alreadyPresent: true,
    missingAnchors: [],
    fallbacks: [],
    segments: [],
  };
}

function mergeCompositeState(state, outcome, segment) {
  const next = {
    ...state,
    body: outcome.body !== undefined ? outcome.body : state.body,
    changed: Boolean(state.changed || outcome.changed),
    alreadyPresent: Boolean(state.alreadyPresent && !outcome.changed && outcome.alreadyPresent !== false),
    missingAnchors: [...state.missingAnchors],
    fallbacks: [...state.fallbacks],
    segments: [...state.segments],
  };
  if (outcome.missingAnchor) next.missingAnchors.push(segment.kind);
  if (Array.isArray(outcome.missingAnchors)) next.missingAnchors.push(...outcome.missingAnchors);
  if (outcome.fellBack) next.fallbacks.push({ kind: segment.kind, strategy: outcome.fellBack });
  if (Array.isArray(outcome.fallbacks)) next.fallbacks.push(...outcome.fallbacks);
  next.segments.push({
    kind: segment.kind,
    primitive: resolveScaffoldPrimitive(segment.patch),
    changed: Boolean(outcome.changed),
    already_present: Boolean(outcome.alreadyPresent),
    missing_anchor: Boolean(outcome.missingAnchor),
    fallback_strategy: outcome.fellBack || null,
  });
  return next;
}

function applyCompositeSegments(existing, segments) {
  let state = createCompositeState(existing);
  for (const segment of segments) {
    const content = normalizeUpdateText(segment.content);
    if (!content) continue;
    const outcome = applyPatchWithFallback(state.body, content, segment.patch || {});
    state = mergeCompositeState(state, outcome, segment);
  }
  return state;
}

function normalizeSegment(kind, update, defaults = {}) {
  const contentKey = `${kind}_statement`;
  const strategyKey = `${kind}_strategy`;
  const anchorKey = `${kind}_anchor`;
  const onMissingAnchorKey = `on_missing_${kind}_anchor`;
  const content = kind === 'content'
    ? (update.content || defaults.content || '')
    : (update[contentKey] || update[`${kind}_content`] || defaults.content || '');
  return {
    kind,
    content,
    patch: {
      type: defaults.type || update.type || 'ensure_block',
      primitive: defaults.primitive,
      strategy: update[strategyKey] || defaults.strategy || update.strategy,
      anchor: update[anchorKey] || defaults.anchor || update.anchor,
      blank_line: update[`${kind}_blank_line`] !== undefined ? update[`${kind}_blank_line`] : (defaults.blank_line !== undefined ? defaults.blank_line : update.blank_line),
      indent_mode: update[`${kind}_indent_mode`] || defaults.indent_mode || update.indent_mode,
      indent_unit: update[`${kind}_indent_unit`] || defaults.indent_unit || update.indent_unit,
      on_missing_anchor: update[onMissingAnchorKey] || defaults.on_missing_anchor || update.on_missing_anchor,
      before_anchor: defaults.before_anchor,
      after_anchor: defaults.after_anchor,
    },
  };
}

function summarizeUpdateContent(update, primitive) {
  if (['register_route', 'register_provider', 'patch_framework_entry'].includes(primitive)) {
    return [update.import_statement, update.registration_statement, update.export_statement].filter(Boolean).join('\n');
  }
  if (primitive === 'ensure_module_export') {
    return [update.import_statement, update.export_statement, update.content].filter(Boolean).join('\n');
  }
  if (primitive === 'insert_registration') {
    return String(update.registration_statement || update.content || '');
  }
  if (primitive === 'add_import') {
    return String(update.import_statement || update.content || '');
  }
  return String(update.content || '');
}

function applyEnsureModuleExport(existing, update, context = {}) {
  const state = createCompositeState(existing);
  let nextState = state;
  const importSegment = normalizeSegment('import', update, { primitive: 'add_import', type: 'insert_import' });
  if (normalizeUpdateText(importSegment.content)) {
    nextState = mergeCompositeState(nextState, applyPatchWithFallback(nextState.body, importSegment.content, importSegment.patch), importSegment);
  }

  const isPythonModule = String(context.filePath || '').endsWith('.py');
  const exportName = deriveExportName(update);
  if (isPythonModule && exportName) {
    const exportOutcome = ensurePythonAllExport(nextState.body, exportName);
    nextState = mergeCompositeState(nextState, exportOutcome, {
      kind: 'export',
      patch: { primitive: 'ensure_module_export', type: 'ensure_module_export' },
    });
  } else {
    const exportSegment = normalizeSegment('export', update, { primitive: 'ensure_module_export', type: 'ensure_module_export' });
    if (normalizeUpdateText(exportSegment.content)) {
      nextState = mergeCompositeState(nextState, applyPatchWithFallback(nextState.body, exportSegment.content, exportSegment.patch), exportSegment);
    }
  }

  const contentSegment = normalizeSegment('content', update, { primitive: 'ensure_module_export', type: 'ensure_block' });
  if (normalizeUpdateText(contentSegment.content)) {
    nextState = mergeCompositeState(nextState, applyPatchWithFallback(nextState.body, contentSegment.content, contentSegment.patch), contentSegment);
  }
  return nextState;
}

function applyPrimitiveUpdate(existing, update, primitive, context = {}) {
  if (primitive === 'register_route') {
    return applyCompositeSegments(existing, [
      normalizeSegment('import', update, { primitive: 'add_import', type: 'insert_import' }),
      normalizeSegment('registration', update, { primitive: 'insert_registration', type: 'insert_registration', strategy: 'after_anchor', on_missing_anchor: 'append', indent_mode: 'auto' }),
      normalizeSegment('export', update, { primitive: 'ensure_module_export', type: 'ensure_module_export' }),
    ]);
  }
  if (primitive === 'register_provider') {
    return applyCompositeSegments(existing, [
      normalizeSegment('import', update, { primitive: 'add_import', type: 'insert_import' }),
      normalizeSegment('registration', update, { primitive: 'insert_registration', type: 'insert_registration', strategy: 'after_anchor', on_missing_anchor: 'append', indent_mode: 'auto' }),
      normalizeSegment('export', update, { primitive: 'ensure_module_export', type: 'ensure_module_export' }),
    ]);
  }
  if (primitive === 'patch_framework_entry') {
    return applyCompositeSegments(existing, [
      normalizeSegment('import', update, { primitive: 'add_import', type: 'insert_import' }),
      normalizeSegment('registration', update, { primitive: 'insert_registration', type: 'insert_registration', strategy: 'after_anchor', on_missing_anchor: 'append', indent_mode: 'auto' }),
      normalizeSegment('export', update, { primitive: 'ensure_module_export', type: 'ensure_module_export' }),
    ]);
  }
  if (primitive === 'ensure_module_export') {
    return applyEnsureModuleExport(existing, update, context);
  }
  if (primitive === 'insert_registration') {
    return applyPatchWithFallback(existing, update.registration_statement || update.content || '', {
      ...update,
      primitive: 'insert_registration',
      anchor: update.registration_anchor || update.anchor,
      strategy: update.registration_strategy || update.strategy || 'after_anchor',
      indent_mode: update.registration_indent_mode || update.indent_mode,
      indent_unit: update.registration_indent_unit || update.indent_unit,
      on_missing_anchor: update.on_missing_registration_anchor || update.on_missing_anchor,
    });
  }
  if (primitive === 'add_import') {
    return applyPatchWithFallback(existing, update.import_statement || update.content || '', {
      ...update,
      primitive: 'add_import',
      type: 'insert_import',
      anchor: update.import_anchor || update.anchor,
    });
  }
  return applyPatchWithFallback(existing, update.content || '', { ...update, primitive });
}

function buildUpdateMetadata(type, primitive, locator, content, update) {
  return {
    type,
    primitive,
    file: locator.file,
    content,
    resolved_file: locator.file,
    locator: {
      strategy: locator.strategy,
      matched: Boolean(locator.matched),
      candidates: locator.candidates,
      label: locator.label || null,
    },
    patch_strategy: resolvePatchStrategy(update, primitive),
  };
}

function applyActionUpdates(action, projectRoot, vars, opts, integrationMode) {
  const updates = Array.isArray(action.updates) ? action.updates : [];
  if (integrationMode === 'skip') {
    return updates.map((rawUpdate) => {
      const update = renderValue(rawUpdate, vars);
      const primitive = resolveScaffoldPrimitive(update);
      const locator = resolveLocator(update, projectRoot, vars);
      return {
        ...buildUpdateMetadata(String(update.type || primitive), primitive, locator, summarizeUpdateContent(update, primitive), update),
        status: 'skipped_by_policy',
      };
    });
  }

  const results = [];
  for (const rawUpdate of updates) {
    const update = renderValue(rawUpdate, vars);
    const primitive = resolveScaffoldPrimitive(update);
    const type = String(update.type || primitive);
    const locator = resolveLocator(update, projectRoot, vars);
    const fileRel = locator.file;
    const absPath = fileRel ? path.resolve(projectRoot, fileRel) : '';
    const content = summarizeUpdateContent(update, primitive);
    const exists = absPath ? fs.existsSync(absPath) : false;
    const createIfMissing = locator.create_if_missing !== undefined ? locator.create_if_missing : Boolean(update.create_if_missing);
    const onlyIfExists = locator.only_if_exists !== undefined ? locator.only_if_exists : Boolean(update.only_if_exists);

    if (!fileRel) {
      results.push({ ...buildUpdateMetadata(type, primitive, locator, content, update), status: 'skipped_unresolved' });
      continue;
    }
    if (!exists && onlyIfExists) {
      results.push({ ...buildUpdateMetadata(type, primitive, locator, content, update), status: 'skipped_missing' });
      continue;
    }
    if (!exists && !createIfMissing && !onlyIfExists) {
      results.push({ ...buildUpdateMetadata(type, primitive, locator, content, update), status: 'skipped_missing' });
      continue;
    }

    const before = exists ? fs.readFileSync(absPath, 'utf8') : '';
    const outcome = applyPrimitiveUpdate(before, update, primitive, { filePath: absPath, file: fileRel });
    const anchor = update.anchor || update.registration_anchor || update.import_anchor || update.export_anchor || null;

    if (opts['dry-run'] || integrationMode === 'plan') {
      let status = outcome.alreadyPresent ? 'already_present' : (outcome.changed ? 'would_apply' : 'noop');
      if (outcome.missingAnchor || (Array.isArray(outcome.missingAnchors) && outcome.missingAnchors.length > 0)) status = 'skipped_anchor_missing';
      results.push({
        ...buildUpdateMetadata(type, primitive, locator, content, update),
        status,
        anchor,
        fallback_strategy: outcome.fellBack || (Array.isArray(outcome.fallbacks) && outcome.fallbacks.length > 0 ? outcome.fallbacks.map((item) => `${item.kind}:${item.strategy}`).join(',') : null),
        segments: outcome.segments || null,
      });
      continue;
    }

    if (outcome.changed) {
      ensureDirForFile(absPath);
      fs.writeFileSync(absPath, outcome.body, 'utf8');
      results.push({
        ...buildUpdateMetadata(type, primitive, locator, content, update),
        status: exists ? 'updated' : 'created',
        anchor,
        fallback_strategy: outcome.fellBack || (Array.isArray(outcome.fallbacks) && outcome.fallbacks.length > 0 ? outcome.fallbacks.map((item) => `${item.kind}:${item.strategy}`).join(',') : null),
        segments: outcome.segments || null,
      });
    } else if (outcome.missingAnchor || (Array.isArray(outcome.missingAnchors) && outcome.missingAnchors.length > 0)) {
      results.push({ ...buildUpdateMetadata(type, primitive, locator, content, update), status: 'skipped_anchor_missing', segments: outcome.segments || null });
    } else {
      results.push({ ...buildUpdateMetadata(type, primitive, locator, content, update), status: 'already_present', segments: outcome.segments || null });
    }
  }
  return results;
}

module.exports = {
  normalizeUpdateText,
  appendBlockToText,
  prependBlockToText,
  insertRelativeToAnchor,
  insertImportStatement,
  resolveLocator,
  applyActionUpdates,
  applyPrimitiveUpdate,
  summarizeUpdateContent,
};
