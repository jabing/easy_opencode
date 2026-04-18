const fs = require('fs');
const { spawnSync } = require('child_process');
const { runBuildCheck } = require('./build-check.js');
const { runMetadataCheck } = require('./metadata-check.js');
const { runSyntaxCheck } = require('../syntax-check.js');

/**
 * @typedef {{ name: string, ok: boolean, detail: string, meta?: Record<string, unknown> }} BridgeCheck
 * @typedef {{ ok: boolean, checks: BridgeCheck[], mode: string, message: string }} BridgeResult
 */

/** @param {string} root */
function resolvePackCommand(root) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && fs.existsSync(npmExecPath)) {
    return {
      command: process.execPath,
      args: [npmExecPath, 'pack', '--dry-run'],
      printable: `${process.execPath} ${npmExecPath} pack --dry-run`,
      cwd: root,
    };
  }
  return {
    command: 'npm',
    args: ['pack', '--dry-run'],
    printable: 'npm pack --dry-run',
    cwd: root,
  };
}

/** @param {string} [root] */
function runPackDryRun(root = process.cwd()) {
  const invocation = resolvePackCommand(root);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  if (result.error) {
    return {
      ok: false,
      command: invocation.printable,
      status: typeof result.status === 'number' ? result.status : 1,
      stdout,
      stderr: stderr || String(result.error.message || result.error),
    };
  }
  return {
    ok: result.status === 0,
    command: invocation.printable,
    status: typeof result.status === 'number' ? result.status : 0,
    stdout,
    stderr,
  };
}

/** @param {string} [root] @param {{ runMetadataCheck?: typeof runMetadataCheck, runSyntaxCheck?: typeof runSyntaxCheck }} [deps] @returns {BridgeResult} */
function runLintBridge(root = process.cwd(), deps = {}) {
  const metadataResult = (deps.runMetadataCheck || runMetadataCheck)(root);
  const syntaxResult = (deps.runSyntaxCheck || runSyntaxCheck)(root);
  const syntaxMeta = syntaxResult && typeof syntaxResult === 'object'
    ? {
        checked: Number(syntaxResult.checked || 0),
        skippedTs: Number(syntaxResult.skippedTs || 0),
        degraded: Boolean(syntaxResult.degraded),
      }
    : null;
  /** @type {BridgeCheck[]} */
  const checks = [
    {
      name: 'metadata-check',
      ok: Boolean(metadataResult && metadataResult.ok),
      detail: metadataResult && metadataResult.ok
        ? String(metadataResult.detail || 'metadata is synchronized')
        : Array.isArray(metadataResult && metadataResult.failures) && metadataResult.failures.length > 0
          ? metadataResult.failures.join('; ')
          : 'metadata consistency check failed',
    },
    {
      name: 'syntax-check',
      ok: Boolean(syntaxResult && syntaxResult.ok),
      detail: syntaxResult && syntaxResult.ok
        ? `checked=${Number(syntaxResult.checked || 0)}${syntaxResult.degraded ? ` degraded ts_skipped=${Number(syntaxResult.skippedTs || 0)}` : ''}`
        : Array.isArray(syntaxResult && syntaxResult.failures) && syntaxResult.failures.length > 0
          ? syntaxResult.failures.slice(0, 5).join('; ')
          : 'syntax validation failed',
      ...(syntaxMeta ? { meta: syntaxMeta } : {}),
    },
  ];
  return {
    ok: checks.every((item) => item.ok),
    checks,
    mode: 'compatibility-bridge',
    message: 'lint now aggregates repository metadata consistency and source syntax validation',
  };
}

/** @param {string} [root] @param {{ runBuildCheck?: typeof runBuildCheck, runPackDryRun?: typeof runPackDryRun }} [deps] @returns {BridgeResult} */
function runBuildBridge(root = process.cwd(), deps = {}) {
  const repoCheck = (deps.runBuildCheck || runBuildCheck)(root);
  const packResult = (deps.runPackDryRun || runPackDryRun)(root);
  const packMeta = packResult && typeof packResult === 'object'
    ? { command: String(packResult.command || 'npm pack --dry-run'), status: Number(packResult.status || 0) }
    : null;
  /** @type {BridgeCheck[]} */
  const checks = [
    {
      name: 'repo-check',
      ok: Boolean(repoCheck && repoCheck.ok),
      detail: repoCheck && repoCheck.ok
        ? 'repository assets are synchronized'
        : [
            ...(Array.isArray(repoCheck && repoCheck.missing) ? repoCheck.missing.map((item) => `missing ${item}`) : []),
            ...(Array.isArray(repoCheck && repoCheck.reasons) ? repoCheck.reasons : []),
          ].join('; ') || 'repository consistency check failed',
    },
    {
      name: 'pack-dry-run',
      ok: Boolean(packResult && packResult.ok),
      detail: packResult && packResult.ok
        ? `validated with ${String(packResult.command || 'npm pack --dry-run')}`
        : [String(packResult && packResult.command || 'npm pack --dry-run'), String(packResult && (packResult.stderr || packResult.stdout) || 'pack dry-run failed')].filter(Boolean).join(': '),
      ...(packMeta ? { meta: packMeta } : {}),
    },
  ];
  return {
    ok: checks.every((item) => item.ok),
    checks,
    mode: 'compatibility-bridge',
    message: 'build now validates repository consistency and package publishability while the dedicated production build pipeline is phased in',
  };
}

/** @param {'build' | 'lint'} kind @param {BridgeResult} result */
function printBridgeResult(kind, result) {
  const label = kind === 'build' ? 'build' : 'lint';
  if (!result.ok) {
    process.stderr.write(`[${label}] FAIL (${result.mode})\n`);
    for (const check of result.checks) {
      const prefix = check.ok ? '+' : '-';
      process.stderr.write(`${prefix} ${check.name}: ${check.detail}\n`);
    }
    process.stderr.write(`note: ${result.message}\n`);
    process.exit(1);
  }
  process.stdout.write(`[${label}] PASS (${result.mode})\n`);
  for (const check of result.checks) process.stdout.write(`- ${check.name}: ${check.detail}\n`);
  process.stdout.write(`note: ${result.message}\n`);
}

module.exports = {
  resolvePackCommand,
  runPackDryRun,
  runLintBridge,
  runBuildBridge,
  printBridgeResult,
};
