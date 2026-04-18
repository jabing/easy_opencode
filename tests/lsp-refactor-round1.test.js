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

function writeFakeLspServer(filePath) {
  const lines = [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    "const path = require('path');",
    "const { pathToFileURL } = require('url');",
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
    'function escapeRegExp(value) {',
    "  return String(value || '').replace(/[.*+?^$()|[\]\\]/g, '\\$&');",
    '}',
    'function handle(message) {',
    "  if (message.method === 'initialize') {",
    "    send({ jsonrpc: '2.0', id: message.id, result: { capabilities: { renameProvider: true } } });",
    '    return;',
    '  }',
    "  if (message.method === 'textDocument/rename') {",
    "    if (process.env.FAKE_LSP_FAIL === '1') {",
    "      send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'forced fake lsp failure' } });",
    '      return;',
    '    }',
    "    const ext = process.env.FAKE_LSP_EXT || '.go';",
    "    const fromName = process.env.FAKE_LSP_FROM || 'legacyName';",
    '    const files = collectFiles(process.cwd(), ext);',
    '    const changes = {};',
    '    for (const file of files) {',
    "      const original = fs.readFileSync(file, 'utf8');",
    "      const next = original.replace(new RegExp('\\\\b' + escapeRegExp(fromName) + '\\\\b', 'g'), message.params.newName);",
    '      if (next === original) continue;',
    '      changes[pathToFileURL(file).href] = [{ range: fullRange(original), newText: next }];',
    '    }',
    "    send({ jsonrpc: '2.0', id: message.id, result: { changes } });",
    '    return;',
    '  }',
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

test('go provider can route rename-symbol through experimental LSP backend', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': 'package handlers\n\nfunc legacyRoute() string { return "ok" }\n',
      'internal/handlers/wiring.go': 'package handlers\n\nfunc callRealRoute() string { return legacyRoute() }\n',
    });
    writeFakeLspServer(path.join(dir, 'fake-lsp.js'));
  }, (dir) => {
    const result = withEnv({
      EOC_GO_LSP_COMMAND: process.execPath,
      EOC_GO_LSP_ARGS: JSON.stringify([path.join(dir, 'fake-lsp.js')]),
      FAKE_LSP_EXT: '.go',
      FAKE_LSP_FROM: 'legacyRoute',
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
    assert.equal(result.semantic, true);
    assert.equal(result.backend, 'lsp');
    const routesBody = fs.readFileSync(path.join(dir, 'internal/handlers/routes.go'), 'utf8');
    const wiringBody = fs.readFileSync(path.join(dir, 'internal/handlers/wiring.go'), 'utf8');
    assert.match(routesBody, /func modernRoute\(\)/);
    assert.match(wiringBody, /modernRoute\(\)/);
  });
});

test('java provider can route rename-at through experimental LSP backend', () => {
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
    writeFakeLspServer(path.join(dir, 'fake-lsp.js'));
  }, (dir) => {
    const file = path.join(dir, 'src/main/java/com/example/demo/LegacyBillingService.java');
    const result = withEnv({
      EOC_JAVA_LSP_COMMAND: process.execPath,
      EOC_JAVA_LSP_ARGS: JSON.stringify([path.join(dir, 'fake-lsp.js')]),
      FAKE_LSP_EXT: '.java',
      FAKE_LSP_FROM: 'LegacyBillingService',
    }, () => runRefactorOperation('rename-at', {
      baseDir: dir,
      file,
      line: 3,
      col: 8,
      toName: 'ModernBillingService',
      dryRun: false,
      backendPreference: 'lsp',
    }));
    assert.equal(result.provider_id, 'java-semantic');
    assert.equal(result.execution_mode, 'semantic_ast');
    const serviceBody = fs.readFileSync(file, 'utf8');
    const controllerBody = fs.readFileSync(path.join(dir, 'src/main/java/com/example/demo/BillingController.java'), 'utf8');
    assert.match(serviceBody, /class ModernBillingService/);
    assert.match(controllerBody, /ModernBillingService service = new ModernBillingService\(\)/);
  });
});

test('go provider falls back to indexed symbol mode when experimental LSP backend fails in auto mode', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': 'package handlers\n\nfunc legacyRoute() string { return "ok" }\n',
      'internal/handlers/wiring.go': 'package handlers\n\nfunc callRealRoute() string { return legacyRoute() }\n',
    });
    writeFakeLspServer(path.join(dir, 'fake-lsp.js'));
  }, (dir) => {
    const result = withEnv({
      EOC_GO_LSP_COMMAND: process.execPath,
      EOC_GO_LSP_ARGS: JSON.stringify([path.join(dir, 'fake-lsp.js')]),
      FAKE_LSP_EXT: '.go',
      FAKE_LSP_FROM: 'legacyRoute',
      FAKE_LSP_FAIL: '1',
    }, () => runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'legacyRoute',
      toName: 'modernRoute',
      dryRun: false,
      backendPreference: 'auto',
      provider: 'go-semantic',
    }));
    assert.equal(result.provider_id, 'go-semantic');
    assert.equal(result.execution_mode, 'indexed_symbol');
    const body = fs.readFileSync(path.join(dir, 'internal/handlers/wiring.go'), 'utf8');
    assert.match(body, /modernRoute\(\)/);
  });
});

test('provider catalog and support-tier report expose experimental LSP metadata for go and java', () => {
  const providers = describeProviders();
  const goProvider = providers.find((provider) => provider.id === 'go-semantic');
  const javaProvider = providers.find((provider) => provider.id === 'java-semantic');
  assert.equal(goProvider.experimental_lsp_backend, true);
  assert.equal(javaProvider.experimental_lsp_backend, true);
  assert.ok(goProvider.backend_modes.includes('semantic_ast'));
  assert.ok(javaProvider.backend_modes.includes('semantic_ast'));
  assert.equal(typeof goProvider.lsp_available, 'boolean');
  assert.equal(typeof javaProvider.lsp_available, 'boolean');

  const report = buildSupportTierReport(path.resolve(__dirname, '..'));
  assert.deepEqual(new Set(report.domains.semantic_refactor.lsp_experimental_languages), new Set(['go', 'java']));
  const goProfile = report.scripts['ast-rewrite'].acceptance.provider_profiles.find((provider) => provider.id === 'go-semantic');
  assert.equal(goProfile.experimental_lsp_backend, true);
  assert.ok(Array.isArray(goProfile.backend_modes));
  assert.equal(typeof goProfile.lsp_available, 'boolean');
});
