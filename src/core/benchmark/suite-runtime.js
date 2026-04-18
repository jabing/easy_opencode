const path = require('path');
const crypto = require('crypto');
const { detectProjectProfile } = require('../project-profile.js');
const { createPlan } = require('../../cli/implement-task-cli.js');
const { runMergeGate } = require('../../cli/review-gate-cli.js');
const { appendEvent, writeBenchmarkRun, readBenchmarkRuns } = require('../../control-plane/observability/index.js');
const { compareRuns, summarizeTaskMetrics } = require('./analysis.js');
const { resolveTaskFamily } = require('../skills/taxonomy.js');
const { readJson, writeJson, sanitizeCaseId, prepareWorkspace, resolveCaseRoot, asVarPairs, toList } = require('./suite-case-utils.js');

/** @typedef {{
 *   case_id: string,
 *   root: string,
 *   workspace_root: string,
 *   workspace_mode: string,
 *   objective: string,
 *   duration_ms: number,
 *   detected: Record<string, unknown>,
 *   plan: Record<string, unknown> | null,
 *   review: Record<string, unknown> | null,
 *   task: Record<string, unknown>,
 *   checks: Array<Record<string, unknown>>,
 *   passed: boolean,
 *   error: string | null,
 * }} BenchmarkSuiteCaseResult */

/** @typedef {{
 *   schema_version: string,
 *   run_id: string,
 *   suite_name: string,
 *   suite_path: string,
 *   started_at: string,
 *   completed_at?: string,
 *   results: BenchmarkSuiteCaseResult[],
 *   summary?: {
 *     total: number,
 *     passed: number,
 *     failed: number,
 *     pass_rate: number,
 *     task_success_total: number,
 *     task_success_rate: number | null,
 *     avg_failed_count: number | null,
 *     avg_output_count: number | null,
 *     avg_update_count: number | null,
 *     review_verdicts: Record<string, number>,
 *     actions: Record<string, number>,
 *   },
 * }} BenchmarkSuiteRun */

function nowIso() {
  return new Date().toISOString();
}

/** @param {any} plan @param {any} review */
function readTaskMetrics(plan, review) {
  const scaffold = plan && plan.scaffold ? plan.scaffold : null;
  const outputs = scaffold && Array.isArray(scaffold.outputs)
    ? scaffold.outputs
    : scaffold && scaffold.output ? [scaffold.output] : [];
  const updates = scaffold && Array.isArray(scaffold.updates) ? scaffold.updates : [];
  const coder = plan && plan.coder_loop ? plan.coder_loop : {};
  const failedCount = Number(coder.failed_count || 0);
  const reviewVerdict = review && review.verdict ? review.verdict : null;
  return {
    scaffold_output_count: outputs.length,
    scaffold_update_count: updates.length,
    integration_status: scaffold ? scaffold.integration_status || 'none' : 'none',
    failed_count: failedCount,
    round_count: Number(coder.round_count || 0),
    strategy_action: coder.strategy_action || null,
    strategy_confidence: coder.strategy_confidence || null,
    selected_skill: plan && plan.selected_skill ? (plan.selected_skill.dir || plan.selected_skill.name || null) : null,
    task_family: resolveTaskFamily(plan && plan.selected_skill ? plan.selected_skill : null),
    review_verdict: reviewVerdict,
    task_success: failedCount === 0 && (!reviewVerdict || reviewVerdict !== 'BLOCK'),
  };
}

/** @param {any} caseDef @param {any} detected @param {any} plan @param {any} review @param {string | null} error */
function evaluateCase(caseDef, detected, plan, review, error) {
  /** @type {Array<Record<string, unknown>>} */
  const checks = [];
  const expected = caseDef.expected || {};
  const exactFields = [
    ['runtime', detected.runtime],
    ['language', detected.language],
    ['framework', detected.framework],
  ];
  for (const [field, actual] of exactFields) {
    if (expected[field] === undefined) continue;
    const allowed = toList(expected[field]);
    checks.push({ field, expected: allowed, actual, passed: allowed.includes(actual) });
  }
  if (expected.skill !== undefined) {
    const actualSkill = plan && plan.selected_skill ? plan.selected_skill.dir : null;
    const allowed = toList(expected.skill);
    checks.push({ field: 'skill', expected: allowed, actual: actualSkill, passed: allowed.includes(actualSkill) });
  }
  if (expected.status !== undefined) {
    const actualStatus = plan && plan.coder_loop ? plan.coder_loop.status : null;
    const allowed = toList(expected.status);
    checks.push({ field: 'status', expected: allowed, actual: actualStatus, passed: allowed.includes(actualStatus) });
  }
  if (expected.max_failed_count !== undefined) {
    const actualFailed = plan && plan.coder_loop ? Number(plan.coder_loop.failed_count || 0) : null;
    checks.push({ field: 'max_failed_count', expected: expected.max_failed_count, actual: actualFailed, passed: actualFailed !== null && actualFailed <= Number(expected.max_failed_count) });
  }
  const task = readTaskMetrics(plan, review);
  if (expected.min_outputs !== undefined) {
    checks.push({ field: 'min_outputs', expected: expected.min_outputs, actual: task.scaffold_output_count, passed: task.scaffold_output_count >= Number(expected.min_outputs) });
  }
  if (expected.min_updates !== undefined) {
    checks.push({ field: 'min_updates', expected: expected.min_updates, actual: task.scaffold_update_count, passed: task.scaffold_update_count >= Number(expected.min_updates) });
  }
  if (expected.integration_status !== undefined) {
    const allowed = toList(expected.integration_status);
    checks.push({ field: 'integration_status', expected: allowed, actual: task.integration_status, passed: allowed.includes(task.integration_status) });
  }
  if (expected.review_verdict !== undefined) {
    const allowed = toList(expected.review_verdict);
    checks.push({ field: 'review_verdict', expected: allowed, actual: task.review_verdict, passed: allowed.includes(task.review_verdict) });
  }
  if (expected.task_success !== undefined) {
    checks.push({ field: 'task_success', expected: Boolean(expected.task_success), actual: task.task_success, passed: Boolean(expected.task_success) === task.task_success });
  }
  const passed = !error && checks.every((check) => Boolean(check.passed));
  return { passed, checks, task };
}

function defaultSuiteDependencies() {
  return {
    detectProjectProfile,
    createPlan,
    runMergeGate,
    appendEvent,
    writeBenchmarkRun,
    readBenchmarkRuns,
  };
}

/**
 * @param {Record<string, any>} opts
 * @param {{
 *   detectProjectProfile?: (root: string) => any,
 *   createPlan?: (opts: Record<string, any>) => Promise<any> | any,
 *   runMergeGate?: (opts: Record<string, any>) => Promise<any> | any,
 *   appendEvent?: (root: string, eventType: string, payload: Record<string, any>) => void,
 *   writeBenchmarkRun?: (root: string, run: any) => void,
 *   readBenchmarkRuns?: (root: string, options?: Record<string, any>) => any[]
 * }} [dependencies]
 */
async function runSuite(opts, dependencies = defaultSuiteDependencies()) {
  if (!opts.suite) throw new Error('Missing --suite <file>');
  const suitePath = path.resolve(String(opts.suite));
  const suite = readJson(suitePath);
  const controlRoot = path.resolve(String(opts.root || process.cwd()));
  const selectedRuntime = opts.runtime ? String(opts.runtime) : null;
  const limit = opts.limit ? Number(opts.limit) : null;
  /** @type {BenchmarkSuiteRun} */
  const run = {
    schema_version: '1.2',
    run_id: `bench-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`,
    suite_name: String(suite.name || path.basename(suitePath)),
    suite_path: suitePath,
    started_at: nowIso(),
    results: [],
  };
  const emitEvent = dependencies.appendEvent || (() => {});
  emitEvent(controlRoot, 'benchmark.run.started', { flow: 'benchmark', suite_name: run.suite_name, run_id: run.run_id, status: 'started' });
  const cases = (suite.cases || []).filter(/** @param {any} item */ (item) => !selectedRuntime || String((item.expected && item.expected.runtime) || '').toLowerCase() === selectedRuntime.toLowerCase() || String(item.runtime || '').toLowerCase() === selectedRuntime.toLowerCase());
  const boundedCases = limit ? cases.slice(0, limit) : cases;
  for (const caseDef of boundedCases) {
    const caseRoot = resolveCaseRoot(caseDef, suitePath);
    const workspace = prepareWorkspace(caseRoot, controlRoot, run.run_id, caseDef.id || `case-${run.results.length + 1}`, caseDef.workspace_mode || opts['workspace-mode']);
    const executionRoot = workspace.workspace_root;
    const startedAt = Date.now();
    let detected = null;
    let plan = null;
    let review = null;
    let error = null;
    try {
      detected = (dependencies.detectProjectProfile || detectProjectProfile)(executionRoot);
      const created = await (dependencies.createPlan || createPlan)({
        objective: caseDef.objective,
        root: executionRoot,
        skill: caseDef.skill,
        scaffold: Boolean(caseDef.scaffold),
        var: asVarPairs(caseDef.var),
        targets: Array.isArray(caseDef.targets) ? caseDef.targets.join(',') : caseDef.targets,
        checks: Array.isArray(caseDef.checks) ? caseDef.checks.join(',') : caseDef.checks,
        mode: caseDef.mode || 'auto',
        'no-snapshot': true,
        'no-validate': Boolean(caseDef['no-validate']),
      });
      plan = created.plan;
      if (caseDef.review_gate) {
        review = await (dependencies.runMergeGate || runMergeGate)({ root: executionRoot, 'no-quality-gate': true });
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const evaluation = evaluateCase(caseDef, detected || {}, plan, review, error);
    /** @type {BenchmarkSuiteCaseResult} */
    const result = {
      case_id: String(caseDef.id || `case-${run.results.length + 1}`),
      root: caseRoot,
      workspace_root: executionRoot,
      workspace_mode: workspace.workspace_mode,
      objective: String(caseDef.objective || ''),
      duration_ms: Date.now() - startedAt,
      detected: detected ? { runtime: detected.runtime, language: detected.language, framework: detected.framework, package_manager: detected.package_manager || null } : {},
      plan: plan ? {
        plan_id: plan.plan_id,
        selected_skill: plan.selected_skill || null,
        coder_loop: plan.coder_loop || null,
        scaffold: plan.scaffold ? {
          outputs: Array.isArray(plan.scaffold.outputs) ? plan.scaffold.outputs : (plan.scaffold.output ? [plan.scaffold.output] : []),
          updates: Array.isArray(plan.scaffold.updates) ? plan.scaffold.updates : [],
          integration_status: plan.scaffold.integration_status || 'none',
        } : null,
      } : null,
      review: review ? { verdict: review.verdict, merge_risk: review.merge_risk_summary || null } : null,
      task: evaluation.task,
      checks: evaluation.checks,
      passed: Boolean(evaluation.passed),
      error,
    };
    run.results.push(result);
    emitEvent(controlRoot, 'benchmark.case.completed', {
      flow: 'benchmark',
      suite_name: run.suite_name,
      run_id: run.run_id,
      case_id: result.case_id,
      runtime: String(result.detected.runtime || 'unknown'),
      status: result.passed ? 'passed' : 'failed',
      task_success: result.task.task_success,
      review_verdict: result.task.review_verdict,
      skill: result.task.selected_skill,
      task_family: result.task.task_family,
      duration_ms: result.duration_ms,
    });
  }
  run.completed_at = nowIso();
  const passed = run.results.filter((item) => item.passed).length;
  const failed = run.results.length - passed;
  const metrics = summarizeTaskMetrics(run.results);
  run.summary = {
    total: run.results.length,
    passed,
    failed,
    pass_rate: run.results.length === 0 ? 0 : Number(((passed / run.results.length) * 100).toFixed(2)),
    task_success_total: metrics.task_success_total,
    task_success_rate: metrics.task_success_rate,
    avg_failed_count: metrics.avg_failed_count,
    avg_output_count: metrics.avg_output_count,
    avg_update_count: metrics.avg_update_count,
    review_verdicts: metrics.review_verdicts,
    actions: metrics.actions,
  };
  (dependencies.writeBenchmarkRun || writeBenchmarkRun)(controlRoot, run);
  emitEvent(controlRoot, 'benchmark.run.completed', {
    flow: 'benchmark',
    suite_name: run.suite_name,
    run_id: run.run_id,
    status: failed === 0 ? 'passed' : 'failed',
    case_total: run.summary.total,
    case_passed: passed,
    case_failed: failed,
    task_success_total: run.summary.task_success_total,
    task_success_rate: run.summary.task_success_rate,
  });
  return run;
}

/** @param {string} rootDir @param {{ readBenchmarkRuns?: (root: string, options?: Record<string, any>) => any[] }} [dependencies] */
function compareLatest(rootDir, dependencies = defaultSuiteDependencies()) {
  const runs = (dependencies.readBenchmarkRuns || readBenchmarkRuns)(rootDir, { limit: 2 });
  if (runs.length < 2) throw new Error('Need at least two benchmark runs to compare latest results');
  return compareRuns(runs[1], runs[0]);
}

module.exports = {
  readJson,
  writeJson,
  sanitizeCaseId,
  prepareWorkspace,
  resolveCaseRoot,
  asVarPairs,
  toList,
  readTaskMetrics,
  evaluateCase,
  runSuite,
  compareLatest,
};
