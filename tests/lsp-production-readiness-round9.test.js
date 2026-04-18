const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { runNodeJson, withTempDir } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'lsp-production-readiness.js');

function writeProofLspServer(filePath, ext, fromName, primaryFileName) {
  const lines = [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    "const path = require('path');",
    "const { pathToFileURL, fileURLToPath } = require('url');",
    "if (process.argv.includes('version') || process.argv.includes('--version')) { console.log(process.env.FAKE_LSP_VERSION || 'fake-lsp proof 1.0.0'); process.exit(0); }",
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
    'function collectFiles(root, extension, acc = []) {',
    "  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {",
    "    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'build' || entry.name === '.gradle') continue;",
    '    const abs = path.join(root, entry.name);',
    '    if (entry.isDirectory()) collectFiles(abs, extension, acc);',
    '    else if (entry.isFile() && abs.endsWith(extension)) acc.push(abs);',
    '  }',
    '  return acc;',
    '}',
    'function replaceMany(text, fromValues, toValue) {',
    "  let next = String(text || '');",
    "  for (const fromValue of fromValues) next = next.split(String(fromValue || '')).join(String(toValue || ''));",
    "  return next;",
    '}',
    'function handle(message) {',
    "  if (message.method === 'initialize') {",
    '    rootDir = fileURLToPath(message.params.rootUri);',
    "    send({ jsonrpc: '2.0', id: message.id, result: { capabilities: { renameProvider: { prepareProvider: true }, workspace: { workspaceEdit: { documentChanges: true, resourceOperations: ['create', 'rename', 'delete'] } } } } });",
    '    return;',
    '  }',
    "  if (message.method === 'initialized' || message.method === 'workspace/didChangeConfiguration' || message.method === 'textDocument/didOpen' || message.method === 'textDocument/didClose') return;",
    `  if (message.method === 'textDocument/prepareRename') { send({ jsonrpc: '2.0', id: message.id, result: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, placeholder: '${fromName}' } }); return; }`,
    "  if (message.method === 'textDocument/rename') {",
    `    const files = collectFiles(rootDir, '${ext}');`,
    `    const primaryName = ${JSON.stringify(primaryFileName)};`,
    '    const primary = files.find((item) => item.endsWith(path.sep + primaryName)) || files[0];',
    '    const documentChanges = [];',
    '    for (const file of files) {',
    "      const original = fs.readFileSync(file, 'utf8');",
    `      const renameTargets = ['${fromName}', 'userName', 'status'];`,
    "      const next = replaceMany(original, renameTargets, message.params.newName);",
    '      if (next === original) continue;',
    "      if (file === primary && file.endsWith('.java')) {",
    "        const renamed = path.join(path.dirname(file), message.params.newName + '.java');",
    "        documentChanges.push({ kind: 'rename', oldUri: pathToFileURL(file).href, newUri: pathToFileURL(renamed).href });",
    "        documentChanges.push({ textDocument: { uri: pathToFileURL(renamed).href, version: null }, edits: [{ range: fullRange(original), newText: next }] });",
    '      } else {',
    "        documentChanges.push({ textDocument: { uri: pathToFileURL(file).href, version: null }, edits: [{ range: fullRange(original), newText: next }] });",
    '      }',
    '    }',
    "    send({ jsonrpc: '2.0', id: message.id, result: { documentChanges } });",
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

test('lsp-production-readiness exposes claim blockers and environment snapshot when real servers are unavailable', () => {
  const report = runNodeJson(SCRIPT, ['--root', ROOT, '--json'], {
    cwd: ROOT,
    env: {
      PATH: '',
      GO: 'go',
      EOC_GO_LSP_COMMAND: 'missing-gopls',
      EOC_JAVA_LSP_COMMAND: 'missing-jdtls',
      EOC_JAVA_LSP_HOME: '',
      JDTLS_HOME: '',
    },
  });
  assert.equal(report.production_claim_ready, false);
  assert.ok(report.summary.verification_blocked_languages.includes('go'));
  assert.ok(report.summary.verification_blocked_languages.includes('java'));
  assert.equal(report.languages.go.readiness_stage, 'verification_blocked');
  assert.equal(report.languages.java.readiness_stage, 'verification_blocked');
  assert.ok(Array.isArray(report.claim_blockers));
  assert.ok(report.claim_blockers.some((entry) => entry.language === 'go'));
  assert.ok(report.claim_blockers.some((entry) => entry.language === 'java'));
  assert.equal(typeof report.environment_snapshot.go_binary_available, 'boolean');
  assert.equal(typeof report.environment_snapshot.java_binary_available, 'boolean');
  assert.ok(Array.isArray(report.languages.go.next_actions));
  assert.ok(Array.isArray(report.languages.java.next_actions));
  assert.ok(report.languages.go.claim_blockers.length > 0);
  assert.ok(report.languages.java.claim_blockers.length > 0);
});

test('simulated servers remain verification-blocked and emit real-server claim blockers', () => {
  withTempDir((dir) => {
    writeProofLspServer(path.join(dir, 'fake-go-lsp.js'), '.go', 'legacyRoute', 'routes.go');
    writeProofLspServer(path.join(dir, 'fake-java-lsp.js'), '.java', 'LegacyBillingService', 'LegacyBillingService.java');
  }, (dir) => {
    const report = runNodeJson(SCRIPT, ['--root', ROOT, '--json'], {
      cwd: ROOT,
      env: {
        EOC_GO_LSP_COMMAND: process.execPath,
      EOC_GO_LSP_ARGS: JSON.stringify([path.join(dir, 'fake-go-lsp.js')]),
        EOC_JAVA_LSP_COMMAND: process.execPath,
      EOC_JAVA_LSP_ARGS: JSON.stringify([path.join(dir, 'fake-java-lsp.js')]),
      },
    });
    assert.equal(report.languages.go.readiness_stage, 'verification_blocked');
    assert.equal(report.languages.java.readiness_stage, 'verification_blocked');
    assert.ok(report.languages.go.claim_blockers.some((entry) => entry.kind === 'real_server_not_verified'));
    assert.ok(report.languages.java.claim_blockers.some((entry) => entry.kind === 'real_server_not_verified'));
    assert.ok(report.languages.go.next_actions.some((entry) => /real gopls/i.test(entry)));
    assert.ok(report.languages.java.next_actions.some((entry) => /real gopls \/ jdtls|real jdtls|Replace fake/i.test(entry)));
  });
});
