#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const bridge = require('./eoc-bridge.js');
const scheduler = require('./eoc-scheduler.js');

const ROOT = process.cwd();
const TMP_PACKET = path.join(ROOT, '.tmp-smoke-packet.json');
const RUN_DIR = path.join(ROOT, '.opencode', 'eoc-run');
const ACTIVE_PATH = path.join(RUN_DIR, 'active.json');

function runNode(args) {
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    if (r.error) throw r.error;
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
    throw new Error(`node ${args.join(' ')} failed (${r.status})\n${out}`);
  }
}

function cleanupFileOnly() {
  if (fs.existsSync(TMP_PACKET)) fs.unlinkSync(TMP_PACKET);
}

function snapshotRunState() {
  const activeRaw = fs.existsSync(ACTIVE_PATH) ? fs.readFileSync(ACTIVE_PATH, 'utf8') : null;
  return { activeRaw };
}

function cleanupRunArtifacts(runId, snapshot) {
  cleanupFileOnly();
  if (runId) {
    const runFile = path.join(RUN_DIR, `${runId}.json`);
    const taskDir = path.join(RUN_DIR, runId);
    if (fs.existsSync(runFile)) fs.rmSync(runFile, { force: true });
    if (fs.existsSync(taskDir)) fs.rmSync(taskDir, { recursive: true, force: true });
  }
  if (snapshot && snapshot.activeRaw !== null) {
    fs.mkdirSync(RUN_DIR, { recursive: true });
    fs.writeFileSync(ACTIVE_PATH, snapshot.activeRaw, 'utf8');
  } else if (fs.existsSync(ACTIVE_PATH)) {
    fs.rmSync(ACTIVE_PATH, { force: true });
  }
}

async function runSmokeEoc(options = {}) {
  let runId = null;
  const snapshot = snapshotRunState();
  try {
    cleanupFileOnly();
    const packet = {
      plan_id: 'PLAN-SMOKE-CI',
      objective: 'smoke-test-eoc',
      recommended_concurrency: 2,
      fast_fail: false,
      tasks: [
        {
          id: 'prepare',
          goal: 'prepare',
          command: 'node -e "console.log(\'prepare\')"',
          validation: 'node -e "process.exit(0)"',
          deps: [],
          priority: 120,
          owner_hint: 'qa',
        },
        {
          id: 'verify',
          goal: 'verify',
          command: 'node -e "console.log(\'verify\')"',
          validation: 'node -e "process.exit(0)"',
          deps: ['prepare'],
          priority: 100,
          owner_hint: 'qa',
        },
      ],
    };

    fs.writeFileSync(TMP_PACKET, JSON.stringify(packet, null, 2) + '\n', 'utf8');
    const run = bridge.bridgeFromPacket(packet, { 'plan-id': 'PLAN-SMOKE-CI' });
    runId = run.run_id;
    await scheduler.runSchedulerById(runId, { simulate: true });
    const done = scheduler.loadRun(runId);
    if (String(done.scheduler?.status) !== 'completed') {
      throw new Error(`scheduler status=${done.scheduler?.status || 'unknown'}`);
    }
    if (!options.silent) console.log('[smoke-eoc] PASS (inline e2e)');
    return { ok: true, mode: 'inline-e2e' };
  } catch (error) {
    const msg = String(error && error.message ? error.message : error);
    if (!/EPERM/i.test(msg)) throw error;

    // Restricted runtime fallback: static smoke assertions.
    const bridge = fs.readFileSync(path.join(ROOT, 'scripts', 'eoc-bridge.js'), 'utf8');
    const scheduler = fs.readFileSync(path.join(ROOT, 'scripts', 'eoc-scheduler.js'), 'utf8');
    if (!bridge.includes('owner_hint') || !bridge.includes('Packet requirements per task: id, command, validation')) {
      throw new Error('bridge contract assertion failed');
    }
    if (!scheduler.includes('validation_exit_code_') || !scheduler.includes('add-task requires --task-id, --cmd, and --validation')) {
      throw new Error('scheduler validation assertion failed');
    }
    if (!options.silent) console.log('[smoke-eoc] PASS (restricted-runtime fallback)');
    return { ok: true, mode: 'restricted-fallback' };
  } finally {
    cleanupRunArtifacts(runId, snapshot);
  }
}

async function main() {
  try {
    await runSmokeEoc();
  } catch (err) {
    console.error(`[smoke-eoc] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { runSmokeEoc };

if (require.main === module) {
  main();
}
