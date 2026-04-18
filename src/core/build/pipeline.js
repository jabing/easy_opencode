const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runBuildCheck } = require('../checks/build-check.js');

/**
 * @typedef {{ ok: boolean, missing: string[], reasons: string[] }} BuildCheckResult
 * @typedef {{ command: string, args: string[], printable: string, cwd: string, viaShell?: boolean }} CommandInvocation
 * @typedef {{ path: string, size?: number }} PackedFileEntry
 * @typedef {{ filename?: string, files?: PackedFileEntry[] }} PackJsonEntry
 * @typedef {{ ok: boolean, command: string, status: number, stdout: string, stderr: string, payload: PackJsonEntry[] }} PackCommandResult
 * @typedef {{ ok: boolean, required: string[], missing: string[], forbidden: string[], present_forbidden: string[], bins: string[], missing_bins: string[] }} PackedContentCheck
 * @typedef {{ name: string, ok: boolean, detail: string, meta?: Record<string, unknown> }} BuildPipelineCheck
 * @typedef {{ ok: boolean, mode: 'production-pipeline', checks: BuildPipelineCheck[], artifact?: { filename: string | null, files: number, unpackedSize: number }, message: string }} BuildPipelineResult
 */

const REQUIRED_PACKED_FILES = [
  'AGENTS.md',
  'README.md',
  'LICENSE',
  'opencode.json',
  '.opencode/command-policy.json',
  '.opencode/hooks-config.json',
  '.opencode/instructions/INSTRUCTIONS.md',
  '.opencode/plugins/eoc-hooks.ts',
];

const FORBIDDEN_PACKED_PREFIXES = [
  '.opencode/coder-loop/',
  '.opencode/implementation-plans/',
  '.opencode/observability/',
  '.opencode/orchestrator/',
  '.opencode/reviews/',
  '.opencode/eoc-run/',
  '.opencode/task-bundles/',
];

/** @param {string} root */
function resolvePackCommand(root) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && fs.existsSync(npmExecPath)) {
    return {
      command: process.execPath,
      args: [npmExecPath, 'pack', '--json'],
      printable: `${process.execPath} ${npmExecPath} pack --json`,
      cwd: root,
    };
  }
  if (process.platform === 'win32') {
    const shell = process.env.ComSpec || 'cmd.exe';
    return {
      command: shell,
      args: ['/d', '/c', 'npm pack --json'],
      printable: `${shell} /d /c npm pack --json`,
      cwd: root,
      viaShell: true,
    };
  }
  return {
    command: 'npm',
    args: ['pack', '--json'],
    printable: 'npm pack --json',
    cwd: root,
  };
}

/**
 * @param {CommandInvocation} invocation
 * @param {string} tempDir
 * @returns {string[]}
 */
function appendPackDestinationArgs(invocation, tempDir) {
  if (invocation.viaShell) {
    return ['/d', '/c', `npm pack --json --pack-destination ${tempDir}`];
  }
  return [...invocation.args, '--pack-destination', tempDir];
}

/** @param {string} stdout */
function parsePackPayload(stdout) {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item) => item && typeof item === 'object').map((item) => ({
    filename: typeof item.filename === 'string' ? item.filename : undefined,
    files: Array.isArray(item.files)
      ? item.files
        .filter(/** @param {unknown} entry */ (entry) => Boolean(entry) && typeof entry === 'object')
        .map(/** @param {{ path?: unknown, size?: unknown }} entry */ (entry) => ({
          path: typeof entry.path === 'string' ? entry.path : '',
          size: typeof entry.size === 'number' ? entry.size : undefined,
        }))
        .filter(/** @param {PackedFileEntry} entry */ (entry) => Boolean(entry.path))
      : undefined,
  }));
}

/**
 * @param {string} root
 * @param {{ tempDir?: string }} [options]
 * @returns {PackCommandResult}
 */
function runPackCommand(root, options = {}) {
  const tempDir = options.tempDir || fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-build-'));
  const invocation = resolvePackCommand(root);
  const args = appendPackDestinationArgs(invocation, tempDir);
  const result = spawnSync(invocation.command, args, {
    cwd: invocation.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  if (result.error) {
    return {
      ok: false,
      command: `${invocation.printable} --pack-destination ${tempDir}`,
      status: typeof result.status === 'number' ? result.status : 1,
      stdout,
      stderr: stderr || String(result.error.message || result.error),
      payload: [],
    };
  }

  const fallbackNeeded = result.status !== 0 && /pack-destination|unknown option|unsupported option/i.test(`${stdout}\n${stderr}`);
  if (fallbackNeeded) {
    return runPackCommandFallback(root, tempDir);
  }

  return {
    ok: result.status === 0,
    command: `${invocation.printable} --pack-destination ${tempDir}`,
    status: typeof result.status === 'number' ? result.status : 0,
    stdout,
    stderr,
    payload: result.status === 0 ? parsePackPayload(stdout) : [],
  };
}

/** @param {string} root @param {string} tempDir @returns {PackCommandResult} */
function runPackCommandFallback(root, tempDir) {
  const invocation = resolvePackCommand(root);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  const payload = result.status === 0 ? parsePackPayload(stdout) : [];
  if (payload[0] && payload[0].filename) {
    const sourceTarball = path.join(root, payload[0].filename);
    const targetTarball = path.join(tempDir, payload[0].filename);
    if (fs.existsSync(sourceTarball)) {
      fs.copyFileSync(sourceTarball, targetTarball);
      fs.unlinkSync(sourceTarball);
    }
  }
  return {
    ok: result.status === 0,
    command: invocation.printable,
    status: typeof result.status === 'number' ? result.status : 0,
    stdout,
    stderr,
    payload,
  };
}

/** @param {string} root @returns {string[]} */
function resolveRequiredBinFiles(root) {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const bin = pkg && typeof pkg === 'object' ? pkg.bin : null;
  if (!bin || typeof bin !== 'object') return [];
  return Object.values(bin)
    .filter((item) => typeof item === 'string')
    .map((item) => String(item).replace(/^\.\//, ''));
}

/**
 * @param {string} root
 * @param {PackJsonEntry[]} payload
 * @returns {PackedContentCheck}
 */
function validatePackedContents(root, payload) {
  const first = payload[0] || {};
  const packedFiles = Array.isArray(first.files) ? first.files : [];
  const filePaths = new Set(packedFiles.map((entry) => entry.path));
  const bins = resolveRequiredBinFiles(root);
  const required = [...REQUIRED_PACKED_FILES];
  const missing = required.filter((item) => !filePaths.has(item));
  const presentForbidden = FORBIDDEN_PACKED_PREFIXES.filter((prefix) => [...filePaths].some((file) => file.startsWith(prefix)));
  const missingBins = bins.filter((item) => !filePaths.has(item));
  return {
    ok: missing.length === 0 && presentForbidden.length === 0 && missingBins.length === 0,
    required,
    missing,
    forbidden: [...FORBIDDEN_PACKED_PREFIXES],
    present_forbidden: presentForbidden,
    bins,
    missing_bins: missingBins,
  };
}

/** @param {PackJsonEntry[]} payload */
function summarizeArtifact(payload) {
  const first = payload[0] || {};
  const files = Array.isArray(first.files) ? first.files : [];
  return {
    filename: typeof first.filename === 'string' ? first.filename : null,
    files: files.length,
    unpackedSize: files.reduce((sum, entry) => sum + (typeof entry.size === 'number' ? entry.size : 0), 0),
  };
}

/**
 * @param {string} [root]
 * @param {{ runBuildCheck?: (root?: string) => BuildCheckResult, runPackCommand?: (root: string, options?: { tempDir?: string }) => PackCommandResult }} [deps]
 * @returns {BuildPipelineResult}
 */
function runBuildPipeline(root = process.cwd(), deps = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-build-'));
  try {
    const repoCheck = (deps.runBuildCheck || runBuildCheck)(root);
    const packResult = (deps.runPackCommand || runPackCommand)(root, { tempDir });
    const packedContents = packResult.ok ? validatePackedContents(root, packResult.payload) : {
      ok: false,
      required: [...REQUIRED_PACKED_FILES],
      missing: [...REQUIRED_PACKED_FILES],
      forbidden: [...FORBIDDEN_PACKED_PREFIXES],
      present_forbidden: [],
      bins: resolveRequiredBinFiles(root),
      missing_bins: resolveRequiredBinFiles(root),
    };
    const artifact = summarizeArtifact(packResult.payload);
    /** @type {BuildPipelineCheck[]} */
    const checks = [
      {
        name: 'repo-check',
        ok: Boolean(repoCheck.ok),
        detail: repoCheck.ok ? 'repository assets are synchronized' : [
          ...(repoCheck.missing || []).map((item) => `missing ${item}`),
          ...(repoCheck.reasons || []),
        ].join('; ') || 'repository consistency check failed',
      },
      {
        name: 'package-tarball',
        ok: Boolean(packResult.ok),
        detail: packResult.ok
          ? `created ${artifact.filename || 'package tarball'} with ${artifact.files} files`
          : [packResult.command, packResult.stderr || packResult.stdout || 'npm pack failed'].filter(Boolean).join(': '),
        meta: {
          command: packResult.command,
          status: packResult.status,
          artifact: artifact.filename,
          files: artifact.files,
          unpackedSize: artifact.unpackedSize,
        },
      },
      {
        name: 'packed-contents',
        ok: Boolean(packedContents.ok),
        detail: packedContents.ok
          ? `required=${packedContents.required.length} bins=${packedContents.bins.length} forbidden=${packedContents.present_forbidden.length}`
          : [
              packedContents.missing.length > 0 ? `missing ${packedContents.missing.join(', ')}` : '',
              packedContents.missing_bins.length > 0 ? `missing bins ${packedContents.missing_bins.join(', ')}` : '',
              packedContents.present_forbidden.length > 0 ? `forbidden ${packedContents.present_forbidden.join(', ')}` : '',
            ].filter(Boolean).join('; '),
        meta: {
          missing: packedContents.missing,
          missingBins: packedContents.missing_bins,
          forbidden: packedContents.present_forbidden,
        },
      },
    ];
    return {
      ok: checks.every((item) => item.ok),
      mode: 'production-pipeline',
      checks,
      artifact,
      message: 'build now validates repository consistency, creates a publishable tarball, and verifies packed contents',
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/** @param {BuildPipelineResult} result */
function formatBuildResult(result) {
  const lines = [`[build] ${result.ok ? 'PASS' : 'FAIL'} (${result.mode})`];
  for (const check of result.checks) {
    lines.push(`- ${check.name}: ${check.detail}`);
  }
  if (result.artifact) {
    lines.push(`artifact: ${result.artifact.filename || 'n/a'} files=${result.artifact.files} unpackedSize=${result.artifact.unpackedSize}`);
  }
  lines.push(`note: ${result.message}`);
  return lines.join('\n');
}

/** @param {string[]} argv */
function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
  };
}

/** @param {string[]} [argv] */
function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = runBuildPipeline();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatBuildResult(result)}\n`);
  }
  if (!result.ok) process.exit(1);
}

module.exports = {
  FORBIDDEN_PACKED_PREFIXES,
  REQUIRED_PACKED_FILES,
  formatBuildResult,
  main,
  parseArgs,
  parsePackPayload,
  resolvePackCommand,
  resolveRequiredBinFiles,
  runBuildPipeline,
  runPackCommand,
  runPackCommandFallback,
  summarizeArtifact,
  validatePackedContents,
};
