const { defineWorkflow, executeWorkflow } = require('../workflow/engine.js');

/**
 * @typedef {{
 *   rootDir: string,
 *   traceId?: string,
 *   run?: { run_id?: string } | null,
 *   runScheduler(): Promise<string> | string,
 *   advanceFromBacklog(): Promise<string> | string,
 *   lockScopeEvidence(): Promise<string> | string,
 *   markImplementationComplete(): Promise<string> | string,
 *   runQualityGateAndCoverage(): Promise<string> | string,
 *   runReviewStage(): Promise<string> | string,
 *   finalizeDocsAndArchive(): Promise<string> | string,
 * }} EocUltraworkContext
 */

/** @param {Record<string, unknown>} ctx */
function asEocContext(ctx) {
  return /** @type {EocUltraworkContext} */ (ctx);
}

/** @param {Record<string, unknown>} ctx */
async function bridgeRunStep(ctx) {
  const typed = asEocContext(ctx);
  return { summary: `run=${typed.run && typed.run.run_id ? typed.run.run_id : 'none'}` };
}
/** @param {Record<string, unknown>} ctx */
async function schedulerStep(ctx) { return { summary: await asEocContext(ctx).runScheduler() }; }
/** @param {Record<string, unknown>} ctx */
async function advanceGateStep(ctx) { return { summary: await asEocContext(ctx).advanceFromBacklog() }; }
/** @param {Record<string, unknown>} ctx */
async function lockScopeStep(ctx) { return { summary: await asEocContext(ctx).lockScopeEvidence() }; }
/** @param {Record<string, unknown>} ctx */
async function implementationCompleteStep(ctx) { return { summary: await asEocContext(ctx).markImplementationComplete() }; }
/** @param {Record<string, unknown>} ctx */
async function qualityGateStep(ctx) { return { summary: await asEocContext(ctx).runQualityGateAndCoverage() }; }
/** @param {Record<string, unknown>} ctx */
async function reviewGateStep(ctx) { return { summary: await asEocContext(ctx).runReviewStage() }; }
/** @param {Record<string, unknown>} ctx */
async function finalizeStep(ctx) { return { summary: await asEocContext(ctx).finalizeDocsAndArchive() }; }

const eocUltraworkWorkflow = defineWorkflow({
  id: 'eoc-ultrawork',
  title: 'EOC Ultrawork Workflow',
  version: '4.0',
  steps: [
    { id: 'bridge-run', title: 'Bridge execution packet', run: bridgeRunStep },
    { id: 'scheduler', title: 'Execute scheduler', run: schedulerStep },
    { id: 'gate-0-1', title: 'Advance gate 0 to 1', run: advanceGateStep },
    { id: 'gate-1-2', title: 'Lock scope and acceptance criteria', run: lockScopeStep },
    { id: 'gate-2-3', title: 'Mark implementation complete', run: implementationCompleteStep },
    { id: 'gate-3-4', title: 'Run build, tests, coverage', run: qualityGateStep },
    { id: 'gate-4-5', title: 'Run review gate', run: reviewGateStep },
    { id: 'gate-5-6', title: 'Finalize docs and archive', run: finalizeStep },
  ],
});

/** @param {EocUltraworkContext} context */
async function executeEocUltraworkWorkflow(context) {
  /** @type {{ rootDir: string, traceId: string, context: EocUltraworkContext, runId?: string }} */
  const options = {
    rootDir: context.rootDir,
    traceId: context.traceId || `ultrawork-${Date.now()}`,
    context,
  };
  if (context.run && context.run.run_id) options.runId = context.run.run_id;
  return executeWorkflow(eocUltraworkWorkflow, options);
}

module.exports = {
  eocUltraworkWorkflow,
  executeEocUltraworkWorkflow,
};
