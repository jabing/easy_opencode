#!/usr/bin/env node
// @ts-nocheck
const path = require('path');

const { formatManagedInvocation } = require('./runtime-paths.js');
const { describeProviders, runRefactorOperation } = require('../core/refactor/service.js');

function printLine(line = '') { process.stdout.write(String(line) + '\n'); }
function printError(line = '') { process.stderr.write(String(line) + '\n'); }

const EDIT_POLICY_PRESETS = {
  surgical: { edit_policy: 'surgical', max_files: 4, max_identifiers: 32 },
  balanced: { edit_policy: 'balanced', max_files: 10, max_identifiers: 96 },
  broad: { edit_policy: 'broad', max_files: 24, max_identifiers: 1000 },
};

function resolveEditPolicy(opts = {}) {
  let editPolicy = String(opts['edit-policy'] || '').trim().toLowerCase();
  const strategyBias = String(opts['strategy-bias'] || '').trim().toLowerCase();
  if (!editPolicy) {
    if (strategyBias === 'conservative') editPolicy = 'surgical';
    else if (strategyBias === 'accelerated') editPolicy = 'broad';
    else editPolicy = 'balanced';
  }
  if (!EDIT_POLICY_PRESETS[editPolicy]) editPolicy = 'balanced';
  return {
    edit_policy: editPolicy,
    max_files: Number(opts['max-files'] || EDIT_POLICY_PRESETS[editPolicy].max_files),
    max_identifiers: Number(opts['max-identifiers'] || EDIT_POLICY_PRESETS[editPolicy].max_identifiers),
    force_broad_edit: opts['force-broad-edit'] === true,
  };
}

function assertEditFootprintAllowed(summary, policy, dryRun, commandName) {
  const maxFiles = Number(policy.max_files || 0);
  const maxIdentifiers = Number(policy.max_identifiers || 0);
  const exceedsFiles = maxFiles > 0 && Number(summary.changedFiles || 0) > maxFiles;
  const exceedsIdentifiers = maxIdentifiers > 0 && Number(summary.changedNodes || 0) > maxIdentifiers;
  if (!dryRun && (exceedsFiles || exceedsIdentifiers) && !policy.force_broad_edit) {
    const reason = [];
    if (exceedsFiles) reason.push(`files=${summary.changedFiles} > max_files=${maxFiles}`);
    if (exceedsIdentifiers) reason.push(`identifiers=${summary.changedNodes} > max_identifiers=${maxIdentifiers}`);
    throw new Error(`${commandName} exceeds ${policy.edit_policy} edit-policy limits (${reason.join(', ')}). Re-run with --dry-run, smaller scope, or --force-broad-edit.`);
  }
}

function usage() {
  printLine('Usage:');
  printLine(`  ${formatManagedInvocation('ast-rewrite', ['providers'])}`);
  printLine(`  ${formatManagedInvocation('ast-rewrite', ['rename-at', '--file', '<path>', '--line', '<n>', '--col', '<n>', '--to', '<new>', '--path', '<dir>', '--provider', 'auto|typescript-semantic', '--backend', 'auto|lsp|lsp-required|indexed', '--dry-run'])}`);
  printLine(`  ${formatManagedInvocation('ast-rewrite', ['rename-symbol', '--from', '<old>', '--to', '<new>', '--path', '<dir>', '--provider', 'auto|typescript-semantic|python-semantic|go-semantic|java-semantic|text-fallback', '--backend', 'auto|lsp|lsp-required|indexed', '--edit-policy', 'surgical|balanced|broad', '--dry-run'])}`);
  printLine(`  ${formatManagedInvocation('ast-rewrite', ['add-import', '--file', '<path>', '--from', '<module>', '--import', '<name>', '--provider', 'auto|typescript-semantic|python-semantic|go-semantic|java-semantic', '--alias', '<alias>', '--type-only', '--dry-run'])}`);
  printLine(`  ${formatManagedInvocation('ast-rewrite', ['remove-import', '--file', '<path>', '--from', '<module>', '--import', '<name>', '--provider', 'auto|typescript-semantic|python-semantic|go-semantic|java-semantic', '--dry-run'])}`);
  printLine(`  ${formatManagedInvocation('ast-rewrite', ['ensure-export', '--file', '<path>', '--name', '<symbol>', '--kind', 'function|const|class|method', '--provider', 'auto|typescript-semantic|python-semantic|go-semantic|java-semantic', '--dry-run'])}`);
}

function parseArgs(argv) {
  const cmd = argv[2];
  const opts = { _: [] };
  for (let index = 3; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) opts[key] = true;
    else {
      opts[key] = next;
      index += 1;
    }
  }
  return { cmd, opts };
}

function renameSymbol(baseDir, fromName, toName, dryRun, editPolicy, providerId, backendPreference) {
  const result = runRefactorOperation('rename-symbol', {
    baseDir,
    fromName,
    toName,
    dryRun,
    provider: providerId,
    backendPreference,
  });
  if (editPolicy) assertEditFootprintAllowed(result, editPolicy, dryRun, 'rename-symbol');
  return result;
}

function renameAt(baseDir, targetFile, line, col, toName, dryRun, editPolicy, providerId, backendPreference) {
  const result = runRefactorOperation('rename-at', {
    baseDir,
    file: targetFile,
    line,
    col,
    toName,
    dryRun,
    provider: providerId,
    backendPreference,
  });
  if (editPolicy) assertEditFootprintAllowed(result, editPolicy, dryRun, 'rename-at');
  return result;
}

function addImport(filePath, moduleName, importName, opts = {}) {
  return runRefactorOperation('add-import', {
    file: filePath,
    moduleName,
    importName,
    alias: opts.alias,
    typeOnly: opts.typeOnly === true,
    defaultImport: opts.defaultImport === true,
    dryRun: opts.dryRun === true,
    provider: opts.provider,
  });
}

function removeImport(filePath, moduleName, importName, opts = {}) {
  return runRefactorOperation('remove-import', {
    file: filePath,
    moduleName,
    importName,
    dryRun: opts.dryRun === true,
    provider: opts.provider,
  });
}

function ensureExport(filePath, name, kind, opts = {}) {
  return runRefactorOperation('ensure-export', {
    file: filePath,
    name,
    kind,
    dryRun: opts.dryRun === true,
    provider: opts.provider,
  });
}

function printProviderCatalog() {
  for (const provider of describeProviders()) {
    printLine(`${provider.id}\t${provider.execution_mode}\tavailable=${provider.available}\tops=${provider.supported_operations.join(',')}\tlanguages=${provider.supported_languages.join(',')}`);
  }
}

function main() {
  try {
    const { cmd, opts } = parseArgs(process.argv);
    if (!cmd || cmd === '--help' || cmd === 'help') {
      usage();
      process.exit(0);
    }
    if (cmd === 'providers') {
      printProviderCatalog();
      return;
    }
    const base = path.resolve(process.cwd(), String(opts.path || '.'));
    const dryRun = opts['dry-run'] === true;
    const editPolicy = resolveEditPolicy(opts);
    const providerId = String(opts.provider || 'auto').trim();
    const backendPreference = String(opts.backend || 'auto').trim();

    if (cmd === 'rename-at') {
      const file = String(opts.file || '').trim();
      const toName = String(opts.to || '').trim();
      const line = Number(opts.line);
      const col = Number(opts.col);
      if (!file || !toName || !Number.isInteger(line) || !Number.isInteger(col)) {
        throw new Error('rename-at requires --file --line --col --to');
      }
      const result = renameAt(base, file, line, col, toName, dryRun, editPolicy, providerId, backendPreference);
      printLine(`[ast-rewrite] ${dryRun ? 'DRY-RUN' : 'APPLIED'} provider=${result.provider_id} mode=${result.execution_mode} policy=${editPolicy.edit_policy} files=${result.changedFiles} identifiers=${result.changedNodes} symbol=${result.symbol} to=${toName}`);
      return;
    }

    if (cmd === 'rename-symbol') {
      const fromName = String(opts.from || '').trim();
      const toName = String(opts.to || '').trim();
      if (!fromName || !toName) throw new Error('rename-symbol requires --from and --to');
      const result = renameSymbol(base, fromName, toName, dryRun, editPolicy, providerId, backendPreference);
      printLine(`[ast-rewrite] ${dryRun ? 'DRY-RUN' : 'APPLIED'} provider=${result.provider_id} mode=${result.execution_mode} policy=${editPolicy.edit_policy} files=${result.changedFiles} identifiers=${result.changedNodes} from=${fromName} to=${toName}`);
      return;
    }

    if (cmd === 'add-import') {
      const file = String(opts.file || '').trim();
      const moduleName = String(opts.from || '').trim();
      const importName = String(opts.import || opts.name || '').trim();
      if (!file || !moduleName || !importName) throw new Error('add-import requires --file --from --import');
      const result = addImport(file, moduleName, importName, {
        alias: opts.alias,
        typeOnly: opts['type-only'] === true,
        defaultImport: opts.default === true,
        dryRun,
        provider: providerId,
      });
      printLine(`[ast-rewrite] ${dryRun ? 'DRY-RUN' : 'APPLIED'} provider=${result.provider_id} mode=${result.execution_mode} ${result.detail}`);
      return;
    }

    if (cmd === 'remove-import') {
      const file = String(opts.file || '').trim();
      const moduleName = String(opts.from || '').trim();
      if (!file || !moduleName) throw new Error('remove-import requires --file --from');
      const result = removeImport(file, moduleName, String(opts.import || '').trim(), {
        dryRun,
        provider: providerId,
      });
      printLine(`[ast-rewrite] ${dryRun ? 'DRY-RUN' : 'APPLIED'} provider=${result.provider_id} mode=${result.execution_mode} ${result.detail}`);
      return;
    }

    if (cmd === 'ensure-export') {
      const file = String(opts.file || '').trim();
      const name = String(opts.name || '').trim();
      const kind = String(opts.kind || 'function').trim();
      if (!file || !name) throw new Error('ensure-export requires --file --name');
      if (!['function', 'const', 'class', 'method'].includes(kind)) throw new Error('ensure-export --kind must be function, const, class, or method');
      const result = ensureExport(file, name, kind, { dryRun, provider: providerId });
      printLine(`[ast-rewrite] ${dryRun ? 'DRY-RUN' : 'APPLIED'} provider=${result.provider_id} mode=${result.execution_mode} ${result.detail}`);
      return;
    }

    throw new Error(`Unknown command: ${cmd}`);
  } catch (err) {
    printError(`[ast-rewrite] ${err.message}`);
    usage();
    process.exit(1);
  }
}

module.exports = {
  addImport,
  ensureExport,
  main,
  parseArgs,
  removeImport,
  renameAt,
  renameSymbol,
  resolveEditPolicy,
};

if (require.main === module) {
  main();
}
