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

function writeFakeRound3LspServer(filePath) {
  const lines = [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    "const path = require('path');",
    "const { fileURLToPath, pathToFileURL } = require('url');",
    'let buffer = Buffer.alloc(0);',
    'const pending = new Map();',
    'let nextId = 1000;',
    'let initialized = false;',
    'let configurationOk = false;',
    'let foldersOk = false;',
    'function send(message) {',
    "  const body = Buffer.from(JSON.stringify(message), 'utf8');",
    "  process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');",
    '  process.stdout.write(body);',
    '}',
    'function request(method, params) {',
    '  const id = ++nextId;',
    '  send({ jsonrpc: "2.0", id, method, params });',
    '  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));',
    '}',
    'function fullRange(text) {',
    "  const lines = String(text || '').split('\\n');",
    '  return { start: { line: 0, character: 0 }, end: { line: lines.length, character: 0 } };',
    '}',
    'function collectFiles(root, ext, acc = []) {',
    "  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {",
    "    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'build') continue;",
    '    const abs = path.join(root, entry.name);',
    '    if (entry.isDirectory()) collectFiles(abs, ext, acc);',
    '    else if (entry.isFile() && abs.endsWith(ext)) acc.push(abs);',
    '  }',
    '  return acc;',
    '}',
    'async function handleInitialized() {',
    '  initialized = true;',
    '  if (process.env.REQUEST_CONFIGURATION === "1") {',
    '    const section = process.env.EXPECT_SECTION || "";',
    '    const response = await request("workspace/configuration", { items: [{ section }] });',
    '    const expected = process.env.EXPECT_VALUE_JSON || "null";',
    '    configurationOk = JSON.stringify((response || [null])[0]) === expected;',
    '  } else { configurationOk = true; }',
    '  if (process.env.REQUEST_WORKSPACE_FOLDERS === "1") {',
    '    const response = await request("workspace/workspaceFolders", {});',
    '    const expectedRoot = process.env.EXPECT_ROOT || "";',
    '    foldersOk = Array.isArray(response) && response.some((item) => item && item.uri === pathToFileURL(expectedRoot).href);',
    '  } else { foldersOk = true; }',
    '}',
    'async function handleRename(message) {',
    '  const expectedRoot = process.env.EXPECT_ROOT || "";',
    '  if (process.env.FAIL_IF_NOT_INITIALIZED === "1" && !initialized) {',
    '    send({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "initialized hook not observed" } });',
    '    return;',
    '  }',
    '  if (expectedRoot && process.env.ACTUAL_ROOT_URI !== pathToFileURL(expectedRoot).href) {',
    '    send({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "unexpected rootUri" } });',
    '    return;',
    '  }',
    '  if (!configurationOk) { send({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "workspace/configuration mismatch" } }); return; }',
    '  if (!foldersOk) { send({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "workspaceFolders mismatch" } }); return; }',
    '  const ext = process.env.FAKE_LSP_EXT || ".go";',
    '  const fromName = process.env.FAKE_LSP_FROM || "legacyName";',
    '  const files = collectFiles(process.cwd(), ext);',
    '  if (process.env.USE_APPLY_EDIT_REQUEST === "1") {',
    '    const changes = {};',
    '    for (const file of files) {',
    "      const original = fs.readFileSync(file, 'utf8');",
    '      const next = original.split(fromName).join(message.params.newName);',
    '      if (next === original) continue;',
    '      changes[pathToFileURL(file).href] = [{ range: fullRange(original), newText: next }];',
    '    }',
    '    const applied = await request("workspace/applyEdit", { edit: { changes } });',
    '    if (!applied || applied.applied !== true) {',
    '      send({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "workspace/applyEdit rejected" } });',
    '      return;',
    '    }',
    '    send({ jsonrpc: "2.0", id: message.id, result: null });',
    '    return;',
    '  }',
    '  const changes = {};',
    '  for (const file of files) {',
    "    const original = fs.readFileSync(file, 'utf8');",
    '    const next = original.split(fromName).join(message.params.newName);',
    '    if (next === original) continue;',
    '    changes[pathToFileURL(file).href] = [{ range: fullRange(original), newText: next }];',
    '  }',
    '  send({ jsonrpc: "2.0", id: message.id, result: { changes } });',
    '}',
    'async function handle(message) {',
    '  if (typeof message.id !== "undefined" && pending.has(message.id)) {',
    '    const waiter = pending.get(message.id);',
    '    pending.delete(message.id);',
    '    if (message.error) waiter.reject(new Error(message.error.message || "request failed"));',
    '    else waiter.resolve(message.result);',
    '    return;',
    '  }',
    '  if (message.method === "initialize") {',
    '    process.env.ACTUAL_ROOT_URI = message.params.rootUri;',
    '    send({ jsonrpc: "2.0", id: message.id, result: { capabilities: { renameProvider: { prepareProvider: true }, workspace: { workspaceEdit: { documentChanges: true, resourceOperations: ["create", "rename", "delete"] } } } } });',
    '    return;',
    '  }',
    '  if (message.method === "initialized") { await handleInitialized(); return; }',
    '  if (message.method === "workspace/didChangeConfiguration") { return; }',
    '  if (message.method === "textDocument/didOpen") { return; }',
    '  if (message.method === "textDocument/prepareRename") { send({ jsonrpc: "2.0", id: message.id, result: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, placeholder: process.env.FAKE_LSP_FROM || "legacyName" } }); return; }',
    '  if (message.method === "textDocument/rename") { await handleRename(message); return; }',
    '  if (message.method === "shutdown") { send({ jsonrpc: "2.0", id: message.id, result: null }); return; }',
    '  if (message.method === "exit") { process.exit(0); }',
    '  if (typeof message.id !== "undefined") send({ jsonrpc: "2.0", id: message.id, result: null });',
    '}',
    'process.stdin.on("data", async (chunk) => {',
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
    '    await handle(JSON.parse(body));',
    '  }',
    '});',
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

test('go provider handles workspace/configuration + applyEdit requests and detects module root', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': 'package handlers\n\nfunc legacyRoute() string { return "ok" }\n',
      'internal/handlers/wiring.go': 'package handlers\n\nfunc callRealRoute() string { return legacyRoute() }\n',
    });
    writeFakeRound3LspServer(path.join(dir, 'fake-lsp-round3.js'));
  }, (dir) => {
    const nestedBaseDir = path.join(dir, 'internal', 'handlers');
    const result = withEnv({
      EOC_GO_LSP_COMMAND: process.execPath,
      EOC_GO_LSP_ARGS: JSON.stringify([path.join(dir, 'fake-lsp-round3.js')]),
      EOC_GO_LSP_SETTINGS: JSON.stringify({ gopls: { hints: { assignVariableTypes: true } } }),
      FAKE_LSP_EXT: '.go',
      FAKE_LSP_FROM: 'legacyRoute',
      REQUEST_CONFIGURATION: '1',
      EXPECT_SECTION: 'gopls',
      EXPECT_VALUE_JSON: JSON.stringify({ hints: { assignVariableTypes: true } }),
      EXPECT_ROOT: dir,
      USE_APPLY_EDIT_REQUEST: '1',
      FAIL_IF_NOT_INITIALIZED: '1',
    }, () => runRefactorOperation('rename-symbol', {
      baseDir: nestedBaseDir,
      fromName: 'legacyRoute',
      toName: 'modernRoute',
      dryRun: false,
      backendPreference: 'lsp',
      provider: 'go-semantic',
    }));
    assert.equal(result.provider_id, 'go-semantic');
    assert.equal(result.backend, 'lsp');
    assert.equal(result.execution_mode, 'semantic_ast');
    assert.equal(result.lsp_workspace_root, dir);
    assert.ok(Array.isArray(result.lsp_workspace_folders));
    assert.ok(result.lsp_workspace_folders.includes(dir));
    assert.equal(result.lsp_workspace_configuration_requested, true);
    assert.equal(result.lsp_apply_edit_requests, 1);
    assert.ok(result.lsp_server_requests_handled >= 2);
    const routesBody = fs.readFileSync(path.join(dir, 'internal/handlers/routes.go'), 'utf8');
    const wiringBody = fs.readFileSync(path.join(dir, 'internal/handlers/wiring.go'), 'utf8');
    assert.match(routesBody, /func modernRoute\(/);
    assert.match(wiringBody, /modernRoute\(/);
  });
});

test('java provider detects nearest build root and serves workspace/configuration to LSP server', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'pom.xml': '<project/>\n',
      'module-a/pom.xml': '<project/>\n',
      'module-a/src/main/java/com/example/demo/LegacyBillingService.java': [
        'package com.example.demo;',
        '',
        'class LegacyBillingService {',
        '}',
        '',
      ].join('\n'),
      'module-a/src/main/java/com/example/demo/BillingController.java': [
        'package com.example.demo;',
        '',
        'class BillingController {',
        '  LegacyBillingService service = new LegacyBillingService();',
        '}',
        '',
      ].join('\n'),
    });
    writeFakeRound3LspServer(path.join(dir, 'fake-lsp-round3.js'));
  }, (dir) => {
    const moduleRoot = path.join(dir, 'module-a');
    const file = path.join(moduleRoot, 'src/main/java/com/example/demo/LegacyBillingService.java');
    const result = withEnv({
      EOC_JAVA_LSP_COMMAND: process.execPath,
      EOC_JAVA_LSP_ARGS: JSON.stringify([path.join(dir, 'fake-lsp-round3.js')]),
      EOC_JAVA_LSP_SETTINGS: JSON.stringify({ java: { format: { enabled: false } } }),
      FAKE_LSP_EXT: '.java',
      FAKE_LSP_FROM: 'LegacyBillingService',
      REQUEST_CONFIGURATION: '1',
      EXPECT_SECTION: 'java',
      EXPECT_VALUE_JSON: JSON.stringify({ format: { enabled: false } }),
      EXPECT_ROOT: moduleRoot,
      FAIL_IF_NOT_INITIALIZED: '1',
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
    assert.equal(result.backend, 'lsp');
    assert.equal(result.execution_mode, 'semantic_ast');
    assert.equal(result.lsp_workspace_root, moduleRoot);
    assert.ok(result.lsp_workspace_folders.includes(moduleRoot));
    assert.equal(result.lsp_workspace_configuration_requested, true);
    assert.ok(result.lsp_server_requests_handled >= 1);
    const serviceBody = fs.readFileSync(file, 'utf8');
    const controllerBody = fs.readFileSync(path.join(moduleRoot, 'src/main/java/com/example/demo/BillingController.java'), 'utf8');
    assert.match(serviceBody, /class ModernBillingService/);
    assert.match(controllerBody, /ModernBillingService service/);
  });
});

test('provider catalog and support-tier report expose round3 LSP metadata', () => {
  const providers = describeProviders();
  const goProvider = providers.find((provider) => provider.id === 'go-semantic');
  const javaProvider = providers.find((provider) => provider.id === 'java-semantic');
  assert.equal(goProvider.lsp_server_requests_support, true);
  assert.equal(javaProvider.lsp_server_requests_support, true);
  assert.equal(goProvider.lsp_workspace_configuration_support, true);
  assert.equal(javaProvider.lsp_workspace_configuration_support, true);
  assert.equal(goProvider.lsp_project_root_detection, true);
  assert.equal(javaProvider.lsp_project_root_detection, true);

  const report = buildSupportTierReport(path.resolve(__dirname, '..'));
  const goProfile = report.scripts['ast-rewrite'].acceptance.provider_profiles.find((provider) => provider.id === 'go-semantic');
  const javaProfile = report.scripts['ast-rewrite'].acceptance.provider_profiles.find((provider) => provider.id === 'java-semantic');
  assert.equal(goProfile.lsp_server_requests_support, true);
  assert.equal(javaProfile.lsp_server_requests_support, true);
  assert.equal(goProfile.lsp_workspace_configuration_support, true);
  assert.equal(javaProfile.lsp_workspace_configuration_support, true);
  assert.equal(goProfile.lsp_project_root_detection, true);
  assert.equal(javaProfile.lsp_project_root_detection, true);
});
