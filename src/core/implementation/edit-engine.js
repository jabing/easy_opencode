/**
 * @typedef {{ recommended_edit_mode?: string, impact_score?: number, candidate_edit_files?: Array<{ path?: string }>, direct_neighbors?: string[], test_neighbors?: string[], high_risk_neighbors?: string[] }} ChangeSurface
 * @typedef {{ ast_edit_mode?: string }} EditPolicy
 * @typedef {{ kind?: string, category?: string, rule?: string }} FailureLike
 * @typedef {{ preferred_edit_mode?: string, max_patch_files?: number, patch_guard?: { preferred_files?: string[] } }} PatchRecipe
 * @typedef {{ allowed_files?: number }} PatchRoute
 * @typedef {{ touched_files?: string[], unstaged_files?: string[], staged_files?: string[], untracked_files?: string[], deleted_files?: string[], all_touched_files?: string[], allowed_files?: number }} PatchFootprint
 * @typedef {{ verdict?: string, unrelated_edit_ratio?: number, file_budget_exceeded?: boolean, protected_file_violations?: string[], patch_surface?: { unstaged_files?: string[], staged_files?: string[], untracked_files?: string[], deleted_files?: string[], all_touched_files?: string[] } | null }} PatchAssessment
 */

/** @param {{ objective?: string, taskKind?: string, changeSurface?: ChangeSurface, policy?: EditPolicy, latestFailures?: FailureLike[] }} [input] */
function chooseEditStrategy({ objective = '', taskKind = 'local_bugfix', changeSurface = {}, policy = {}, latestFailures = [] } = {}) {
  const objectiveText = String(objective || '').toLowerCase();
  const failureKinds = (Array.isArray(latestFailures) ? latestFailures : []).map((item) => String(item.kind || item.category || item.rule || '')).join(' ');
  let editMode = String(policy.ast_edit_mode || '').trim() || null;
  if (!editMode) {
    if (taskKind === 'greenfield_scaffold') editMode = 'expansive';
    else if (taskKind === 'cross_file_refactor') editMode = 'expansive';
    else if (taskKind === 'test_repair' || /assert|test/.test(objectiveText)) editMode = 'localized';
    else editMode = changeSurface.recommended_edit_mode === 'localized' ? 'localized' : 'surgical';
  }
  if (/type|import|lint|format/.test(failureKinds)) editMode = editMode === 'expansive' ? 'localized' : editMode;
  if (Number(changeSurface.impact_score || 0) >= 10 && editMode === 'surgical') editMode = 'localized';
  const allowedFiles = editMode === 'surgical' ? 4 : (editMode === 'localized' ? 10 : 24);
  return {
    edit_mode: editMode,
    allowed_files: allowedFiles,
    apply_style_contract: true,
    protect_high_risk_neighbors: editMode !== 'expansive',
    prefer_ast_rewrite: editMode !== 'expansive',
  };
}

/** @param {string[]} [files] @param {string[]} [symbols] */
function summarizePatchFootprint(files = [], symbols = []) {
  const uniqueFiles = Array.from(new Set((files || []).filter(Boolean)));
  const uniqueSymbols = Array.from(new Set((symbols || []).filter(Boolean)));
  return {
    touched_files: uniqueFiles,
    touched_symbols: uniqueSymbols,
    file_count: uniqueFiles.length,
    symbol_count: uniqueSymbols.length,
    classification: uniqueFiles.length <= 4 ? 'tight' : (uniqueFiles.length <= 10 ? 'localized' : 'broad'),
  };
}

/** @param {PatchFootprint} footprint */
function collectFootprintFiles(footprint = {}) {
  /** @type {string[]} */
  const files = [];
  /** @param {string[] | undefined} values */
  const push = (values) => {
    for (const value of values || []) {
      const normalized = String(value || '').trim();
      if (normalized) files.push(normalized);
    }
  };
  push(footprint.touched_files);
  push(footprint.all_touched_files);
  push(footprint.unstaged_files);
  push(footprint.staged_files);
  push(footprint.untracked_files);
  push(footprint.deleted_files);
  return Array.from(new Set(files));
}

/** @param {PatchFootprint} footprint */
function normalizePatchSurface(footprint = {}) {
  return {
    unstaged_files: Array.from(new Set((footprint.unstaged_files || []).filter(Boolean))),
    staged_files: Array.from(new Set((footprint.staged_files || []).filter(Boolean))),
    untracked_files: Array.from(new Set((footprint.untracked_files || []).filter(Boolean))),
    deleted_files: Array.from(new Set((footprint.deleted_files || []).filter(Boolean))),
    all_touched_files: Array.from(new Set([
      ...(footprint.all_touched_files || []),
      ...(footprint.touched_files || []),
      ...(footprint.unstaged_files || []),
      ...(footprint.staged_files || []),
      ...(footprint.untracked_files || []),
      ...(footprint.deleted_files || []),
    ].filter(Boolean))).sort(),
  };
}

/** @param {{ footprint?: PatchFootprint, changeSurface?: ChangeSurface, route?: PatchRoute, recipe?: PatchRecipe }} [input] */
function evaluatePatchFootprint({ footprint = {}, changeSurface = {}, route = {}, recipe = {} } = {}) {
  const patchSurface = normalizePatchSurface(footprint);
  const touchedFiles = collectFootprintFiles(footprint);
  const allowedFiles = Number(route.allowed_files || recipe.max_patch_files || footprint.allowed_files || 0) || null;
  const candidateFiles = new Set((changeSurface.candidate_edit_files || []).map((item) => item.path || '').filter(Boolean));
  const directNeighbors = new Set(changeSurface.direct_neighbors || []);
  const testNeighbors = new Set(changeSurface.test_neighbors || []);
  const highRisk = new Set(changeSurface.high_risk_neighbors || []);

  let unrelatedCount = 0;
  /** @type {string[]} */
  const protectedViolations = [];
  for (const file of touchedFiles) {
    const isExpected = candidateFiles.has(file) || directNeighbors.has(file) || testNeighbors.has(file);
    if (!isExpected) unrelatedCount += 1;
    if (highRisk.has(file) && recipe.preferred_edit_mode === 'surgical') protectedViolations.push(file);
  }
  const unrelatedRatio = touchedFiles.length ? Number((unrelatedCount / touchedFiles.length).toFixed(2)) : 0;
  const fileBudgetExceeded = allowedFiles !== null ? touchedFiles.length > allowedFiles : false;
  let verdict = 'accept';
  if (fileBudgetExceeded || protectedViolations.length > 0) verdict = 'reject';
  else if (unrelatedRatio > 0.34) verdict = 'warning';

  return {
    touched_files: touchedFiles,
    unrelated_edit_ratio: unrelatedRatio,
    file_budget: allowedFiles,
    file_budget_exceeded: fileBudgetExceeded,
    protected_file_violations: protectedViolations,
    verdict,
    patch_surface: patchSurface,
  };
}

/** @param {{ assessment?: PatchAssessment | null, recipe?: PatchRecipe, route?: PatchRoute }} [input] */
function derivePatchDecision({ assessment = null, recipe = {}, route = {} } = {}) {
  const evalResult = assessment || { verdict: 'accept', unrelated_edit_ratio: 0, file_budget_exceeded: false, protected_file_violations: [] };
  void route;
  const preferredFileList = recipe.patch_guard && Array.isArray(recipe.patch_guard.preferred_files)
    ? recipe.patch_guard.preferred_files
    : [];
  const preferredFiles = preferredFileList.filter(Boolean);
  /** @type {string[]} */
  const reasons = [];
  let action = 'apply';
  if (evalResult.file_budget_exceeded) {
    reasons.push('patch exceeds file budget for the selected edit strategy');
    action = 'split_or_rollback';
  }
  if (Array.isArray(evalResult.protected_file_violations) && evalResult.protected_file_violations.length > 0) {
    reasons.push('patch touches protected high-risk files outside the preferred repair surface');
    action = 'split_or_rollback';
  }
  if (Number(evalResult.unrelated_edit_ratio || 0) > 0.34 && action === 'apply') {
    reasons.push('patch includes too many unrelated edits for a strong-coder narrow patch');
    action = 'narrow_patch';
  }
  const allowApply = action === 'apply';
  return {
    allow_apply: allowApply,
    action,
    reasons: reasons.length ? reasons : ['patch is within budget and aligned to the preferred edit surface'],
    preferred_files: preferredFiles.slice(0, 8),
    confidence: allowApply ? 0.84 : (action === 'narrow_patch' ? 0.72 : 0.9),
  };
}

module.exports = {
  chooseEditStrategy,
  summarizePatchFootprint,
  evaluatePatchFootprint,
  derivePatchDecision,
  normalizePatchSurface,
};
