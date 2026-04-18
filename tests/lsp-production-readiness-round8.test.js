const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runNodeJson, withTempDir } = require('./test-helpers.js');
const { describeProviders } = require('../src/core/refactor/service.js');
const { buildSupportTierReport } = require('../src/core/support-tiers/report.js');
const { discoverServerCommand } = require('../src/core/refactor/providers/lsp-backend.js');

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

test('lsp-production-readiness reports a multi-scenario matrix for simulated servers', () => {
  withTempDir((dir) => {
    writeProofLspServer(path.join(dir, 'fake-go-lsp.js'), '.go', 'legacyRoute', 'routes.go');
    writeProofLspServer(path.join(dir, 'fake-java-lsp.js'), '.java', 'LegacyBillingService', 'LegacyBillingService.java');
  }, (dir) => {
    const report = runNodeJson(SCRIPT, ['--root', ROOT, '--json'], {
      cwd: ROOT,
      env: {
        EOC_GO_LSP_COMMAND: path.join(dir, 'fake-go-lsp.js'),
        EOC_GO_LSP_ARGS: JSON.stringify([]),
        EOC_JAVA_LSP_COMMAND: path.join(dir, 'fake-java-lsp.js'),
        EOC_JAVA_LSP_ARGS: JSON.stringify([]),
      },
    });
    assert.equal(report.summary.scenario_matrix.go.total, 2);
    assert.equal(report.summary.scenario_matrix.java.total, 2);
    assert.equal(report.languages.go.scenarios.length, 2);
    assert.equal(report.languages.java.scenarios.length, 2);
    assert.equal(report.languages.go.validation_passed, true);
    assert.equal(report.languages.java.validation_passed, true);
    assert.equal(report.languages.go.proof_mode, 'simulated');
    assert.equal(report.languages.java.proof_mode, 'simulated');
    assert.equal(report.production_claim_ready, false);
  });
});

test('provider catalog and support-tier report expose real-server auto discovery and matrix metadata', () => {
  const providers = describeProviders();
  const goProvider = providers.find((provider) => provider.id === 'go-semantic');
  const javaProvider = providers.find((provider) => provider.id === 'java-semantic');
  assert.equal(goProvider.lsp_real_server_auto_discovery, true);
  assert.equal(javaProvider.lsp_real_server_auto_discovery, true);
  assert.equal(goProvider.lsp_production_matrix_support, true);
  assert.equal(javaProvider.lsp_production_matrix_support, true);

  const report = buildSupportTierReport(ROOT);
  assert.ok(report.domains.semantic_refactor.production_matrix_languages.includes('go'));
  assert.ok(report.domains.semantic_refactor.production_matrix_languages.includes('java'));
  assert.ok(report.domains.semantic_refactor.real_server_auto_discovery_languages.includes('go'));
  assert.ok(report.domains.semantic_refactor.real_server_auto_discovery_languages.includes('java'));
});

test('server discovery auto-detects Go binary and JDTLS launcher layouts', () => {
  withTempDir((dir) => {
    const fakeGo = path.join(dir, 'gopls');
    fs.writeFileSync(fakeGo, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    fs.chmodSync(fakeGo, 0o755);
    const jdtlsHome = path.join(dir, 'jdtls-home');
    fs.mkdirSync(path.join(jdtlsHome, 'plugins'), { recursive: true });
    fs.mkdirSync(path.join(jdtlsHome, 'config_linux'), { recursive: true });
    fs.writeFileSync(path.join(jdtlsHome, 'plugins', 'org.eclipse.equinox.launcher_1.7.0.jar'), 'jar');
  }, (dir) => {
    const fakeGo = path.join(dir, 'gopls');
    const jdtlsHome = path.join(dir, 'jdtls-home');
    const originalGoBin = process.env.EOC_GO_LSP_BIN;
    const originalJdtlsHome = process.env.JDTLS_HOME;
    process.env.EOC_GO_LSP_BIN = fakeGo;
    process.env.JDTLS_HOME = jdtlsHome;
    try {
      const goSpec = discoverServerCommand('go', { baseDir: ROOT });
      assert.equal(goSpec.command, path.resolve(fakeGo));
      const javaSpec = discoverServerCommand('java', { baseDir: ROOT });
      assert.ok(javaSpec.command.endsWith(path.sep + 'java') || javaSpec.command === 'java');
      assert.ok(javaSpec.args.includes('-jar'));
      assert.ok(javaSpec.args.some((entry) => entry.includes('org.eclipse.equinox.launcher_1.7.0.jar')));
      assert.ok(javaSpec.args.includes('-configuration'));
      assert.equal(javaSpec.probeStrategy, 'exists');
    } finally {
      if (typeof originalGoBin === 'undefined') delete process.env.EOC_GO_LSP_BIN;
      else process.env.EOC_GO_LSP_BIN = originalGoBin;
      if (typeof originalJdtlsHome === 'undefined') delete process.env.JDTLS_HOME;
      else process.env.JDTLS_HOME = originalJdtlsHome;
    }
  });
});
