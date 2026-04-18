// @ts-nocheck
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

const SERVER_PROBE_CACHE = new Map();

const RUNNER_PATH = path.join(__dirname, 'lsp-rename-runner.js');
const GO_WORKSPACE_MARKERS = ['go.work', 'go.mod'];
const JAVA_WORKSPACE_MARKERS = ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts', '.project'];

function normalizeBackendPreference(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'auto') return 'auto';
  if (['lsp', 'prefer-lsp', 'lsp-preferred'].includes(normalized)) return 'lsp';
  if (['lsp-required', 'require-lsp', 'lsp-only'].includes(normalized)) return 'lsp-required';
  if (['indexed', 'indexed-only', 'token', 'token-aware'].includes(normalized)) return 'indexed';
  return 'auto';
}

function parseArgs(value) {
  if (!value) return [];
  const normalized = String(value).trim();
  if (!normalized) return [];
  if (normalized.startsWith('[')) {
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {}
  }
  const parts = [];
  let current = '';
  let quote = '';
  let escape = false;
  for (const char of normalized) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

function commandExists(command, env = process.env) {
  const normalized = String(command || '').trim();
  if (!normalized) return false;
  if (normalized.includes(path.sep)) return fs.existsSync(normalized);
  const pathValue = String(env.PATH || '');
  const entries = pathValue.split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (String(env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean))
    : [''];
  for (const entry of entries) {
    for (const ext of extensions) {
      const candidate = path.join(entry, process.platform === 'win32' ? `${normalized}${ext}` : normalized);
      if (fs.existsSync(candidate)) return true;
    }
  }
  return false;
}

function resolveCommandPath(command, env = process.env) {
  const normalized = String(command || '').trim();
  if (!normalized) return '';
  if (normalized.includes(path.sep)) return fs.existsSync(normalized) ? path.resolve(normalized) : '';
  const pathValue = String(env.PATH || '');
  const entries = pathValue.split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (String(env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean))
    : [''];
  for (const entry of entries) {
    for (const ext of extensions) {
      const candidate = path.join(entry, process.platform === 'win32' ? `${normalized}${ext}` : normalized);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return '';
}

function resolveProbeArgs(language, context = {}) {
  const upper = String(language || '').trim().toUpperCase();
  const configured = context.lspProbeArgs
    || process.env[`EOC_${upper}_LSP_PROBE_ARGS`]
    || process.env.EOC_LSP_PROBE_ARGS
    || '';
  const parsed = Array.isArray(configured) ? configured.map((item) => String(item)) : parseArgs(configured);
  if (parsed.length > 0) return parsed;
  if (language === 'go') return ['version'];
  return ['--version'];
}

function buildProbeInvocation(language, spec, context = {}) {
  const commandPath = resolveCommandPath(spec.command, spec.env);
  const probeArgs = Array.isArray(spec.probeArgs) ? spec.probeArgs.map((item) => String(item)) : resolveProbeArgs(language, context);
  const prefixArgs = Array.isArray(spec.args) ? spec.args.map((item) => String(item)) : [];
  const commandBase = path.basename(commandPath || spec.command || '').toLowerCase();
  const looksLikeNode = commandBase === 'node' || commandBase === 'node.exe';
  const firstArgLooksLikeScript = prefixArgs.length > 0 && (/\.(c?js|mjs)$/i.test(prefixArgs[0]) || fs.existsSync(prefixArgs[0]));
  return {
    commandPath,
    probeStrategy: String(spec.probeStrategy || '').trim() || 'spawn',
    args: looksLikeNode && firstArgLooksLikeScript ? [...prefixArgs, ...probeArgs] : probeArgs,
  };
}

function probeServerSpec(language, spec, context = {}) {
  const invocation = buildProbeInvocation(language, spec, context);
  const { commandPath, args, probeStrategy } = invocation;
  const cacheKey = JSON.stringify([language, commandPath || spec.command || '', args, probeStrategy]);
  if (SERVER_PROBE_CACHE.has(cacheKey)) return SERVER_PROBE_CACHE.get(cacheKey);
  const unavailable = { available: false, command: spec.command || '', command_path: commandPath || '', version: '', probe_output: '', probe_error: 'command not found' };
  if (!commandPath) {
    SERVER_PROBE_CACHE.set(cacheKey, unavailable);
    return unavailable;
  }
  if (probeStrategy === 'exists') {
    const probe = { available: true, command: spec.command || '', command_path: commandPath, version: '', probe_output: 'exists-probe', probe_error: '' };
    SERVER_PROBE_CACHE.set(cacheKey, probe);
    return probe;
  }
  const result = spawnSync(commandPath, args, {
    cwd: spec.cwd || process.cwd(),
    env: { ...process.env, ...(spec.env || {}) },
    encoding: 'utf8',
    timeout: Number(context.lspProbeTimeoutMs || process.env.EOC_LSP_PROBE_TIMEOUT_MS || 2000),
  });
  const output = String(result.stdout || result.stderr || '').trim();
  const probe = {
    available: result.status === 0,
    command: spec.command || '',
    command_path: commandPath,
    version: output.split(/\r?\n/, 1)[0] || '',
    probe_output: output,
    probe_error: result.status === 0 ? '' : (output || `probe exited with status ${result.status}`),
  };
  SERVER_PROBE_CACHE.set(cacheKey, probe);
  return probe;
}

function classifyLspFailure(message, parsed = null) {
  const normalized = String((parsed && (parsed.error || parsed.message || parsed.kind)) || message || '').toLowerCase();
  if (parsed && parsed.error_kind) return parsed.error_kind;
  if (normalized.includes('preparerename')) return 'prepare_rename_rejected';
  if (normalized.includes('renameprovider')) return 'capability_missing';
  if (normalized.includes('command is not available') || normalized.includes('command not found')) return 'server_unavailable';
  if (normalized.includes('timed out')) return 'timeout';
  if (normalized.includes('workspace/applyedit')) return 'apply_edit_rejected';
  if (normalized.includes('escapes workspace roots')) return 'workspace_scope_violation';
  if (normalized.includes('exceeds changed file budget') || normalized.includes('exceeds changed node budget')) return 'edit_budget_exceeded';
  if (normalized.includes('overlapping text edits') || normalized.includes('target already exists')) return 'edit_conflict';
  if (normalized.includes('parse')) return 'protocol_parse_error';
  if (normalized.includes('exited with code')) return 'server_exit';
  if (normalized.includes('request failed')) return 'request_failed';
  return 'lsp_error';
}

function attachLspError(error, language, spec, parsed = null) {
  const message = String((parsed && (parsed.error || parsed.message)) || (error && error.message) || `${language} LSP rename failed`);
  const next = error instanceof Error ? error : new Error(message);
  next.message = message;
  next.lspFailureKind = classifyLspFailure(message, parsed);
  next.lspFailure = parsed || null;
  next.lspServerCommand = spec.command || '';
  next.lspServerCommandPath = resolveCommandPath(spec.command, spec.env) || '';
  return next;
}

function resolveBackendPreference(language, context = {}) {
  const upper = String(language || '').trim().toUpperCase();
  return normalizeBackendPreference(
    context.backendPreference
      || context.refactorBackend
      || process.env[`EOC_${upper}_REFACTOR_BACKEND`]
      || process.env.EOC_REFACTOR_BACKEND,
  );
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolveInitializationOptions(language, context = {}) {
  const upper = String(language || '').trim().toUpperCase();
  return parseJsonObject(
    context.lspInitializationOptions
      || process.env[`EOC_${upper}_LSP_INIT_OPTIONS`]
      || process.env.EOC_LSP_INIT_OPTIONS
      || '',
  );
}

function resolveLspSettings(language, context = {}) {
  const upper = String(language || '').trim().toUpperCase();
  return parseJsonObject(
    context.lspSettings
      || process.env[`EOC_${upper}_LSP_SETTINGS`]
      || process.env.EOC_LSP_SETTINGS
      || '',
  );
}

function safeSpawnCapture(command, args, options = {}) {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      timeout: Number(options.timeoutMs || 1500),
      env: { ...process.env, ...(options.env || {}) },
    });
    return {
      status: typeof result.status === 'number' ? result.status : -1,
      stdout: String(result.stdout || ''),
      stderr: String(result.stderr || ''),
    };
  } catch {
    return { status: -1, stdout: '', stderr: '' };
  }
}

function discoverGoBinaryFromGoEnv(binaryName) {
  const goCommand = resolveCommandPath(process.env.GO || 'go');
  if (!goCommand) return '';
  const envResult = safeSpawnCapture(goCommand, ['env', 'GOBIN', 'GOPATH']);
  const lines = `${envResult.stdout || ''}`.split(/\r?\n/).map((item) => String(item || '').trim()).filter(Boolean);
  const searchRoots = [];
  if (lines[0]) searchRoots.push(lines[0]);
  if (lines[1]) {
    for (const entry of lines[1].split(path.delimiter).map((item) => String(item || '').trim()).filter(Boolean)) searchRoots.push(path.join(entry, 'bin'));
  }
  for (const root of searchRoots) {
    const candidate = path.join(root, binaryName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function chooseExistingPath(candidates) {
  for (const candidate of candidates || []) {
    if (candidate && fs.existsSync(candidate)) return path.resolve(candidate);
  }
  return '';
}

function discoverJavaLauncherSpec(context = {}) {
  const explicitHome = String(context.jdtlsHome || process.env.EOC_JAVA_LSP_HOME || process.env.JDTLS_HOME || '').trim();
  const homeCandidates = [
    explicitHome,
    path.join(os.homedir(), '.local', 'share', 'jdtls'),
    path.join(os.homedir(), '.cache', 'jdtls'),
    '/usr/share/jdtls',
    '/opt/jdtls',
  ].filter(Boolean);
  for (const home of homeCandidates) {
    let launchers = [];
    try {
      launchers = fs.readdirSync(path.join(home, 'plugins'))
        .filter((entry) => /^org\.eclipse\.equinox\.launcher_.*\.jar$/i.test(entry))
        .map((entry) => path.join(home, 'plugins', entry));
    } catch {}
    const launcher = chooseExistingPath(launchers);
    if (!launcher) continue;
    const configDir = chooseExistingPath([
      path.join(home, 'config_linux'),
      path.join(home, 'config_linux_x86_64'),
      path.join(home, 'config_mac'),
      path.join(home, 'config_win'),
      path.join(home, 'config'),
    ]);
    if (!configDir) continue;
    const javaCommand = resolveCommandPath(process.env.JAVA || 'java');
    if (!javaCommand) continue;
    const workspaceData = path.resolve(String(context.baseDir || process.cwd()), '.opencode', '.jdtls-workspace');
    return {
      command: javaCommand,
      args: [
        '-Declipse.application=org.eclipse.jdt.ls.core.id1',
        '-Dosgi.bundles.defaultStartLevel=4',
        '-Declipse.product=org.eclipse.jdt.ls.core.product',
        '-Dlog.protocol=true',
        '-Dlog.level=ALL',
        '-Xms256m',
        '--add-modules=ALL-SYSTEM',
        '--add-opens', 'java.base/java.util=ALL-UNNAMED',
        '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
        '-jar', launcher,
        '-configuration', configDir,
        '-data', workspaceData,
      ],
      launcher,
      configDir,
      workspaceData,
      probeStrategy: 'exists',
    };
  }
  return null;
}

function discoverServerCommand(language, context = {}) {
  if (language === 'go') {
    const discovered = chooseExistingPath([
      process.env.EOC_GO_LSP_BIN,
      discoverGoBinaryFromGoEnv('gopls'),
    ]);
    return discovered ? { command: discovered, args: [] } : null;
  }
  if (language === 'java') return discoverJavaLauncherSpec(context);
  return null;
}

function findNearestMarker(startDir, markerNames) {
  let current = path.resolve(String(startDir || process.cwd()));
  while (true) {
    for (const marker of markerNames) {
      if (fs.existsSync(path.join(current, marker))) return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return '';
    current = parent;
  }
}

function resolveGoWorkspaceRoot(context = {}) {
  const start = path.resolve(String(context.file ? path.dirname(context.file) : (context.baseDir || process.cwd())));
  return findNearestMarker(start, GO_WORKSPACE_MARKERS) || path.resolve(String(context.baseDir || process.cwd()));
}

function resolveJavaWorkspaceRoot(context = {}) {
  const start = path.resolve(String(context.file ? path.dirname(context.file) : (context.baseDir || process.cwd())));
  return findNearestMarker(start, JAVA_WORKSPACE_MARKERS) || path.resolve(String(context.baseDir || process.cwd()));
}

function collectNestedJavaWorkspaceFolders(rootDir) {
  const resolvedRoot = path.resolve(String(rootDir || process.cwd()));
  const folders = [resolvedRoot];
  const seen = new Set(folders);
  const queue = [resolvedRoot];
  while (queue.length > 0) {
    const current = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'build' || entry.name === '.gradle') continue;
      const abs = path.join(current, entry.name);
      const hasMarker = JAVA_WORKSPACE_MARKERS.some((marker) => fs.existsSync(path.join(abs, marker)));
      if (hasMarker && !seen.has(abs)) {
        folders.push(abs);
        seen.add(abs);
      }
      queue.push(abs);
    }
  }
  return folders;
}

function resolveWorkspaceSpec(language, context = {}) {
  const fallbackRoot = path.resolve(String(context.baseDir || process.cwd()));
  if (language === 'go') {
    const rootDir = resolveGoWorkspaceRoot(context) || fallbackRoot;
    return { rootDir, workspaceFolders: [rootDir], projectRootDetected: rootDir !== fallbackRoot || Boolean(context.file) };
  }
  if (language === 'java') {
    const rootDir = resolveJavaWorkspaceRoot(context) || fallbackRoot;
    return {
      rootDir,
      workspaceFolders: collectNestedJavaWorkspaceFolders(rootDir),
      projectRootDetected: rootDir !== fallbackRoot || Boolean(context.file),
    };
  }
  return { rootDir: fallbackRoot, workspaceFolders: [fallbackRoot], projectRootDetected: false };
}

function resolveServerSpec(language, context = {}) {
  const upper = String(language || '').trim().toUpperCase();
  const defaultCommand = language === 'go' ? 'gopls' : (language === 'java' ? 'jdtls' : '');
  const workspace = resolveWorkspaceSpec(language, context);
  const explicitCommand = String(
    context.lspCommand
      || process.env[`EOC_${upper}_LSP_COMMAND`]
      || process.env[`EOC_${upper}_LSP_BIN`]
      || '',
  ).trim();
  const discovered = explicitCommand ? null : discoverServerCommand(language, { ...context, baseDir: workspace.rootDir });
  const args = Array.isArray(context.lspArgs)
    ? context.lspArgs.map((item) => String(item))
    : (explicitCommand ? parseArgs(process.env[`EOC_${upper}_LSP_ARGS`] || '') : [...((discovered && discovered.args) || [])]);
  return {
    command: explicitCommand || (discovered && discovered.command) || defaultCommand,
    args,
    cwd: workspace.rootDir,
    env: { ...process.env },
    initializationOptions: resolveInitializationOptions(language, context),
    settings: resolveLspSettings(language, context),
    workspace,
    probeStrategy: context.lspProbeStrategy || (discovered && discovered.probeStrategy) || '',
    probeArgs: Array.isArray(context.lspProbeArgs) ? context.lspProbeArgs.map((item) => String(item)) : [],
    launcher: discovered && discovered.launcher ? discovered.launcher : '',
    configDir: discovered && discovered.configDir ? discovered.configDir : '',
    workspaceData: discovered && discovered.workspaceData ? discovered.workspaceData : '',
    discovery_mode: explicitCommand ? 'explicit' : (discovered ? 'auto' : 'default'),
  };
}

function isLspAvailable(language, context = {}) {
  const spec = resolveServerSpec(language, context);
  const probe = probeServerSpec(language, spec, context);
  return Boolean(spec.command) && probe.available;
}

function shouldAttemptLsp(language, context = {}) {
  const preference = resolveBackendPreference(language, context);
  return preference === 'lsp' || preference === 'lsp-required' || (preference === 'auto' && isLspAvailable(language, context));
}

function offsetToLineCol(text, offset) {
  const safeOffset = Math.max(0, Math.min(Number(offset || 0), String(text || '').length));
  let line = 1;
  let col = 1;
  for (let index = 0; index < safeOffset; index += 1) {
    if (text[index] === '\n') {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return { line, col };
}

function runLspRenameSync(language, context, anchor, metadata = {}) {
  const preference = resolveBackendPreference(language, context);
  const spec = resolveServerSpec(language, context);
  const probe = probeServerSpec(language, spec, context);
  if (!spec.command) throw attachLspError(new Error(`No ${language} LSP server command configured`), language, spec);
  if (!probe.available) throw attachLspError(new Error(`${language} LSP server command is not available: ${spec.command}`), language, spec, probe);
  const payload = {
    language,
    server: spec,
    baseDir: path.resolve(String(context.baseDir || process.cwd())),
    file: path.resolve(String(anchor.file || context.file || '')),
    line: Number(anchor.line),
    col: Number(anchor.col),
    toName: String(context.toName || '').trim(),
    dryRun: context.dryRun === true,
    operation: String(context.operation || '').trim() || 'rename',
    metadata,
    timeoutMs: Number(context.lspTimeoutMs || process.env.EOC_LSP_TIMEOUT_MS || 15000),
    limits: {
      maxChangedFiles: Number(context.lspMaxChangedFiles || process.env.EOC_LSP_MAX_CHANGED_FILES || 0),
      maxChangedNodes: Number(context.lspMaxChangedNodes || process.env.EOC_LSP_MAX_CHANGED_NODES || 0),
    },
    initializationOptions: spec.initializationOptions || {},
    settings: spec.settings || {},
    workspace: spec.workspace,
  };
  const result = spawnSync(process.execPath, [RUNNER_PATH], {
    cwd: payload.workspace && payload.workspace.rootDir ? payload.workspace.rootDir : payload.baseDir,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env },
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    let parsedFailure = null;
    try { parsedFailure = JSON.parse(stderr || stdout || '{}'); } catch {}
    throw attachLspError(new Error(stderr || stdout || `${language} LSP rename failed`), language, spec, parsedFailure);
  }
  let parsed;
  try {
    parsed = JSON.parse(String(result.stdout || '{}'));
  } catch (error) {
    throw attachLspError(new Error(`Failed to parse ${language} LSP rename result: ${error.message}`), language, spec);
  }
  if (!parsed || parsed.ok !== true) {
    throw attachLspError(new Error(parsed && parsed.error ? parsed.error : `${language} LSP rename failed`), language, spec, parsed);
  }
  return {
    changedFiles: Number(parsed.changedFiles || 0),
    changedNodes: Number(parsed.changedNodes || 0),
    execution_mode: 'semantic_ast',
    semantic: true,
    detail: `${metadata.detailPrefix || `${language.toUpperCase()} experimental LSP rename`} via ${parsed.serverLabel || spec.command}`,
    backend: 'lsp',
    backend_preference: preference,
    lsp_server: parsed.serverLabel || spec.command,
    lsp_server_command_resolved: probe.command_path || '',
    lsp_server_probe: probe.probe_output || probe.version || '',
    lsp_server_version: probe.version || '',
    lsp_applied: true,
    lsp_prepare_rename: Boolean(parsed.prepareRenameApplied),
    lsp_workspace_document_changes: Boolean(parsed.workspaceDocumentChanges),
    lsp_workspace_resource_ops: Array.isArray(parsed.workspaceResourceOperations) ? [...parsed.workspaceResourceOperations] : [],
    lsp_server_capabilities: parsed.serverCapabilities || {},
    lsp_workspace_root: parsed.workspaceRoot || (spec.workspace && spec.workspace.rootDir) || payload.baseDir,
    lsp_workspace_folders: Array.isArray(parsed.workspaceFolders) ? [...parsed.workspaceFolders] : [...((spec.workspace && spec.workspace.workspaceFolders) || [])],
    lsp_workspace_scope_roots: Array.isArray(parsed.workspaceScopeRoots) ? [...parsed.workspaceScopeRoots] : [...((spec.workspace && spec.workspace.workspaceFolders) || [])],
    lsp_workspace_scope_guarded: true,
    lsp_server_requests_handled: Number(parsed.serverRequestsHandled || 0),
    lsp_workspace_configuration_requested: Boolean(parsed.workspaceConfigurationRequested),
    lsp_apply_edit_requests: Number(parsed.applyEditRequests || 0),
    lsp_diagnostics_count: Number(parsed.diagnosticCount || 0),
    lsp_diagnostic_summary: parsed.diagnosticSummary || {},
    lsp_server_messages: Array.isArray(parsed.serverMessages) ? [...parsed.serverMessages] : [],
    lsp_edit_preview: parsed.editPreview || {},
    lsp_edit_budget: parsed.editBudget || {},
  };
}

module.exports = {
  attachLspError,
  classifyLspFailure,
  commandExists,
  discoverServerCommand,
  discoverJavaLauncherSpec,
  isLspAvailable,
  normalizeBackendPreference,
  probeServerSpec,
  offsetToLineCol,
  resolveBackendPreference,
  resolveServerSpec,
  resolveInitializationOptions,
  resolveLspSettings,
  resolveWorkspaceSpec,
  runLspRenameSync,
  shouldAttemptLsp,
};
