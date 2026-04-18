#!/usr/bin/env node
const { createSnapshot, loadSnapshot, latestSnapshot, rollbackSnapshot, getGitRepoState, assessSnapshotReadiness } = require('../src/core/project/git-state.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { appendEvent } = require('../src/control-plane/observability/index.js');
const { tryReadJson } = require('../src/shared/json.js');
const { evaluatePatchFootprint, derivePatchDecision } = require('../src/core/implementation/edit-engine.js');
const { buildAutomaticRepairPlan } = require('../src/core/repair/executor.js');
const path = require('path');
const { spawnSync } = require('child_process');
const { assertNamedContract } = require('../src/shared/contracts.js');

function parseArgs(argv) {
  const cmd = argv[2] || 'status';
  const opts = { _: [] };
  for (let i = 3; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      opts[key] = true;
      continue;
    }
    opts[key] = next;
    i += 1;
  }
  return { cmd, opts };
}

function usage() {
  console.log('Usage:');
  console.log(`  ${formatManagedInvocation('safe-apply', ['snapshot', '--label', '"before auth refactor"'])}`);
  console.log(`  ${formatManagedInvocation('safe-apply', ['snapshot', '--dry-run'])}`);
  console.log(`  ${formatManagedInvocation('safe-apply', ['status'])}`);
  console.log(`  ${formatManagedInvocation('safe-apply', ['rollback', '--snapshot-id', '<id>', '--dry-run'])}`);
  console.log(`  ${formatManagedInvocation('safe-apply', ['rollback', '--snapshot-id', '<id>'])}`);
}

function print(data, contractName = null) {
  if (typeof data === 'string') console.log(data);
  else { if (contractName) assertNamedContract(contractName, data); process.stdout.write(JSON.stringify(data, null, 2) + '\n'); }
}


function runGit(rootDir, args) {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
  });
  return {
    code: typeof result.status === 'number' ? result.status : 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function readCoderRun(rootDir, runId) {
  const root = path.resolve(rootDir || process.cwd());
  let resolvedRunId = runId ? String(runId).trim() : '';
  if (!resolvedRunId) {
    const latest = tryReadJson(path.join(root, '.opencode', 'coder-loop', 'latest.json'));
    resolvedRunId = latest && latest.run_id ? String(latest.run_id) : '';
  }
  if (!resolvedRunId) return null;
  return tryReadJson(path.join(root, '.opencode', 'coder-loop', `${resolvedRunId}.json`));
}

function collectChangedFiles(rootDir) {
  const result = runGit(rootDir, ['diff', '--name-only']);
  if (result.code !== 0) return [];
  return String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function buildPatchAssessment(rootDir, runId) {
  const run = readCoderRun(rootDir, runId);
  if (!run || !run.context || !run.context.change_surface) return null;
  const touchedFiles = collectChangedFiles(rootDir);
  const route = run.context.edit_strategy || run.context.task_route || {};
  const assessment = evaluatePatchFootprint({
    footprint: { touched_files: touchedFiles },
    changeSurface: run.context.change_surface,
    route,
    recipe: run.repair_recipe || {},
  });
  const patchGate = derivePatchDecision({ assessment, recipe: run.repair_recipe || {}, route });
  return {
    run_id: run.run_id,
    objective: run.objective,
    touched_files: touchedFiles,
    allowed_files: route.allowed_files || null,
    edit_mode: route.edit_mode || null,
    patch_verdict: assessment.verdict,
    patch_evaluation: assessment,
    patch_gate: patchGate,
    automatic_repair: buildAutomaticRepairPlan({
      patchDecision: patchGate,
      currentPatch: assessment,
      repairRecipe: run.repair_recipe || {},
      context: run.context || {},
      checks: run.checks || [],
      latestFailures: run.latest_failures || [],
    }),
  };
}

function main(argv = process.argv) {
  try {
    const { cmd, opts } = parseArgs(argv);
    const rootDir = String(opts.root || process.cwd());
    if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
      usage();
      process.exit(0);
    }
    if (cmd === 'snapshot') {
      const snapshot = createSnapshot(rootDir, {
        label: opts.label || 'safe-apply',
        allowDirty: Boolean(opts['allow-dirty']),
        dryRun: Boolean(opts['dry-run']),
      });
      appendEvent(rootDir, 'safe-apply.snapshot', {
        flow: 'safety',
        status: snapshot.status || 'unknown',
        snapshot_id: snapshot.snapshot_id || null,
        objective: opts.label || 'safe-apply',
      });
      if (opts.json || true) print(snapshot, 'safe-apply');
      return;
    }
    if (cmd === 'status') {
      const snapshot = opts['snapshot-id'] ? loadSnapshot(rootDir, String(opts['snapshot-id'])) : latestSnapshot(rootDir);
      const current = getGitRepoState(rootDir);
      const payload = {
        snapshot: snapshot || null,
        current,
        snapshot_readiness: assessSnapshotReadiness(rootDir, { label: 'safe-apply-status' }),
        patch_assessment: buildPatchAssessment(rootDir, opts['run-id'] ? String(opts['run-id']) : null),
      };
      appendEvent(rootDir, 'safe-apply.status', {
        flow: 'safety',
        status: snapshot ? 'snapshot_loaded' : 'snapshot_missing',
        snapshot_id: snapshot && snapshot.snapshot_id ? snapshot.snapshot_id : null,
      });
      print(payload, 'safe-apply');
      return;
    }
    if (cmd === 'rollback') {
      const result = rollbackSnapshot(rootDir, opts['snapshot-id'] ? String(opts['snapshot-id']) : null, {
        dryRun: Boolean(opts['dry-run']),
        force: Boolean(opts.force),
      });
      appendEvent(rootDir, 'safe-apply.rollback', {
        flow: 'safety',
        status: result.status || (opts['dry-run'] ? 'preview' : 'applied'),
        snapshot_id: result.snapshot_id || null,
        objective: result.label || null,
        dry_run: Boolean(opts['dry-run']),
      });
      print(result, 'safe-apply');
      return;
    }
    throw new Error(`unknown command: ${cmd}`);
  } catch (error) {
    console.error(`[safe-apply] ${error.message}`);
    usage();
    process.exit(1);
  }
}

module.exports = { main, parseArgs, usage, print, buildPatchAssessment };

if (require.main === module) {
  if (process.env.EOC_LEGACY_WRAPPER !== '1') require('./internal-tools.js').main([process.argv[0], process.argv[1], 'safe-apply', ...process.argv.slice(2)]);
  else main();
}
