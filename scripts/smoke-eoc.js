#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const TMP_PACKET = path.join(ROOT, '.tmp-smoke-packet.json');
const RUN_DIR = path.join(ROOT, '.opencode', 'eoc-run');

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

function cleanup() {
  if (fs.existsSync(TMP_PACKET)) fs.unlinkSync(TMP_PACKET);
  if (fs.existsSync(RUN_DIR)) fs.rmSync(RUN_DIR, { recursive: true, force: true });
}

function main() {
  try {
    cleanup();
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
    try {
      runNode(['scripts/eoc-bridge.js', '--packet', TMP_PACKET, '--execute', '--simulate', '--plan-id', 'PLAN-SMOKE-CI']);
      console.log('[smoke-eoc] PASS (e2e)');
      return;
    } catch (error) {
      const msg = String(error && error.message ? error.message : error);
      if (!/EPERM/i.test(msg)) throw error;
    }

    // Restricted runtime fallback: static smoke assertions.
    const bridge = fs.readFileSync(path.join(ROOT, 'scripts', 'eoc-bridge.js'), 'utf8');
    const scheduler = fs.readFileSync(path.join(ROOT, 'scripts', 'eoc-scheduler.js'), 'utf8');
    if (!bridge.includes('owner_hint') || !bridge.includes('Packet requirements per task: id, command, validation')) {
      throw new Error('bridge contract assertion failed');
    }
    if (!scheduler.includes('validation_exit_code_') || !scheduler.includes('add-task requires --task-id, --cmd, and --validation')) {
      throw new Error('scheduler validation assertion failed');
    }
    console.log('[smoke-eoc] PASS (restricted-runtime fallback)');
  } finally {
    cleanup();
  }
}

main();
