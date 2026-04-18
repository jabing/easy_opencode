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

function writeProbeAwareLspServer(filePath) {
  const lines = [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    "const path = require('path');",
    "const { pathToFileURL } = require('url');",
    "if (process.argv.includes('version') || process.argv.includes('--version')) { console.log(process.env.FAKE_LSP_VERSION || 'fake-lsp 1.2.3'); process.exit(0); }",
    'let buffer = Buffer.alloc(0);',
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
    "    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'build') continue;",
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
    "    send({ jsonrpc: '2.0', id: message.id, result: { capabilities: { renameProvider: { prepareProvider: true } } } });",
    '    return;',
    '  }',
    "  if (message.method === 'initialized') return;",
    "  if (message.method === 'workspace/didChangeConfiguration') return;",
    "  if (message.method === 'textDocument/didOpen') {",
    "    if (process.env.EMIT_DIAGNOSTICS === '1') send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: message.params.textDocument.uri, diagnostics: [{ severity: 2, message: 'fake warning' }, { severity: 1, message: 'fake error' }] } });",
    "    if (process.env.EMIT_LOG === '1') send({ jsonrpc: '2.0', method: 'window/logMessage', params: { type: 3, message: 'fake server log' } });",
    '    return;',
    '  }',
    "  if (message.method === 'textDocument/prepareRename') {",
    "    if (process.env.PREPARE_REJECT === '1') { send({ jsonrpc: '2.0', id: message.id, result: null }); return; }",
    "    send({ jsonrpc: '2.0', id: message.id, result: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, placeholder: process.env.FAKE_LSP_FROM || 'legacyName' } });",
    '    return;',
    '  }',
    "  if (message.method === 'textDocument/rename') {",
    "    const ext = process.env.FAKE_LSP_EXT || '.go';",
    "    const fromName = process.env.FAKE_LSP_FROM || 'legacyName';",
    '    const files = collectFiles(process.cwd(), ext);',
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
    "  if (message.method === 'exit') { process.exit(0); }",
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

test('go LSP path captures diagnostics, log messages, and probe metadata', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': 'package handlers\n\nfunc legacyRoute() string { return "ok" }\n',
      'internal/handlers/wiring.go': 'package handlers\n\nfunc callRealRoute() string { return legacyRoute() }\n',
    });
    writeProbeAwareLspServer(path.join(dir, 'fake-probe-lsp.js'));
  }, (dir) => {
    const result = withEnv({
      EOC_GO_LSP_COMMAND: process.execPath,
      EOC_GO_LSP_ARGS: JSON.stringify([path.join(dir, 'fake-probe-lsp.js')]),
      FAKE_LSP_EXT: '.go',
      FAKE_LSP_FROM: 'legacyRoute',
      EMIT_DIAGNOSTICS: '1',
      EMIT_LOG: '1',
      FAKE_LSP_VERSION: 'gopls fake 9.9.9',
    }, () => runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'legacyRoute',
      toName: 'modernRoute',
      dryRun: false,
      backendPreference: 'lsp',
      provider: 'go-semantic',
    }));
    assert.equal(result.backend, 'lsp');
    assert.equal(result.execution_mode, 'semantic_ast');
    assert.equal(result.lsp_diagnostics_count, 2);
    assert.equal(result.lsp_diagnostic_summary.error, 1);
    assert.equal(result.lsp_diagnostic_summary.warning, 1);
    assert.ok(result.lsp_server_version === '' || result.lsp_server_version === 'gopls fake 9.9.9');
    assert.equal(result.lsp_server_command_resolved, process.execPath);
    if (result.lsp_server_probe) assert.match(result.lsp_server_probe, /gopls fake 9\.9\.9/);
    assert.ok(Array.isArray(result.lsp_server_messages));
    assert.ok(result.lsp_server_messages.some((entry) => entry.message === 'fake server log'));
  });
});

test('java auto mode reports classified LSP fallback metadata when prepareRename is rejected', () => {
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
    writeProbeAwareLspServer(path.join(dir, 'fake-probe-lsp.js'));
  }, (dir) => {
    const file = path.join(dir, 'src/main/java/com/example/demo/LegacyBillingService.java');
    const result = withEnv({
      EOC_JAVA_LSP_COMMAND: process.execPath,
      EOC_JAVA_LSP_ARGS: JSON.stringify([path.join(dir, 'fake-probe-lsp.js')]),
      FAKE_LSP_EXT: '.java',
      FAKE_LSP_FROM: 'LegacyBillingService',
      PREPARE_REJECT: '1',
    }, () => runRefactorOperation('rename-at', {
      baseDir: dir,
      file,
      line: 3,
      col: 8,
      toName: 'ModernBillingService',
      dryRun: false,
      backendPreference: 'auto',
      provider: 'java-semantic',
    }));
    assert.equal(result.execution_mode, 'indexed_symbol');
    assert.equal(result.lsp_attempted, true);
    assert.equal(result.lsp_failed, true);
    assert.equal(result.lsp_failure_kind, 'prepare_rename_rejected');
    assert.match(result.lsp_failure_message, /prepareRename/i);
    assert.equal(result.backend_fallback, 'indexed_symbol');
    const body = fs.readFileSync(path.join(dir, 'src/main/java/com/example/demo/BillingController.java'), 'utf8');
    assert.match(body, /ModernBillingService service/);
  });
});

test('go lsp-required mode surfaces classified failure details', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'internal/handlers/routes.go': 'package handlers\n\nfunc legacyRoute() string { return "ok" }\n',
    });
    writeProbeAwareLspServer(path.join(dir, 'fake-probe-lsp.js'));
  }, (dir) => {
    assert.throws(() => withEnv({
      EOC_GO_LSP_COMMAND: process.execPath,
      EOC_GO_LSP_ARGS: JSON.stringify([path.join(dir, 'fake-probe-lsp.js')]),
      FAKE_LSP_EXT: '.go',
      FAKE_LSP_FROM: 'legacyRoute',
      PREPARE_REJECT: '1',
    }, () => runRefactorOperation('rename-symbol', {
      baseDir: dir,
      fromName: 'legacyRoute',
      toName: 'modernRoute',
      dryRun: false,
      backendPreference: 'lsp-required',
      provider: 'go-semantic',
    })), /prepare_rename_rejected/);
  });
});

test('provider catalog and support-tier report expose round4 LSP production-hardening metadata', () => {
  const providers = describeProviders();
  const goProvider = providers.find((provider) => provider.id === 'go-semantic');
  const javaProvider = providers.find((provider) => provider.id === 'java-semantic');
  assert.equal(goProvider.lsp_server_probe_support, true);
  assert.equal(javaProvider.lsp_server_probe_support, true);
  assert.equal(goProvider.lsp_failure_classification, true);
  assert.equal(javaProvider.lsp_failure_classification, true);
  assert.equal(goProvider.lsp_diagnostics_capture, true);
  assert.equal(javaProvider.lsp_diagnostics_capture, true);

  const report = buildSupportTierReport(path.resolve(__dirname, '..'));
  const goProfile = report.scripts['ast-rewrite'].acceptance.provider_profiles.find((provider) => provider.id === 'go-semantic');
  const javaProfile = report.scripts['ast-rewrite'].acceptance.provider_profiles.find((provider) => provider.id === 'java-semantic');
  assert.equal(goProfile.lsp_server_probe_support, true);
  assert.equal(javaProfile.lsp_server_probe_support, true);
  assert.equal(goProfile.lsp_failure_classification, true);
  assert.equal(javaProfile.lsp_failure_classification, true);
  assert.equal(goProfile.lsp_diagnostics_capture, true);
  assert.equal(javaProfile.lsp_diagnostics_capture, true);
});
