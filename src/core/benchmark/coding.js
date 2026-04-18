/** @param {Array<number | string | null | undefined>} [values] @returns {number | null} */
function average(values = []) {
  const nums = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  return nums.length ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)) : null;
}

/**
 * @param {{ averageUnrelatedEditRatio?: number | null, averageDiffSize?: number | null, averageRegressionRate?: number | null }} [input]
 * @returns {number}
 */
function scorePatchDiscipline({ averageUnrelatedEditRatio = null, averageDiffSize = null, averageRegressionRate = null } = {}) {
  let score = 100;
  if (averageUnrelatedEditRatio !== null) score -= Math.min(50, Math.round(Number(averageUnrelatedEditRatio) * 100));
  if (averageDiffSize !== null) score -= Math.min(20, Math.max(0, Math.round(Number(averageDiffSize) - 3)));
  if (averageRegressionRate !== null) score -= Math.min(30, Math.round(Number(averageRegressionRate) * 100));
  return Math.max(0, score);
}

/** @param {{ results?: any[], summary?: { task_success_rate?: number | null } }} [run] */
function summarizeCodingCapability(run = {}) {
  const results = Array.isArray(run.results) ? run.results : [];
  const total = results.length;
  const firstPassSuccess = results.filter((/** @type {any} */ item) => item.task && item.task.task_success && Number(item.plan?.coder_loop?.round_count || 0) <= 1).length;
  const successful = results.filter((/** @type {any} */ item) => item.task && item.task.task_success);
  const roundsToGreen = successful
    .map((/** @type {any} */ item) => Number(item.plan?.coder_loop?.round_count || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const diffSizes = results.map((/** @type {any} */ item) => item.patch?.file_count ?? item.patch?.touched_files?.length).filter((value) => Number.isFinite(Number(value)));
  const unrelatedEditRatios = results.map((/** @type {any} */ item) => item.patch?.unrelated_edit_ratio).filter((value) => Number.isFinite(Number(value)));
  const regressionRates = results.map((/** @type {any} */ item) => item.task?.regression_rate).filter((value) => Number.isFinite(Number(value)));
  const patchVerdicts = results.map((/** @type {any} */ item) => item.patch?.verdict).filter(Boolean);
  const avgRounds = average(roundsToGreen);
  const avgDiffSize = average(diffSizes);
  const avgUnrelatedEditRatio = average(unrelatedEditRatios);
  const avgRegressionRate = average(regressionRates);
  const patchDisciplineScore = scorePatchDiscipline({
    averageUnrelatedEditRatio: avgUnrelatedEditRatio,
    averageDiffSize: avgDiffSize,
    averageRegressionRate: avgRegressionRate,
  });
  const patchDiscipline = patchDisciplineScore >= 80 ? 'tight' : (patchDisciplineScore >= 60 ? 'mixed' : 'loose');
  let strength = 'weak';
  if (avgRounds !== null && avgRounds <= 1.5 && (avgUnrelatedEditRatio === null || avgUnrelatedEditRatio <= 0.15) && patchDisciplineScore >= 80) strength = 'strong';
  else if (avgRounds !== null && avgRounds <= 2.5 && (avgUnrelatedEditRatio === null || avgUnrelatedEditRatio <= 0.35) && patchDisciplineScore >= 60) strength = 'developing';
  /** @type {Record<string, number>} */
  const patchVerdictDistribution = patchVerdicts.reduce((acc, value) => {
    const key = String(value);
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));
  return {
    total_cases: total,
    first_pass_success_rate: total ? Number(((firstPassSuccess / total) * 100).toFixed(1)) : null,
    average_rounds_to_green: avgRounds,
    average_diff_size: avgDiffSize,
    average_unrelated_edit_ratio: avgUnrelatedEditRatio,
    average_regression_rate: avgRegressionRate,
    patch_verdict_distribution: patchVerdictDistribution,
    patch_discipline_score: patchDisciplineScore,
    patch_discipline: patchDiscipline,
    task_success_rate: run.summary && run.summary.task_success_rate !== undefined ? run.summary.task_success_rate : null,
    coding_strength: strength,
  };
}

module.exports = {
  summarizeCodingCapability,
  scorePatchDiscipline,
};
