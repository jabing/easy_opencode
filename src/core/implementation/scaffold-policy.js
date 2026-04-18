/**
 * @param {Record<string, any>} opts
 * @param {{ strategy_bias?: string } | null | undefined} benchmarkFeedback
 */
function deriveScaffoldPolicy(opts, benchmarkFeedback) {
  const strategyBias = String(opts['strategy-bias'] || (benchmarkFeedback ? benchmarkFeedback.strategy_bias : 'balanced'));
  let bundleMode = String(opts['bundle-mode'] || 'auto');
  let integrationMode = String(opts['integration-mode'] || 'auto');
  if (bundleMode === 'auto') {
    if (strategyBias === 'conservative') bundleMode = 'minimal';
    else if (strategyBias === 'accelerated') bundleMode = 'full';
    else bundleMode = 'standard';
  }
  if (integrationMode === 'auto') {
    if (strategyBias === 'conservative') integrationMode = 'plan';
    else integrationMode = 'apply';
  }
  return {
    strategy_bias: strategyBias,
    bundle_mode: bundleMode,
    integration_mode: integrationMode,
  };
}

module.exports = {
  deriveScaffoldPolicy,
};
