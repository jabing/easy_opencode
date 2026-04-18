/** @typedef {{ objective?: string, targets?: any[], latestFailures?: any[] }} TaskRouteInput */

/** @param {TaskRouteInput} [input] */
function classifyTask({ objective = '', targets = [], latestFailures = [] } = {}) {
  const text = String(objective || '').toLowerCase();
  const targetCount = Array.isArray(targets) ? targets.length : 0;
  const failureText = (Array.isArray(latestFailures) ? latestFailures : []).map((item) => JSON.stringify(item)).join(' ').toLowerCase();
  if (/scaffold|generate|create feature|new module|greenfield/.test(text) || (/\bnew\b/.test(text) && /\b(endpoint|route|service|module)\b/.test(text))) return 'greenfield_scaffold';
  if (/refactor|rename|extract|migrate|split/.test(text)) return 'cross_file_refactor';
  if (/test|spec/.test(text) || /assertion|expect/.test(failureText)) return 'test_repair';
  if (/config|package|dependency|import|module/.test(text) || /module not found|cannot find module|missing script/.test(failureText)) return 'dependency_or_config_fix';
  if (/type|typescript|signature|interface/.test(text) || /ts\d+|typecheck|assignable/.test(failureText)) return 'type_repair';
  if (/bug|fix|repair|hotfix/.test(text) || targetCount <= 2) return 'local_bugfix';
  if (targetCount >= 4) return 'multi_file_feature';
  return 'multi_file_feature';
}

/** @param {string} taskKind @param {any} [profile] @param {any[]} [targets] @param {any[]} [latestFailures] @param {any | null} [benchmarkFeedback] */
function deriveRiskLevel(taskKind, profile = {}, targets = [], latestFailures = [], benchmarkFeedback = null) {
  if (benchmarkFeedback && benchmarkFeedback.risk_level) return benchmarkFeedback.risk_level;
  const repoShape = String(profile.repo_shape || '').toLowerCase();
  const framework = String(profile.framework || '').toLowerCase();
  const failureText = JSON.stringify(latestFailures || []).toLowerCase();
  let score = 0;
  if (taskKind === 'cross_file_refactor') score += 3;
  if (taskKind === 'multi_file_feature') score += 2;
  if (targets.length >= 4) score += 1;
  if (repoShape === 'workspace' || repoShape === 'monorepo') score += 1;
  if (/next|express|fastify|spring|django/.test(framework)) score += 1;
  if (/syntax|typecheck|import_resolve|contract_mismatch/.test(failureText)) score += 1;
  return score >= 4 ? 'high' : (score >= 2 ? 'medium' : 'low');
}

/** @param {{ objective?: string, profile?: any, targets?: any[], latestFailures?: any[], benchmarkFeedback?: any | null }} [input] */
function recommendTaskRoute({ objective = '', profile = {}, targets = [], latestFailures = [], benchmarkFeedback = null } = {}) {
  const taskKind = classifyTask({ objective, targets, latestFailures });
  const risk = deriveRiskLevel(taskKind, profile, targets, latestFailures, benchmarkFeedback);
  const failureText = JSON.stringify(latestFailures || []).toLowerCase();
  const hasTypeSignals = /type|assignable|signature|ts\d+/.test(failureText);
  const hasImportSignals = /import|module not found|cannot find module/.test(failureText);
  const hasTestSignals = /assertion|expect|received/.test(failureText);
  const codingStrength = String(benchmarkFeedback?.coding_strength || '').toLowerCase();
  const routeConfidence = codingStrength === 'strong' ? 'high' : (codingStrength === 'developing' ? 'medium' : 'low');
  const codingModel = risk === 'high' || taskKind === 'cross_file_refactor' || routeConfidence === 'low' ? 'primary' : 'small';
  const repairModel = (hasTypeSignals || hasImportSignals) && risk !== 'high' ? 'small' : 'primary';
  const contextBudget = taskKind === 'greenfield_scaffold'
    ? 'broad'
    : (taskKind === 'cross_file_refactor' || risk === 'high'
      ? 'broad'
      : (taskKind === 'multi_file_feature' ? 'standard' : 'narrow'));
  const verifyIntensity = risk === 'high' ? 'deep' : (taskKind === 'local_bugfix' || taskKind === 'type_repair' ? 'targeted' : 'standard');
  const editMode = taskKind === 'cross_file_refactor'
    ? 'expansive'
    : (taskKind === 'multi_file_feature' || taskKind === 'test_repair'
      ? 'localized'
      : 'surgical');
  const strategyBias = risk === 'high'
    ? 'conservative'
    : (taskKind === 'greenfield_scaffold' && routeConfidence !== 'low' ? 'accelerated' : 'balanced');
  return {
    task_kind: taskKind,
    risk_level: risk,
    route_confidence: routeConfidence,
    planning_model: risk === 'high' ? 'primary' : 'small',
    coding_model: codingModel,
    repair_model: repairModel,
    context_budget: contextBudget,
    verify_intensity: verifyIntensity,
    edit_mode: editMode,
    strategy_bias: strategyBias,
    recommended_loop_mode: hasTestSignals ? 'test-first' : (hasTypeSignals || hasImportSignals ? 'repair-first' : 'implement-first'),
    reasons: [
      `task_kind=${taskKind}`,
      `runtime=${profile.runtime || 'unknown'}`,
      `risk=${risk}`,
      `targets=${targets.length}`,
      benchmarkFeedback?.coding_strength ? `benchmark_strength=${benchmarkFeedback.coding_strength}` : null,
      hasTypeSignals ? 'failure_signal=type' : null,
      hasImportSignals ? 'failure_signal=import' : null,
      hasTestSignals ? 'failure_signal=test' : null,
    ].filter(Boolean),
  };
}

module.exports = {
  classifyTask,
  deriveRiskLevel,
  recommendTaskRoute,
};
