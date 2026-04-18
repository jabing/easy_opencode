const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runRefactorOperation, describeProviders } = require('../src/core/refactor/service.js');
const { buildSupportTierReport } = require('../src/core/support-tiers/report.js');
const { withTempDir, writeFiles } = require('./test-helpers.js');

function withEnv(pairs, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(pairs || {})) {
    previous.set(key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined);
    if (value === null || value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function writeScopeGuardLspServer(filePath) {
  const lines = [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    "const path = require('path');",
    "const { pathToFileURL, fileURLToPath } = require('url');",
    "if (process.argv.includes('version') || process.argv.includes('--version')) { console.log(process.env.FAKE_LSP_VERSION || 'fake-lsp 3.0.0'); process.exit(0); }",
    'let buffer = Buffer.alloc(0);',
    'let rootDir = process.cwd();',
    'function send(message) {',
    "  const body = Buffer.from(JSON.stringify(message), 'utf8');",
    "  process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');",
    '  process.stdout.write(body);',
    '}',
    'function fullRange(text) {',
    "  const parts = String(text || '').split('\\n');",
    '  return { start: { line: 0, character: 0 }, end: { line: parts.length, character: 0 } };',
    '}',
    'function collectFiles(root, ext, acc = []) {',
    "  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {",
    "    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'build' || entry.name === '.gradle') continue;",
    '    const abs = path.join(root, entry.name);',
    '    if (entry.isDirectory()) collectFiles(abs, ext, acc);',
    '    else if (entry.isFile() && abs.endsWith(ext)) acc.push(abs);',
    '  }',
    '  return acc;',
    '}',
    'function replaceAll(text, fromName, toName) {',
    "  return String(text || '').split(String(fromName || '')).join(String(toName || ''));",
    '}',
    'function handle(message) {',
    "  if (message.method === 'initialize') {",
    '    rootDir = fileURLToPath(message.params.rootUri);',
    "    send({ jsonrpc: '2.0', id: message.id, result: { capabilities: { renameProvider: { prepareProvider: true }, workspace: { workspaceEdit: { documentChanges: true, resourceOperations: ['create', 'rename', 'delete'] } } } } });",
    '    return;',
    '  }',
    "  if (message.method === 'initialized' || message.method === 'workspace/didChangeConfiguration' || message.method === 'textDocument/didOpen') return;",
    "  if (message.method === 'textDocument/prepareRename') { send({ jsonrpc: '2.0', id: message.id, result: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, placeholder: process.env.FAKE_LSP_FROM || 'legacyName' } }); return; }",
    "  if (message.method === 'textDocument/rename') {",
    "    const ext = process.env.FAKE_LSP_EXT || '.go';",
    "    const fromName = process.env.FAKE_LSP_FROM || 'legacyName';",
    '    const files = collectFiles(rootDir, ext);',
    "    const primary = files.find((item) => item.endsWith(path.sep + (process.env.FAKE_LSP_PRIMARY_FILE || path.basename(item)))) || files[0];",
    "    if (process.env.OUTSIDE_TEXT_EDIT === '1') {",
    "      const outside = path.join(rootDir, '..', 'escape-' + path.basename(primary || 'x.go'));",
    "      send({ jsonrpc: '2.0', id: message.id, result: { changes: { [pathToFileURL(outside).href]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: '// outside workspace\\n' }] } } });",
    '      return;',
    '    }',
    "    if (process.env.OUTSIDE_RESOURCE_RENAME === '1') {",
    "      const outside = path.join(rootDir, '..', message.params.newName + ext);",
    "      const original = fs.readFileSync(primary, 'utf8');",
    '      const next = replaceAll(original, fromName, message.params.newName);',
    "      send({ jsonrpc: '2.0', id: message.id, result: { documentChanges: [",
    "        { kind: 'rename', oldUri: pathToFileURL(primary).href, newUri: pathToFileURL(outside).href },",
    "        { textDocument: { uri: pathToFileURL(outside).href, version: null }, edits: [{ range: fullRange(original), newText: next }] }",
    '      ] } });',
    '      return;',
    '    }',
    '    const changes = {};',
    '    for (const file of files) {',
    "      const original = fs.readFileSync(file, 'utf8');",
    '      const next = replaceAll(original, fromName, message.params.newName);',
    '      if (next === original) continue;',
    '      changes[pathToFileURL(file).href] = [{ range: fullRange(original), newText: next }];',
    '    }',
    "    send({ jsonrpc: '2.0', id: message.id, result: { changes } });",
    '    return;',
    '  }',
    "  if (message.method === 'shutdown') { send({ jsonrpc: '2.0', id: message.id, result: null }); return; }",
    "  if (message.method === 'exit') process.exit(0);",
    "  if (typeof message.id !== 'undefined') send({ jsonrpc: '2.0', id: message.id, result: null });",
    '}',
    "process.stdin.on('data', (chunk) => {",
    '  buffer = Buffer.concat([buffer, chunk]);',
    '  while (true) {',
    "    const marker = buffer.indexOf('\\r\\n\\r\\n');",
    '    if (marker < 0) return;',
    "    const header = buffer.slice(0, marker).toString('utf8');",
    "    const match = header.match(/Content-Length:\\s*(\\d+)/i);",
    "    if (!match) throw new Error('missing content length');",
    '    const length = Number(match[1]);',
    '    const bodyStart = marker + 4;',
    '    if (buffer.length < bodyStart + length) return;',
    "    const body = buffer.slice(bodyStart, bodyStart + length).toString('utf8');",
    '    buffer = buffer.slice(bodyStart + length);',
    '    handle(JSON.parse(body));',
    '  }',
    '});',
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

test('go lsp-required mode rejects out-of-workspace text edits from the language server', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': 'package handlers\n\nfunc legacyRoute() string { return "ok" }\n',
    });
    writeScopeGuardLspServer(path.join(dir, 'fake-scope-lsp.js'));
  }, (dir) => {
    assert.throws(() => withEnv({
      EOC_GO_LSP_COMMAND: path.join(dir, 'fake-scope-lsp.js'),
      EOC_GO_LSP_ARGS: JSON.stringify([]),
      FAKE_LSP_EXT: '.go',
      FAKE_LSP_FROM: 'legacyRoute',
      OUTSIDE_TEXT_EDIT: '1',
    }, () => runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'legacyRoute',
      toName: 'modernRoute',
      dryRun: true,
      backendPreference: 'lsp-required',
      provider: 'go-semantic',
    })), /workspace_scope_violation/);
  });
});

test('java lsp-required mode rejects out-of-workspace resource renames from the language server', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'pom.xml': '<project></project>\n',
      'src/main/java/com/example/demo/LegacyBillingService.java': [
        'package com.example.demo;',
        '',
        'class LegacyBillingService {',
        '}',
        '',
      ].join('\n'),
    });
    writeScopeGuardLspServer(path.join(dir, 'fake-scope-lsp.js'));
  }, (dir) => {
    const file = path.join(dir, 'src/main/java/com/example/demo/LegacyBillingService.java');
    assert.throws(() => withEnv({
      EOC_JAVA_LSP_COMMAND: path.join(dir, 'fake-scope-lsp.js'),
      EOC_JAVA_LSP_ARGS: JSON.stringify([]),
      FAKE_LSP_EXT: '.java',
      FAKE_LSP_FROM: 'LegacyBillingService',
      FAKE_LSP_PRIMARY_FILE: 'LegacyBillingService.java',
      OUTSIDE_RESOURCE_RENAME: '1',
    }, () => runRefactorOperation('rename-at', {
      baseDir: dir,
      file,
      line: 3,
      col: 8,
      toName: 'ModernBillingService',
      dryRun: true,
      backendPreference: 'lsp-required',
      provider: 'java-semantic',
    })), /workspace_scope_violation/);
  });
});

test('successful LSP renames expose workspace scope roots and guard metadata', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': 'package handlers\n\nfunc legacyRoute() string { return "ok" }\n',
      'internal/handlers/wiring.go': 'package handlers\n\nfunc callRealRoute() string { return legacyRoute() }\n',
    });
    writeScopeGuardLspServer(path.join(dir, 'fake-scope-lsp.js'));
  }, (dir) => {
    const result = withEnv({
      EOC_GO_LSP_COMMAND: path.join(dir, 'fake-scope-lsp.js'),
      EOC_GO_LSP_ARGS: JSON.stringify([]),
      FAKE_LSP_EXT: '.go',
      FAKE_LSP_FROM: 'legacyRoute',
    }, () => runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'legacyRoute',
      toName: 'modernRoute',
      dryRun: true,
      backendPreference: 'lsp',
      provider: 'go-semantic',
    }));
    assert.equal(result.backend, 'lsp');
    assert.equal(result.lsp_workspace_scope_guarded, true);
    assert.ok(Array.isArray(result.lsp_workspace_scope_roots));
    assert.ok(result.lsp_workspace_scope_roots.some((entry) => entry === dir));
  });
});

test('provider catalog and support-tier report expose workspace scope guard hardening', () => {
  const providers = describeProviders();
  const goProvider = providers.find((provider) => provider.id === 'go-semantic');
  const javaProvider = providers.find((provider) => provider.id === 'java-semantic');
  assert.equal(goProvider.lsp_workspace_scope_guards, true);
  assert.equal(javaProvider.lsp_workspace_scope_guards, true);

  const report = buildSupportTierReport(path.resolve(__dirname, '..'));
  const goProfile = report.scripts['ast-rewrite'].acceptance.provider_profiles.find((provider) => provider.id === 'go-semantic');
  const javaProfile = report.scripts['ast-rewrite'].acceptance.provider_profiles.find((provider) => provider.id === 'java-semantic');
  assert.equal(goProfile.lsp_workspace_scope_guards, true);
  assert.equal(javaProfile.lsp_workspace_scope_guards, true);
});
