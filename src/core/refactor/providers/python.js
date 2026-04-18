const { execFileSync } = /** @type {{ execFileSync: (file: string, args?: readonly string[], options?: any) => string }} */ (/** @type {unknown} */ (require('child_process')));
const path = require('path');
const { collectFiles } = require('../file-scan.js');
const { PYTHON_EXTENSIONS, isPythonFile } = require('../languages.js');

/** @typedef {'rename_symbol'|'add_import'|'remove_import'|'ensure_export'} PythonProviderOperation */
/** @typedef {{ changedFiles?: number, changedNodes?: number, semantic?: boolean, detail?: string, already_present?: boolean, changed?: boolean }} PythonProviderResult */
/** @typedef {{ baseDir?: string, file?: string, language?: string, fromName?: string, toName?: string, moduleName?: string, importName?: string, alias?: string, name?: string, dryRun?: boolean }} PythonProviderContext */
/** @typedef {{ operation: PythonProviderOperation, dryRun?: boolean, files?: string[], file?: string, fromName?: string, toName?: string, moduleName?: string, importName?: string, alias?: string, name?: string }} PythonProviderPayload */

/** @type {string | null | undefined} */
let cachedPythonExecutable;

const PYTHON_PROVIDER_SCRIPT = String.raw`
import ast
import io
import json
import sys
import tokenize

payload = json.load(sys.stdin)
operation = payload.get('operation')
dry_run = bool(payload.get('dryRun'))


def compute_offsets(text):
    lines = text.splitlines(True)
    offsets = [0]
    total = 0
    for line in lines:
        total += len(line)
        offsets.append(total)
    return offsets


def to_offset(offsets, line, col):
    index = max(0, int(line) - 1)
    if index >= len(offsets):
        return offsets[-1]
    return offsets[index] + int(col)


def apply_replacements(text, replacements):
    next_text = text
    for replacement in sorted(replacements, key=lambda item: item['start'], reverse=True):
        next_text = next_text[:replacement['start']] + replacement['text'] + next_text[replacement['end']:]
    return next_text


def read_text(file_path):
    with open(file_path, 'r', encoding='utf8') as handle:
        return handle.read()


def write_text(file_path, body):
    with open(file_path, 'w', encoding='utf8') as handle:
        handle.write(body)


def ensure_trailing_newline(text):
    return text if not text or text.endswith('\n') else text + '\n'


def top_level_import_insert_line(source):
    insert_after = 0
    if source.body:
        first = source.body[0]
        if isinstance(first, ast.Expr) and isinstance(getattr(first, 'value', None), ast.Constant) and isinstance(first.value.value, str):
            insert_after = getattr(first, 'end_lineno', first.lineno)
    for node in source.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            insert_after = max(insert_after, getattr(node, 'end_lineno', node.lineno))
            continue
        if insert_after:
            break
    return insert_after


def insert_statement(text, statement, line_no):
    lines = text.splitlines(True)
    rendered = statement.rstrip('\n') + '\n'
    next_lines = list(lines)
    next_lines.insert(max(0, min(len(lines), int(line_no))), rendered)
    return ensure_trailing_newline(''.join(next_lines))


def existing_python_import(source, module_name, import_name, alias_name):
    for node in source.body:
        if isinstance(node, ast.ImportFrom) and (node.module or '') == module_name:
            for alias in node.names:
                if alias.name == import_name:
                    return (not alias_name) or alias.asname == alias_name
        if isinstance(node, ast.Import) and module_name == import_name:
            for alias in node.names:
                if alias.name == module_name:
                    return (not alias_name) or alias.asname == alias_name
    return False


def build_python_import_statement(module_name, import_name, alias_name):
    if module_name == import_name:
        return f'import {module_name} as {alias_name}' if alias_name else f'import {module_name}'
    return f'from {module_name} import {import_name} as {alias_name}' if alias_name else f'from {module_name} import {import_name}'


def rename_symbol_file(file_path, from_name, to_name):
    text = read_text(file_path)
    offsets = compute_offsets(text)
    replacements = []
    changed_nodes = 0
    for token in tokenize.generate_tokens(io.StringIO(text).readline):
        if token.type == tokenize.NAME and token.string == from_name:
            changed_nodes += 1
            replacements.append({
                'start': to_offset(offsets, token.start[0], token.start[1]),
                'end': to_offset(offsets, token.end[0], token.end[1]),
                'text': to_name,
            })
    if not replacements:
        return {'changed': False, 'changed_nodes': 0}
    next_text = apply_replacements(text, replacements)
    if not dry_run:
        write_text(file_path, next_text)
    return {'changed': True, 'changed_nodes': changed_nodes}


def add_import_file(file_path, module_name, import_name, alias_name):
    text = read_text(file_path)
    source = ast.parse(text or '\n', filename=file_path)
    if existing_python_import(source, module_name, import_name, alias_name):
        return {'changed': False, 'already_present': True}
    statement = build_python_import_statement(module_name, import_name, alias_name)
    next_text = insert_statement(text, statement, top_level_import_insert_line(source))
    if not dry_run:
        write_text(file_path, next_text)
    return {'changed': True}


def remove_import_file(file_path, module_name, import_name):
    text = read_text(file_path)
    source = ast.parse(text or '\n', filename=file_path)
    lines = text.splitlines(True)
    for node in source.body:
        if isinstance(node, ast.ImportFrom) and (node.module or '') == module_name:
            start = getattr(node, 'lineno', 1) - 1
            end = getattr(node, 'end_lineno', node.lineno)
            names = list(node.names)
            if import_name:
                names = [alias for alias in names if alias.name != import_name]
                if len(names) == len(node.names):
                    continue
            else:
                names = []
            next_lines = list(lines)
            if names:
                rebuilt = 'from {} import {}\n'.format(module_name, ', '.join(['{} as {}'.format(alias.name, alias.asname) if alias.asname else alias.name for alias in names]))
                next_lines[start:end] = [rebuilt]
            else:
                next_lines[start:end] = []
            next_text = ensure_trailing_newline(''.join(next_lines))
            if not dry_run:
                write_text(file_path, next_text)
            return {'changed': True}
        if isinstance(node, ast.Import):
            names = [alias for alias in node.names if alias.name != module_name]
            if len(names) == len(node.names):
                continue
            start = getattr(node, 'lineno', 1) - 1
            end = getattr(node, 'end_lineno', node.lineno)
            next_lines = list(lines)
            if names:
                rebuilt = 'import ' + ', '.join(['{} as {}'.format(alias.name, alias.asname) if alias.asname else alias.name for alias in names]) + '\n'
                next_lines[start:end] = [rebuilt]
            else:
                next_lines[start:end] = []
            next_text = ensure_trailing_newline(''.join(next_lines))
            if not dry_run:
                write_text(file_path, next_text)
            return {'changed': True}
    return {'changed': False}


def ensure_export_file(file_path, export_name):
    text = read_text(file_path)
    source = ast.parse(text or '\n', filename=file_path)
    lines = text.splitlines(True)
    for node in source.body:
        if not isinstance(node, ast.Assign):
            continue
        targets = [target for target in getattr(node, 'targets', []) if isinstance(target, ast.Name)]
        if not any(target.id == '__all__' for target in targets):
            continue
        names = []
        if isinstance(node.value, (ast.List, ast.Tuple)):
            for element in node.value.elts:
                if isinstance(element, ast.Constant) and isinstance(element.value, str):
                    names.append(element.value)
        if export_name in names:
            return {'changed': False, 'already_present': True}
        names.append(export_name)
        rebuilt = '__all__ = [{}]\n'.format(', '.join([json.dumps(name) for name in names]))
        start = getattr(node, 'lineno', 1) - 1
        end = getattr(node, 'end_lineno', node.lineno)
        next_lines = list(lines)
        next_lines[start:end] = [rebuilt]
        next_text = ensure_trailing_newline(''.join(next_lines))
        if not dry_run:
            write_text(file_path, next_text)
        return {'changed': True}
    next_text = insert_statement(text, '__all__ = [{}]'.format(json.dumps(export_name)), top_level_import_insert_line(source))
    if not dry_run:
        write_text(file_path, next_text)
    return {'changed': True}


if operation == 'rename_symbol':
    changed_files = 0
    changed_nodes = 0
    for file_path in payload.get('files') or []:
        result = rename_symbol_file(file_path, payload.get('fromName'), payload.get('toName'))
        if result.get('changed'):
            changed_files += 1
            changed_nodes += int(result.get('changed_nodes', 0))
    print(json.dumps({'changedFiles': changed_files, 'changedNodes': changed_nodes, 'semantic': True, 'detail': 'Python semantic rename via tokenize-aware identifier edits'}))
    raise SystemExit(0)

file_path = payload.get('file')
if not file_path:
    raise SystemExit('file is required for this operation')

if operation == 'add_import':
    result = add_import_file(file_path, payload.get('moduleName'), payload.get('importName'), payload.get('alias'))
    print(json.dumps({'changedFiles': 0 if result.get('already_present') else (1 if result.get('changed') else 0), 'changedNodes': 0 if result.get('already_present') else (1 if result.get('changed') else 0), 'semantic': True, 'detail': 'Python semantic import update' if result.get('changed') else 'Python semantic import already present'}))
    raise SystemExit(0)
if operation == 'remove_import':
    result = remove_import_file(file_path, payload.get('moduleName'), payload.get('importName'))
    print(json.dumps({'changedFiles': 1 if result.get('changed') else 0, 'changedNodes': 1 if result.get('changed') else 0, 'semantic': True, 'detail': 'Python semantic import removal' if result.get('changed') else 'Python import removal already satisfied'}))
    raise SystemExit(0)
if operation == 'ensure_export':
    result = ensure_export_file(file_path, payload.get('name'))
    print(json.dumps({'changedFiles': 0 if result.get('already_present') else (1 if result.get('changed') else 0), 'changedNodes': 0 if result.get('already_present') else (1 if result.get('changed') else 0), 'semantic': True, 'detail': 'Python semantic export update' if result.get('changed') else 'Python __all__ export already present'}))
    raise SystemExit(0)
raise SystemExit('unsupported python semantic operation: {}'.format(operation))
`;

/** @returns {string | null} */
function resolvePythonExecutable() {
  if (cachedPythonExecutable !== undefined) return cachedPythonExecutable;
  for (const candidate of ['python3', 'python']) {
    try {
      execFileSync(candidate, ['-c', 'import sys; print(sys.version_info[0])'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      cachedPythonExecutable = candidate;
      return cachedPythonExecutable;
    } catch {
      // try next candidate
    }
  }
  cachedPythonExecutable = null;
  return cachedPythonExecutable;
}

/** @param {PythonProviderPayload} payload @returns {PythonProviderResult} */
function runPythonProvider(payload) {
  const executable = resolvePythonExecutable();
  if (!executable) throw new Error('Python semantic provider requires python3 or python on PATH');
  const stdout = execFileSync(executable, ['-c', PYTHON_PROVIDER_SCRIPT], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  });
  return /** @type {PythonProviderResult} */ (JSON.parse(stdout));
}

/** @param {PythonProviderContext} [context] @returns {string} */
function resolveBaseDir(context = {}) {
  if (context.baseDir) return path.resolve(context.baseDir);
  if (context.file) return path.dirname(path.resolve(context.file));
  return process.cwd();
}

const provider = {
  id: 'python-semantic',
  label: 'Python semantic provider',
  execution_mode: 'semantic_ast',
  supported_operations: ['rename-symbol', 'add-import', 'remove-import', 'ensure-export'],
  supported_primitives: ['rename_symbol', 'add_import', 'remove_import', 'ensure_export'],
  supported_languages: ['python'],
  isAvailable() {
    return Boolean(resolvePythonExecutable());
  },
  /** @param {string} operation @param {PythonProviderContext} [context] */
  supportsOperation(operation, context = {}) {
    if (!this.isAvailable()) return false;
    if (!this.supported_operations.includes(operation)) return false;
    if (context.file) return isPythonFile(context.file);
    return context.language === 'python' || collectFiles(resolveBaseDir(context), PYTHON_EXTENSIONS).length > 0;
  },
  /** @param {string} primitive @param {PythonProviderContext} [context] */
  supportsPrimitive(primitive, context = {}) {
    if (!this.isAvailable()) return false;
    if (!this.supported_primitives.includes(String(primitive || '').trim())) return false;
    if (context.file) return isPythonFile(context.file);
    return context.language === 'python' || collectFiles(resolveBaseDir(context), PYTHON_EXTENSIONS).length > 0;
  },
  /** @param {PythonProviderContext} context */
  renameSymbol(context) {
    const result = runPythonProvider({
      operation: 'rename_symbol',
      files: collectFiles(resolveBaseDir(context), PYTHON_EXTENSIONS),
      fromName: String(context.fromName || '').trim(),
      toName: String(context.toName || '').trim(),
      dryRun: context.dryRun === true,
    });
    return { ...result, execution_mode: 'semantic_ast', semantic: true };
  },
  /** @param {PythonProviderContext} context */
  addImport(context) {
    const result = runPythonProvider({
      operation: 'add_import',
      file: path.resolve(String(context.file || '')),
      moduleName: String(context.moduleName || '').trim(),
      importName: String(context.importName || '').trim(),
      alias: context.alias ? String(context.alias).trim() : '',
      dryRun: context.dryRun === true,
    });
    return { ...result, execution_mode: 'semantic_ast', semantic: true };
  },
  /** @param {PythonProviderContext} context */
  removeImport(context) {
    const result = runPythonProvider({
      operation: 'remove_import',
      file: path.resolve(String(context.file || '')),
      moduleName: String(context.moduleName || '').trim(),
      importName: context.importName ? String(context.importName).trim() : '',
      dryRun: context.dryRun === true,
    });
    return { ...result, execution_mode: 'semantic_ast', semantic: true };
  },
  /** @param {PythonProviderContext} context */
  ensureExport(context) {
    const result = runPythonProvider({
      operation: 'ensure_export',
      file: path.resolve(String(context.file || '')),
      name: String(context.name || '').trim(),
      dryRun: context.dryRun === true,
    });
    return { ...result, execution_mode: 'semantic_ast', semantic: true };
  },
};

module.exports = {
  provider,
  resolvePythonExecutable,
  runPythonProvider,
};
