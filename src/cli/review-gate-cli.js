#!/usr/bin/env node
// @ts-nocheck
const fs = require('fs');
const path = require('path');
const { runQualityGate } = require('../core/quality-gate.js');
const { assessBenchmarkFeedback } = require('../core/benchmark/feedback.js');
const { buildRecovery } = require('../control-plane/orchestrator/memory.js');
const { getGitRepoState } = require('../core/project/git-state.js');
const { appendEvent } = require('../control-plane/observability/index.js');
const { formatManagedInvocation } = require('../cli/runtime-paths.js');
const { createEvidence, summarizeEvidence } = require('../core/gates/evidence-store.js');
const { evaluateGate } = require('../core/gates/engine.js');
const { ensureDir } = require('../shared/fs.js');
const { readJson, writeJson } = require('../shared/json.js');
const { nowIso } = require('../shared/time.js');
const {
  INTERNAL_VERDICTS,
  addFinding,
  assessStyleDrift,
  buildBenchmarkScope,
  buildPatchFootprintEvidence,
  buildReviewPolicy,
  classifyChangedFiles,
  collectDiff,
  createEvidenceSignature,
  diffStats,
  evidencePath,
  parseReviewGateArgs,
  readCoderRun,
  readPlan,
  resolveRoot,
  runReviewEvidenceGate,
  sampleDiffText,
  toFindingSummary,
  verdictFromQuality,
} = require('../core/gates/review-helpers.js');
const { assertNamedContract } = require('../shared/contracts.js');
const { printMergeReport } = require('../core/gates/review-report-renderer.js');

function printLine(line = '') { process.stdout.write(String(line) + '\n'); }

const ROOT = process.cwd();
const RUN_ROOT = path.join(ROOT, '.opencode', 'eoc-run');
const TRUST_PATH = path.join(RUN_ROOT, 'review-trust.json');

async function runMergeGate(options = {}) {
  const rootDir = resolveRoot(options.root || ROOT);
  const plan = readPlan(rootDir, options.planId || options['plan-id'], { noPlan: Boolean(options['no-plan'] || options.noPlan) });
  const run = readCoderRun(rootDir, options.runId || options['run-id'] || (plan && plan.coder_loop ? plan.coder_loop.run_id : null));
  const recovery = buildRecovery(rootDir);
  const gitState = getGitRepoState(rootDir, (plan && plan.targets) || (run && run.targets) || []);
  const staged = gitState.is_git_repo ? collectDiff(rootDir, true) : { text: '', files: [] };
  const unstaged = gitState.is_git_repo ? collectDiff(rootDir, false) : { text: '', files: [] };
  const changed = classifyChangedFiles([...staged.files, ...unstaged.files, ...((plan && plan.targets) || [])]);
  const stats = diffStats(`${staged.text || ''}\n${unstaged.text || ''}`);
  const qualityMode = String(options['quality-mode'] || (options.full ? 'full' : 'fast')).toLowerCase();
  const runQuality = options['with-quality-gate'] || options['quality-gate'] || (!('no-quality-gate' in options));
  const quality = runQuality
    ? await runQualityGate({ full: qualityMode === 'full', strict: true, silent: true, json: true })
    : null;
  const benchmarkFeedback = assessBenchmarkFeedback(rootDir, buildBenchmarkScope(rootDir, plan, run));
  const reviewPolicy = buildReviewPolicy(benchmarkFeedback);
  const fullDiffText = `${staged.text || ''}\n${unstaged.text || ''}`;
  const diffSample = sampleDiffText(fullDiffText, reviewPolicy);
  const patchFootprint = buildPatchFootprintEvidence(run, changed);

  const correctness = [];
  const testGap = [];
  const interfaceRisk = [];
  const styleIssue = [];
  const perfRisk = [];
  const securityRisk = [];
  const blockers = [];
  const warnings = [];
  const riskAreas = new Set();

  if (run && run.status !== 'green') {
    for (const failure of run.latest_failures || []) {
      const finding = {
        file: failure.file || null,
        line: failure.line || null,
        issue: failure.message || 'validation failure from coder loop',
        fix: 'Fix the reported validation failure and rerun coder-loop / quality gate.',
      };
      addFinding(correctness, 'HIGH', finding);
      blockers.push(finding.issue);
    }
    if ((run.latest_failures || []).length === 0) {
      addFinding(correctness, 'HIGH', {
        file: null,
        line: null,
        issue: `coder-loop status is ${run.status}`,
        fix: 'Resolve validation failures before merge.',
      });
      blockers.push(`coder-loop status is ${run.status}`);
    }
  }

  if (quality && quality.gate !== 'PASS') {
    for (const result of quality.results.filter((item) => item.status === 'fail')) {
      const bucket = /scan|secret|security/i.test(result.check) ? securityRisk : correctness;
      addFinding(bucket, /scan|secret|security/i.test(result.check) ? 'CRITICAL' : 'HIGH', {
        file: null,
        line: null,
        issue: `quality gate failed: ${result.check}`,
        fix: result.detail,
      });
      blockers.push(`quality gate failed: ${result.check}`);
    }
  }
  if (quality) {
    for (const result of quality.results.filter((item) => item.status === 'warn')) {
      addFinding(interfaceRisk, 'MEDIUM', {
        file: null,
        line: null,
        issue: `quality gate warning: ${result.check}`,
        fix: result.detail,
      });
      warnings.push(`quality gate warning: ${result.check}`);
    }
  }

  if (changed.source.length > 0 && changed.tests.length === 0) {
    addFinding(testGap, 'MEDIUM', {
      file: changed.source[0] || null,
      line: null,
      issue: 'source code changed without corresponding test changes',
      fix: 'Add or update tests that exercise the new behavior and key regressions.',
    });
    warnings.push('source changes lack test updates');
    riskAreas.add('test coverage');
  }

  if (changed.api.length > 0 && changed.tests.length === 0) {
    addFinding(interfaceRisk, 'MEDIUM', {
      file: changed.api[0] || null,
      line: null,
      issue: 'API-facing files changed without test evidence',
      fix: 'Add request/response or contract coverage before merge.',
    });
    warnings.push('API-facing changes without test evidence');
    riskAreas.add('interface contract');
  }

  if (changed.sensitive.length > 0) {
    addFinding(securityRisk, 'MEDIUM', {
      file: changed.sensitive[0],
      line: null,
      issue: 'sensitive files changed; require focused review of auth/config/schema surface',
      fix: 'Review trust boundaries, migrations, config defaults, and secrets handling before merge.',
    });
    warnings.push('sensitive files changed');
    riskAreas.add('security/config');
  }

  const debugTokens = ['console' + '.log', ['de','bugger'].join(''), ['TO','DO'].join(''), ['FIX','ME'].join('')];
  const debugPattern = new RegExp('\\b(' + debugTokens.join('|') + ')\\b', 'g');
  const debugMatches = [...new Set((`${staged.text}\n${unstaged.text}`).match(debugPattern) || [])];
  if (debugMatches.length > 0) {
    addFinding(styleIssue, 'LOW', {
      file: changed.unique[0] || null,
      line: null,
      issue: `debug or placeholder markers present in diff: ${debugMatches.join(', ')}`,
      fix: 'Remove debug statements and unresolved note markers or convert them into tracked follow-ups.',
    });
    warnings.push('debug or placeholder markers present');
    riskAreas.add('code hygiene');
  }

  if (stats.total > reviewPolicy.surface_warn_lines || changed.unique.length > reviewPolicy.surface_warn_files) {
    addFinding(perfRisk, 'MEDIUM', {
      file: null,
      line: null,
      issue: `large review surface (${changed.unique.length} files, ${stats.total} changed lines)`,
      fix: 'Split the change or perform deeper focused review before merge.',
    });
    warnings.push('large review surface');
    riskAreas.add('broad change set');
  }

  if (plan && plan.safety && plan.safety.snapshot_status !== 'ready') {
    const snapshotIsRequired = benchmarkFeedback.risk_level === 'high' || changed.sensitive.length > 0;
    addFinding(interfaceRisk, snapshotIsRequired ? 'HIGH' : 'MEDIUM', {
      file: null,
      line: null,
      issue: `safety snapshot is ${plan.safety.snapshot_status}`,
      fix: 'Create or refresh a rollback snapshot before high-risk merge actions.',
    });
    if (snapshotIsRequired) blockers.push('rollback snapshot not ready for high-risk change');
    else warnings.push('rollback snapshot not ready');
    riskAreas.add('rollback safety');
  }

  if (recovery && recovery.recovery_assessment && recovery.recovery_assessment.recommended_action !== 'resume') {
    addFinding(interfaceRisk, 'MEDIUM', {
      file: null,
      line: null,
      issue: `workspace drift detected (${recovery.recovery_assessment.recommended_action})`,
      fix: 'Rebuild context or start a fresh plan before treating this as merge-ready.',
    });
    warnings.push('workspace drift detected');
    riskAreas.add('stale context');
  }

  if (benchmarkFeedback.risk_level === 'high') {
    addFinding(interfaceRisk, 'MEDIUM', {
      file: null,
      line: null,
      issue: 'recent benchmark history marks this runtime/framework/task bucket as high risk',
      fix: 'Use a full quality gate, keep the merge surface narrow, and require explicit review sign-off before merge.',
    });
    warnings.push('benchmark history indicates high-risk task bucket');
    riskAreas.add('historical instability');
  } else if (benchmarkFeedback.risk_level === 'medium') {
    addFinding(interfaceRisk, 'LOW', {
      file: null,
      line: null,
      issue: 'recent benchmark history for this task bucket is mixed',
      fix: 'Prefer a stricter review pass and double-check regression coverage before merge.',
    });
    warnings.push('benchmark history indicates mixed task stability');
    riskAreas.add('historical variability');
  }

  if (benchmarkFeedback.review_gate_required && (!quality || qualityMode !== 'full')) {
    addFinding(interfaceRisk, benchmarkFeedback.risk_level === 'high' ? 'HIGH' : 'MEDIUM', {
      file: null,
      line: null,
      issue: `benchmark feedback recommends a full validation gate (current mode: ${quality ? qualityMode : 'not-run'})`,
      fix: 'Run review-gate with --with-quality-gate --quality-mode full before merge.',
    });
    warnings.push('full validation gate recommended by benchmark feedback');
    riskAreas.add('validation depth');
  }

  const styleDriftFindings = assessStyleDrift(run, changed, fullDiffText);
  for (const finding of styleDriftFindings) {
    addFinding(styleIssue, finding.severity, finding);
  }
  if (styleDriftFindings.length > 0) {
    warnings.push('style contract drift detected');
    riskAreas.add('style drift');
  }

  if (patchFootprint) {
    const evaluation = patchFootprint.evaluation;
    if (evaluation.verdict === 'reject') {
      addFinding(correctness, 'HIGH', {
        file: null,
        line: null,
        issue: 'current patch footprint exceeds the recommended edit surface',
        fix: 'Trim the patch back to target files, direct neighbors, and related tests before merge.',
      });
      blockers.push('patch footprint exceeds allowed edit surface');
      riskAreas.add('patch discipline');
    } else if (evaluation.verdict === 'warning') {
      addFinding(styleIssue, 'MEDIUM', {
        file: null,
        line: null,
        issue: 'current patch includes a meaningful amount of unrelated edits',
        fix: 'Reduce unrelated edits or split follow-on cleanup into a separate change.',
      });
      warnings.push('patch footprint includes unrelated edits');
      riskAreas.add('patch discipline');
    }
  }

  let verdict = blockers.length > 0 ? 'BLOCK' : warnings.length > 0 ? 'ACCEPT_WITH_FOLLOWUPS' : 'ACCEPT';
  if (benchmarkFeedback.risk_level === 'high' && verdict === 'ACCEPT') verdict = 'ACCEPT_WITH_FOLLOWUPS';
  if (benchmarkFeedback.risk_level === 'high' && benchmarkFeedback.review_gate_required && (!quality || qualityMode !== 'full') && changed.source.length > 0) {
    blockers.push('high-risk task bucket requires full validation before merge');
    verdict = 'BLOCK';
  }
  const evidence = [
    createEvidence('quality-gate', 'review-gate', quality ? {
      gate: quality.gate,
      counts: quality.counts,
      mode: qualityMode,
    } : {
      gate: 'NOT_RUN',
      counts: null,
      mode: qualityMode,
    }, { tags: ['review-input'] }),
    createEvidence('benchmark-feedback', 'review-gate', {
      risk_level: benchmarkFeedback.risk_level,
      risk_score: benchmarkFeedback.risk_score,
      confidence: benchmarkFeedback.confidence,
      strategy_bias: benchmarkFeedback.strategy_bias,
      review_gate_required: benchmarkFeedback.review_gate_required,
    }, { tags: ['review-input', 'benchmark'] }),
    createEvidence('git-change-scope', 'review-gate', {
      changed_files: changed.unique,
      changed_file_count: changed.unique.length,
      test_file_count: changed.tests.length,
      source_file_count: changed.source.length,
      risky_areas: [...riskAreas],
      diff_stats: stats,
    }, { tags: ['review-input', 'git'] }),
    patchFootprint ? createEvidence('patch-footprint', 'review-gate', patchFootprint, { tags: ['review-input', 'patch'] }) : null,
  ].filter(Boolean);
  const gateEvaluation = evaluateGate({
    gateId: 'merge-review-gate',
    strict: false,
    evidence,
    rules: [
      {
        id: 'review.quality',
        title: 'Quality gate input',
        evaluate(items) {
          const match = items.find((item) => item.type === 'quality-gate');
          if (!match) return { status: 'skip', detail: 'quality evidence missing' };
          const content = match.content || {};
          if (content.gate === 'PASS') return { status: 'pass', detail: 'quality gate passed', matched_evidence_ids: [match.id] };
          if (content.gate === 'NOT_RUN') return { status: 'warn', detail: 'quality gate not run', matched_evidence_ids: [match.id] };
          return { status: 'fail', detail: 'quality gate failed', matched_evidence_ids: [match.id] };
        },
      },
      {
        id: 'review.test-coverage',
        title: 'Source changes have tests',
        evaluate(items) {
          const match = items.find((item) => item.type === 'git-change-scope');
          if (!match) return { status: 'skip', detail: 'change scope missing' };
          const c = match.content || {};
          if (Number(c.source_file_count || 0) > 0 && Number(c.test_file_count || 0) === 0) {
            return { status: 'warn', detail: 'source changes lack test updates', matched_evidence_ids: [match.id] };
          }
          return { status: 'pass', detail: 'change scope includes tests or no source changes', matched_evidence_ids: [match.id] };
        },
      },
      {
        id: 'review.benchmark-risk',
        title: 'Benchmark risk posture',
        evaluate(items) {
          const match = items.find((item) => item.type === 'benchmark-feedback');
          if (!match) return { status: 'skip', detail: 'benchmark evidence missing' };
          const c = match.content || {};
          if (c.risk_level === 'high' && c.review_gate_required) {
            return { status: 'warn', detail: 'high-risk benchmark bucket requires stronger validation', matched_evidence_ids: [match.id] };
          }
          if (c.risk_level === 'medium') return { status: 'warn', detail: 'benchmark history is mixed', matched_evidence_ids: [match.id] };
          return { status: 'pass', detail: `benchmark risk=${c.risk_level || 'unknown'}`, matched_evidence_ids: [match.id] };
        },
      },
      {
        id: 'review.patch-discipline',
        title: 'Patch footprint discipline',
        evaluate(items) {
          const match = items.find((item) => item.type === 'patch-footprint');
          if (!match) return { status: 'skip', detail: 'patch footprint missing' };
          const evaluation = match.content && match.content.evaluation ? match.content.evaluation : {};
          if (evaluation.verdict === 'reject') return { status: 'fail', detail: 'patch footprint exceeds allowed edit surface', matched_evidence_ids: [match.id] };
          if (evaluation.verdict === 'warning') return { status: 'warn', detail: 'patch footprint includes unrelated edits', matched_evidence_ids: [match.id] };
          return { status: 'pass', detail: 'patch footprint stays within expected edit surface', matched_evidence_ids: [match.id] };
        },
      },
    ],
  });

  const report = {
    schema_version: '1.1',
    generated_at: nowIso(),
    root_dir: rootDir,
    verdict,
    objective: (plan && plan.objective) || (run && run.objective) || null,
    evidence_bundle: {
      schema_version: '1.0',
      gate: gateEvaluation,
      summary: summarizeEvidence(evidence),
      evidence,
    },
    scope_summary: {
      changed_files: changed.unique,
      changed_file_count: changed.unique.length,
      test_file_count: changed.tests.length,
      source_file_count: changed.source.length,
      diff_stats: stats,
      diff_sample: diffSample,
      risky_areas: [...riskAreas],
    },
    status_inputs: {
      plan_id: plan ? plan.plan_id : null,
      coder_run_id: run ? run.run_id : null,
      coder_status: run ? run.status : null,
      recovery_action: recovery && recovery.recovery_assessment ? recovery.recovery_assessment.recommended_action : null,
      recovery_confidence: recovery && recovery.recovery_assessment ? recovery.recovery_assessment.confidence_score : null,
      snapshot_id: plan && plan.safety ? plan.safety.snapshot_id || null : null,
      snapshot_status: plan && plan.safety ? plan.safety.snapshot_status || null : null,
      quality_gate: quality ? { gate: quality.gate, counts: quality.counts, mode: qualityMode } : null,
      benchmark_feedback: {
        risk_level: benchmarkFeedback.risk_level,
        risk_score: benchmarkFeedback.risk_score,
        confidence: benchmarkFeedback.confidence,
        strategy_bias: benchmarkFeedback.strategy_bias,
        review_gate_required: benchmarkFeedback.review_gate_required,
      },
      review_policy: reviewPolicy,
      patch_footprint: patchFootprint ? patchFootprint.evaluation : null,
      style_contract: run && run.context ? run.context.style_contract || null : null,
    },
    findings: {
      correctness: toFindingSummary(correctness),
      test_gap: toFindingSummary(testGap),
      interface_risk: toFindingSummary(interfaceRisk),
      style_issue: toFindingSummary(styleIssue),
      perf_risk: toFindingSummary(perfRisk),
      security_risk: toFindingSummary(securityRisk),
    },
    merge_risk_summary: {
      blockers,
      followups: warnings,
      benchmark_signals: benchmarkFeedback.reasons || [],
      recommended_next_steps: [],
      policy_notes: [
        `Review posture: ${reviewPolicy.merge_posture}`,
        `Diff sample: ${diffSample.mode} (${diffSample.sampled_file_count}/${diffSample.max_files} files, ${diffSample.sampled_line_count}/${diffSample.max_lines} lines${diffSample.truncated ? ', truncated' : ''})`,
      ],
    },
  };

  const steps = report.merge_risk_summary.recommended_next_steps;
  if (benchmarkFeedback.review_gate_required && (!quality || qualityMode !== 'full')) {
    steps.push(formatManagedInvocation('review-gate', ['report', '--with-quality-gate', '--quality-mode', 'full', '--json'], { cwd: rootDir }));
  }
  if (verdict === 'BLOCK') {
    if (run && run.run_id) steps.push(formatManagedInvocation('coder-loop', ['run', '--run-id', run.run_id, '--root', rootDir, '--emit-prompt'], { cwd: rootDir }));
    if (plan && plan.plan_id) steps.push(formatManagedInvocation('implement-task', ['next-prompt', '--plan-id', plan.plan_id], { cwd: rootDir }));
  } else if (verdict === 'ACCEPT_WITH_FOLLOWUPS') {
    if (changed.tests.length === 0) steps.push('Add or refresh regression tests before merge.');
    if (changed.sensitive.length > 0) steps.push('Request focused security/config review on changed sensitive files.');
  } else {
    steps.push('Ready to merge after normal human review / CI completion.');
  }

  writeJson(evidencePath(rootDir), report);
  appendEvent(rootDir, 'review-gate.completed', {
    flow: 'review',
    verdict,
    objective: report.objective,
    changed_file_count: changed.unique.length,
    blocker_count: blockers.length,
    followup_count: warnings.length,
    benchmark_risk_level: benchmarkFeedback.risk_level,
    benchmark_strategy_bias: benchmarkFeedback.strategy_bias,
  });
  return report;
}

async function main() {
  try {
    const { cmd, opts } = parseReviewGateArgs(process.argv);
    if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
      usage();
      process.exit(0);
    }
    if (cmd === 'evidence') {
      const result = runReviewEvidenceGate({
        root: ROOT,
        runRoot: RUN_ROOT,
        trustPath: TRUST_PATH,
        runId: opts['run-id'],
        reviewDir: opts['review-dir'],
        codeFile: opts['code-file'],
        securityFile: opts['security-file'],
      });
      if (!result.ok) {
        console.error(`[review-gate] FAIL ${result.detail}`);
        process.exit(1);
      }
      printLine(`[review-gate] PASS ${result.detail}`);
      return;
    }
    const report = await runMergeGate(opts);
    if (opts.json) {
      assertNamedContract('review-gate', report);
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      printMergeReport(report, printLine);
    }
    process.exit(report.verdict === 'BLOCK' ? 1 : 0);
  } catch (error) {
    console.error(`[review-gate] ${error.message}`);
    usage();
    process.exit(1);
  }
}

module.exports = {
  main,
  runMergeGate,
  runReviewEvidenceGate,
  verdictFromQuality,
  createEvidenceSignature,
};

if (require.main === module) {
  main();
}
