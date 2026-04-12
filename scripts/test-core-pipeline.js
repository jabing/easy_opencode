#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const bridge = require('./eoc-bridge.js');
const scheduler = require('./eoc-scheduler.js');
const eocStart = require('./eoc-start.js');
const { runReviewGate } = require('./review-gate.js');

const ROOT = process.cwd();

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function runCorePipelineSmoke(options = {}) {
  const packet = {
    plan_id: 'PLAN-CORE-PIPELINE-SMOKE',
    objective: 'core-pipeline-smoke',
    recommended_concurrency: 2,
    fast_fail: false,
    tasks: [
      {
        id: 'prep',
        command: 'node -e "console.log(\'prep\')"',
        validation: 'node -e "process.exit(0)"',
        deps: [],
        priority: 120,
        owner_hint: 'qa',
      },
      {
        id: 'done',
        command: 'node -e "console.log(\'done\')"',
        validation: 'node -e "process.exit(0)"',
        deps: ['prep'],
        priority: 100,
        owner_hint: 'qa',
      },
    ],
  };

  const run = bridge.bridgeFromPacket(packet, { 'plan-id': packet.plan_id });
  const runId = run.run_id;
  await scheduler.runSchedulerById(runId, { simulate: true });

  eocStart.advanceGate(runId);
  eocStart.markField(runId, 'scope_locked', true);
  eocStart.markField(runId, 'acceptance_criteria_locked', true);
  eocStart.advanceGate(runId);
  eocStart.markField(runId, 'implementation_completed', true);
  eocStart.advanceGate(runId);
  eocStart.markField(runId, 'build_passed', true);
  eocStart.markField(runId, 'test_passed', true);
  eocStart.markField(runId, 'lint_passed', true);
  eocStart.markField(runId, 'coverage_passed', true);
  eocStart.advanceGate(runId);

  const reviewDir = path.join(ROOT, '.opencode', 'eoc-run', runId, 'reviews');
  writeJson(path.join(reviewDir, 'code-review.json'), {
    run_id: runId,
    generated_at: new Date().toISOString(),
    reviewer: 'external-code-reviewer',
    source: 'external',
    verdict: 'APPROVE',
    findings: [],
  });
  writeJson(path.join(reviewDir, 'security-review.json'), {
    run_id: runId,
    generated_at: new Date().toISOString(),
    reviewer: 'external-security-reviewer',
    source: 'external',
    verdict: 'APPROVE',
    findings: [],
  });
  const review = runReviewGate({ runId, reviewDir });
  if (!review.ok) throw new Error(`review gate failed in smoke: ${review.detail}`);
  eocStart.markField(runId, 'code_review_verdict', review.verdicts.code);
  eocStart.markField(runId, 'security_review_verdict', review.verdicts.security);
  eocStart.advanceGate(runId);
  eocStart.markField(runId, 'docs_updated', true);
  eocStart.markField(runId, 'archive_completed', true);
  eocStart.advanceGate(runId);

  const done = scheduler.loadRun(runId);
  if (String(done.current_gate) !== 'GATE_6_RELEASE_READY') {
    throw new Error(`core smoke did not reach final gate: ${done.current_gate}`);
  }
  if (!options.silent) console.log(`[test-core-pipeline] PASS run_id=${runId}`);
  return { ok: true, runId };
}

async function main() {
  try {
    await runCorePipelineSmoke();
  } catch (err) {
    console.error(`[test-core-pipeline] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { runCorePipelineSmoke };

if (require.main === module) {
  main();
}
