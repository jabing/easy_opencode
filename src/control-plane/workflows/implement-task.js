const { defineWorkflow, executeWorkflow } = require('../workflow/engine.js');

/** @typedef {{ dir?: string, name?: string, decision?: { summary?: string } | null }} SelectedSkill */
/** @typedef {{ report?: { totals?: { rejected?: number } | null } | null }} SkillSelection */
/** @typedef {{ rootDir: string, traceId?: string, profile: { runtime: string }, selectedSkill?: SelectedSkill | null, selection?: SkillSelection | null, benchmarkFeedback: { risk_level: string }, snapshot: { status?: string }, opts: Record<string, unknown>, scaffold?: { status?: string, created?: boolean } | null, run?: { run_id: string }, round?: { checks?: unknown[] }, latestRun?: Record<string, unknown>, plan?: { plan_id: string }, promptText?: string, runScaffold(): { status?: string, created?: boolean }, createCoderRun(): { run_id: string }, executeCoderRound(run: { run_id: string }): { checks?: unknown[] }, loadCoderRun(runId: string, rootDir: string): Record<string, unknown>, writePlanArtifacts(): { plan: { plan_id: string }, promptText: string } }} ImplementTaskWorkflowContext */

/** @param {ImplementTaskWorkflowContext} ctx */
async function detectProjectProfileStep(ctx) {
  return { summary: `runtime=${ctx.profile.runtime}` };
}

/** @param {ImplementTaskWorkflowContext} ctx */
async function selectSkillStep(ctx) {
  if (!ctx.selectedSkill) return { summary: 'no skill selected' };
  const rejected = ctx.selection && ctx.selection.report && ctx.selection.report.totals ? ctx.selection.report.totals.rejected || 0 : 0;
  const rationale = ctx.selectedSkill.decision && ctx.selectedSkill.decision.summary ? ` | ${ctx.selectedSkill.decision.summary}` : '';
  return { summary: `skill=${ctx.selectedSkill.dir || ctx.selectedSkill.name} | rejected=${rejected}${rationale}` };
}

/** @param {ImplementTaskWorkflowContext} ctx */
async function assessBenchmarkFeedbackStep(ctx) {
  return { summary: `risk=${ctx.benchmarkFeedback.risk_level}` };
}

/** @param {ImplementTaskWorkflowContext} ctx */
async function createSnapshotStep(ctx) {
  return { summary: `snapshot=${ctx.snapshot.status || 'unknown'}` };
}

/** @param {ImplementTaskWorkflowContext} ctx */
function shouldRunScaffold(ctx) {
  return Boolean(ctx.opts && ctx.opts.scaffold);
}

/** @param {ImplementTaskWorkflowContext} ctx */
async function runScaffoldStep(ctx) {
  ctx.scaffold = ctx.runScaffold();
  return { summary: (ctx.scaffold && (ctx.scaffold.status || (ctx.scaffold.created ? 'created' : 'completed'))) || 'completed' };
}

/** @param {ImplementTaskWorkflowContext} ctx */
async function createCoderRunStep(ctx) {
  ctx.run = ctx.createCoderRun();
  return { summary: `run=${ctx.run.run_id}` };
}

/** @param {ImplementTaskWorkflowContext} ctx */
function shouldExecuteValidationRound(ctx) {
  return !ctx.opts['no-validate'];
}

/** @param {ImplementTaskWorkflowContext} ctx */
async function executeValidationRoundStep(ctx) {
  const run = ctx.run;
  if (!run) throw new Error('coder run must exist before executing validation');
  ctx.round = ctx.executeCoderRound(run);
  ctx.latestRun = ctx.loadCoderRun(run.run_id, ctx.rootDir);
  return { summary: `checks=${(ctx.round.checks || []).length}` };
}

/** @param {ImplementTaskWorkflowContext} ctx */
async function writePlanArtifactsStep(ctx) {
  const planResult = ctx.writePlanArtifacts();
  ctx.plan = planResult.plan;
  ctx.promptText = planResult.promptText;
  return { summary: `plan=${ctx.plan.plan_id}` };
}

const implementTaskWorkflow = defineWorkflow({
  id: 'implement-task',
  title: 'Implementation Planning Workflow',
  version: '4.0',
  steps: [
    { id: 'detect-project-profile', title: 'Detect project profile', run: (context) => detectProjectProfileStep(/** @type {ImplementTaskWorkflowContext} */ (context)) },
    { id: 'select-skill', title: 'Select skill', run: (context) => selectSkillStep(/** @type {ImplementTaskWorkflowContext} */ (context)) },
    { id: 'assess-benchmark-feedback', title: 'Assess benchmark feedback', run: (context) => assessBenchmarkFeedbackStep(/** @type {ImplementTaskWorkflowContext} */ (context)) },
    { id: 'create-snapshot', title: 'Create safety snapshot', run: (context) => createSnapshotStep(/** @type {ImplementTaskWorkflowContext} */ (context)) },
    { id: 'run-scaffold', title: 'Run skill scaffold', when: (context) => shouldRunScaffold(/** @type {ImplementTaskWorkflowContext} */ (context)), run: (context) => runScaffoldStep(/** @type {ImplementTaskWorkflowContext} */ (context)) },
    { id: 'create-coder-run', title: 'Create coder loop run', run: (context) => createCoderRunStep(/** @type {ImplementTaskWorkflowContext} */ (context)) },
    { id: 'execute-validation-round', title: 'Execute validation round', when: (context) => shouldExecuteValidationRound(/** @type {ImplementTaskWorkflowContext} */ (context)), run: (context) => executeValidationRoundStep(/** @type {ImplementTaskWorkflowContext} */ (context)) },
    { id: 'write-plan-artifacts', title: 'Write plan artifacts', run: (context) => writePlanArtifactsStep(/** @type {ImplementTaskWorkflowContext} */ (context)) },
  ],
});

/** @param {ImplementTaskWorkflowContext} context */
async function executeImplementTaskWorkflow(context) {
  return executeWorkflow(implementTaskWorkflow, {
    rootDir: context.rootDir,
    traceId: context.traceId || `implement-${Date.now()}`,
    context,
  });
}

module.exports = {
  implementTaskWorkflow,
  executeImplementTaskWorkflow,
};
