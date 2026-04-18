const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
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

function writeFakeRound2LspServer(filePath) {
  const lines = [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    "const path = require('path');",
    "const { fileURLToPath, pathToFileURL } = require('url');",
    'let buffer = Buffer.alloc(0);',
    'function send(message) {',
    "  const body = Buffer.from(JSON.stringify(message), 'utf8');",
    "  process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');",
    '  process.stdout.write(body);',
    '}',
    'function fullRange(text) {',
    "  const lines = String(text || '').split('\\n');",
    '  return { start: { line: 0, character: 0 }, end: { line: lines.length, character: 0 } };',
    '}',
    'function collectFiles(root, ext, acc = []) {',
    "  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {",
    "    if (entry.name === '.git' || entry.name === 'node_modules') continue;",
    '    const abs = path.join(root, entry.name);',
    '    if (entry.isDirectory()) collectFiles(abs, ext, acc);',
    '    else if (entry.isFile() && abs.endsWith(ext)) acc.push(abs);',
    '  }',
    '  return acc;',
    '}',
    'function replaceWholeTextEdit(filePath, nextText) {',
    "  const original = fs.readFileSync(filePath, 'utf8');",
    '  return { textDocument: { uri: pathToFileURL(filePath).href }, edits: [{ range: fullRange(original), newText: nextText }] };',
    '}',
    'function handleRename(message) {',
    "  if (process.env.FAKE_LSP_FAIL === '1') {",
    "    send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'forced fake lsp failure' } });",
    '    return;',
    '  }',
    "  const ext = process.env.FAKE_LSP_EXT || '.go';",
    "  const fromName = process.env.FAKE_LSP_FROM || 'legacyName';",
    '  const files = collectFiles(process.cwd(), ext);',
    "  if (process.env.FAKE_LSP_RESOURCE_RENAME === '1') {",
    '    const targetPath = fileURLToPath(message.params.textDocument.uri);',
    '    const targetDir = path.dirname(targetPath);',
    "    const targetExt = path.extname(targetPath) || '.java';",
    "    const renamedPath = path.join(targetDir, message.params.newName + targetExt);",
    "    const renamedBody = fs.readFileSync(targetPath, 'utf8').split(fromName).join(message.params.newName);",
    '    const documentChanges = [',
    '      { kind: "rename", oldUri: pathToFileURL(targetPath).href, newUri: pathToFileURL(renamedPath).href, options: { overwrite: true } },',
    '      { textDocument: { uri: pathToFileURL(renamedPath).href }, edits: [{ range: fullRange(renamedBody), newText: renamedBody }] },',
    '    ];',
    '    for (const file of files) {',
    '      if (file === targetPath) continue;',
    "      const original = fs.readFileSync(file, 'utf8');",
    "      const next = original.split(fromName).join(message.params.newName);",
    '      if (next === original) continue;',
    '      documentChanges.push(replaceWholeTextEdit(file, next));',
    '    }',
    "    send({ jsonrpc: '2.0', id: message.id, result: { documentChanges } });",
    '    return;',
    '  }',
    '  const changes = {};',
    '  for (const file of files) {',
    "    const original = fs.readFileSync(file, 'utf8');",
    '    const next = original.split(fromName).join(message.params.newName);',
    '    if (next === original) continue;',
    '    changes[pathToFileURL(file).href] = [{ range: fullRange(original), newText: next }];',
    '  }',
    "  send({ jsonrpc: '2.0', id: message.id, result: { changes } });",
    '}',
    'function handle(message) {',
    "  if (message.method === 'initialize') {",
    '    const renameProvider = process.env.FAKE_LSP_DISABLE_RENAME === "1" ? false : (process.env.FAKE_LSP_PREPARE === "1" ? { prepareProvider: true } : true);',
    "    send({ jsonrpc: '2.0', id: message.id, result: { capabilities: { renameProvider, workspace: { workspaceEdit: { documentChanges: true, resourceOperations: ['create', 'rename', 'delete'] } } } } });",
    '    return;',
    '  }',
    "  if (message.method === 'textDocument/prepareRename') {",
    "    if (process.env.FAKE_LSP_PREPARE_REJECT === '1') { send({ jsonrpc: '2.0', id: message.id, result: null }); return; }",
    "    send({ jsonrpc: '2.0', id: message.id, result: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, placeholder: process.env.FAKE_LSP_FROM || 'legacyName' } });",
    '    return;',
    '  }',
    "  if (message.method === 'textDocument/rename') { handleRename(message); return; }",
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

test('go provider negotiates prepareRename-capable LSP backend and reports capabilities', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': 'package handlers\n\nfunc legacyRoute() string { return "ok" }\n',
      'internal/handlers/wiring.go': 'package handlers\n\nfunc callRealRoute() string { return legacyRoute() }\n',
    });
    writeFakeRound2LspServer(path.join(dir, 'fake-lsp-round2.js'));
  }, (dir) => {
    const result = withEnv({
      EOC_GO_LSP_COMMAND: process.execPath,
      EOC_GO_LSP_ARGS: JSON.stringify([path.join(dir, 'fake-lsp-round2.js')]),
      FAKE_LSP_EXT: '.go',
      FAKE_LSP_FROM: 'legacyRoute',
      FAKE_LSP_PREPARE: '1',
    }, () => runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'legacyRoute',
      toName: 'modernRoute',
      dryRun: false,
      backendPreference: 'lsp',
      provider: 'go-semantic',
    }));
    assert.equal(result.provider_id, 'go-semantic');
    assert.equal(result.execution_mode, 'semantic_ast');
    assert.equal(result.backend, 'lsp');
    assert.equal(result.lsp_prepare_rename, true);
    assert.equal(result.lsp_workspace_document_changes, true);
    assert.ok(Array.isArray(result.lsp_workspace_resource_ops));
    assert.ok(result.lsp_workspace_resource_ops.includes('rename'));
    const routesBody = fs.readFileSync(path.join(dir, 'internal/handlers/routes.go'), 'utf8');
    assert.match(routesBody, /func modernRoute\(\)/);
  });
});

test('java provider applies workspace resource rename through experimental LSP backend', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/main/java/com/example/demo/LegacyBillingService.java': [
        'package com.example.demo;',
        '',
        'class LegacyBillingService {',
        '}',
        '',
      ].join('\n'),
      'src/main/java/com/example/demo/BillingController.java': [
        'package com.example.demo;',
        '',
        'class BillingController {',
        '  LegacyBillingService service = new LegacyBillingService();',
        '}',
        '',
      ].join('\n'),
    });
    writeFakeRound2LspServer(path.join(dir, 'fake-lsp-round2.js'));
  }, (dir) => {
    const file = path.join(dir, 'src/main/java/com/example/demo/LegacyBillingService.java');
    const result = withEnv({
      EOC_JAVA_LSP_COMMAND: process.execPath,
      EOC_JAVA_LSP_ARGS: JSON.stringify([path.join(dir, 'fake-lsp-round2.js')]),
      FAKE_LSP_EXT: '.java',
      FAKE_LSP_FROM: 'LegacyBillingService',
      FAKE_LSP_PREPARE: '1',
      FAKE_LSP_RESOURCE_RENAME: '1',
    }, () => runRefactorOperation('rename-at', {
      baseDir: dir,
      file,
      line: 3,
      col: 8,
      toName: 'ModernBillingService',
      dryRun: false,
      backendPreference: 'lsp',
      provider: 'java-semantic',
    }));
    assert.equal(result.provider_id, 'java-semantic');
    assert.equal(result.execution_mode, 'semantic_ast');
    assert.equal(result.lsp_prepare_rename, true);
    assert.ok(result.lsp_workspace_resource_ops.includes('rename'));
    const oldPath = path.join(dir, 'src/main/java/com/example/demo/LegacyBillingService.java');
    const newPath = path.join(dir, 'src/main/java/com/example/demo/ModernBillingService.java');
    assert.equal(fs.existsSync(oldPath), false);
    assert.equal(fs.existsSync(newPath), true);
    const serviceBody = fs.readFileSync(newPath, 'utf8');
    const controllerBody = fs.readFileSync(path.join(dir, 'src/main/java/com/example/demo/BillingController.java'), 'utf8');
    assert.match(serviceBody, /class ModernBillingService/);
    assert.match(controllerBody, /ModernBillingService service = new ModernBillingService\(\)/);
  });
});

test('go provider rejects lsp-required mode when server does not advertise rename support', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': 'package handlers\n\nfunc legacyRoute() string { return "ok" }\n',
    });
    writeFakeRound2LspServer(path.join(dir, 'fake-lsp-round2.js'));
  }, (dir) => {
    assert.throws(() => withEnv({
      EOC_GO_LSP_COMMAND: process.execPath,
      EOC_GO_LSP_ARGS: JSON.stringify([path.join(dir, 'fake-lsp-round2.js')]),
      FAKE_LSP_EXT: '.go',
      FAKE_LSP_FROM: 'legacyRoute',
      FAKE_LSP_DISABLE_RENAME: '1',
    }, () => runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'legacyRoute',
      toName: 'modernRoute',
      dryRun: false,
      backendPreference: 'lsp-required',
      provider: 'go-semantic',
    })), /Go LSP rename failed: language server does not advertise renameProvider/);
  });
});

test('provider catalog and support-tier report expose round2 LSP metadata for go and java', () => {
  const providers = describeProviders();
  const goProvider = providers.find((provider) => provider.id === 'go-semantic');
  const javaProvider = providers.find((provider) => provider.id === 'java-semantic');
  assert.equal(goProvider.lsp_capability_negotiation, true);
  assert.equal(javaProvider.lsp_capability_negotiation, true);
  assert.equal(goProvider.lsp_prepare_rename_support, true);
  assert.equal(javaProvider.lsp_prepare_rename_support, true);
  assert.equal(goProvider.lsp_workspace_resource_ops_support, true);
  assert.equal(javaProvider.lsp_workspace_resource_ops_support, true);

  const report = buildSupportTierReport(path.resolve(__dirname, '..'));
  const goProfile = report.scripts['ast-rewrite'].acceptance.provider_profiles.find((provider) => provider.id === 'go-semantic');
  const javaProfile = report.scripts['ast-rewrite'].acceptance.provider_profiles.find((provider) => provider.id === 'java-semantic');
  assert.equal(goProfile.lsp_capability_negotiation, true);
  assert.equal(javaProfile.lsp_capability_negotiation, true);
  assert.equal(goProfile.lsp_prepare_rename_support, true);
  assert.equal(javaProfile.lsp_prepare_rename_support, true);
  assert.equal(goProfile.lsp_workspace_resource_ops_support, true);
  assert.equal(javaProfile.lsp_workspace_resource_ops_support, true);
});
