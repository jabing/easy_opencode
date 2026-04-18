const { assessBenchmarkFeedback } = require('../benchmark/feedback.js');
const { recommendTaskRoute } = require('./task-routing.js');

/** @typedef {'conservative' | 'balanced' | 'accelerated'} StrategyBias */
/** @typedef {'narrow' | 'standard' | 'broad'} ContextScope */
/** @typedef {'surgical' | 'balanced' | 'broad'} AstEditMode */

/** @param {unknown} value @param {number} fallback @param {number} [minimum] */
function clampInt(value, fallback, minimum = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  return v >= minimum ? v : fallback;
}

/** @param {unknown} value @param {StrategyBias} [fallback] @returns {StrategyBias} */
function normalizeBias(value, fallback = 'balanced') {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (normalized === 'conservative' || normalized === 'balanced' || normalized === 'accelerated') return normalized;
  return fallback;
}

/** @param {unknown} value @param {ContextScope} [fallback] @returns {ContextScope} */
function normalizeScope(value, fallback) {
  const normalized = String(value || fallback || '').trim().toLowerCase();
  if (normalized === 'narrow' || normalized === 'standard' || normalized === 'broad') return normalized;
  return fallback || 'standard';
}

/** @param {unknown} value @param {AstEditMode} [fallback] @returns {AstEditMode} */
function normalizeEditMode(value, fallback) {
  const normalized = String(value || fallback || '').trim().toLowerCase();
  if (normalized === 'surgical' || normalized === 'balanced' || normalized === 'broad') return normalized;
  return fallback || 'balanced';
}

/** @param {StrategyBias} strategyBias */
function defaultsForBias(strategyBias) {
  if (strategyBias === 'conservative') {
    return {
      strategy_bias: 'conservative',
      context_scope: 'narrow',
      target_budget: 2,
      related_test_budget: 4,
      max_failure_items: 8,
      ast_edit_mode: 'surgical',
      ast_max_files: 4,
      ast_max_identifiers: 32,
      prefer_structure_aware: true,
      allow_workspace_wide_edits: false,
    };
  }
  if (strategyBias === 'accelerated') {
    return {
      strategy_bias: 'accelerated',
      context_scope: 'broad',
      target_budget: 6,
      related_test_budget: 12,
      max_failure_items: 16,
      ast_edit_mode: 'broad',
      ast_max_files: 18,
      ast_max_identifiers: 200,
      prefer_structure_aware: true,
      allow_workspace_wide_edits: true,
    };
  }
  return {
    strategy_bias: 'balanced',
    context_scope: 'standard',
    target_budget: 4,
    related_test_budget: 8,
    max_failure_items: 12,
    ast_edit_mode: 'balanced',
    ast_max_files: 10,
    ast_max_identifiers: 96,
    prefer_structure_aware: true,
    allow_workspace_wide_edits: false,
  };
}

/** @param {any} [input] */
function deriveCoderPolicy(input = {}) {
  const benchmarkFeedback = input.benchmark_feedback || null;
  const taskRoute = recommendTaskRoute({ objective: input.objective, profile: { runtime: input.runtime, framework: input.framework }, targets: input.targets || [], latestFailures: input.latest_failures || [], benchmarkFeedback });
  const strategyBias = normalizeBias(input.strategy_bias || taskRoute.strategy_bias || (benchmarkFeedback ? benchmarkFeedback.strategy_bias : 'balanced'));
  const defaults = defaultsForBias(strategyBias);
  const contextScope = normalizeScope(input.context_scope, /** @type {ContextScope} */ (taskRoute.context_budget === 'broad' ? 'broad' : (taskRoute.context_budget === 'narrow' ? 'narrow' : defaults.context_scope)));
  const astEditMode = normalizeEditMode(input.ast_edit_mode, /** @type {AstEditMode} */ (taskRoute.edit_mode === 'expansive' ? 'broad' : (taskRoute.edit_mode === 'localized' ? 'balanced' : defaults.ast_edit_mode)));
  /** @type {any} */
  const policy = {
    strategy_bias: strategyBias,
    context_scope: contextScope,
    target_budget: clampInt(input.target_budget, defaults.target_budget),
    related_test_budget: clampInt(input.related_test_budget, defaults.related_test_budget),
    max_failure_items: clampInt(input.max_failure_items, defaults.max_failure_items),
    ast_edit_mode: astEditMode,
    ast_max_files: clampInt(input.ast_max_files, defaults.ast_max_files),
    ast_max_identifiers: clampInt(input.ast_max_identifiers, defaults.ast_max_identifiers),
    prefer_structure_aware: input.prefer_structure_aware === undefined ? defaults.prefer_structure_aware : Boolean(input.prefer_structure_aware),
    allow_workspace_wide_edits: input.allow_workspace_wide_edits === undefined ? defaults.allow_workspace_wide_edits : Boolean(input.allow_workspace_wide_edits),
    benchmark_feedback: benchmarkFeedback,
    task_route: taskRoute,
    notes: [],
  };

  if (benchmarkFeedback && benchmarkFeedback.risk_level === 'high') {
    policy.notes.push('Historical benchmark risk is high; keep context and edits intentionally narrow.');
  } else if (benchmarkFeedback && benchmarkFeedback.risk_level === 'medium') {
    policy.notes.push('Benchmark history is mixed; prefer local edits and validate frequently.');
  } else if (strategyBias === 'accelerated') {
    policy.notes.push('This task bucket looks stable; broader context and edits are acceptable if validation stays green.');
  }

  if (policy.context_scope === 'narrow') policy.notes.push('Prioritize only the primary targets plus the closest related tests.');
  if (policy.ast_edit_mode === 'surgical') policy.notes.push('Prefer symbol-safe or file-local AST edits; avoid wide rename fallbacks unless explicitly forced.');
  return policy;
}

/** @param {string} rootDir @param {any} [input] */
function derivePolicyInput(rootDir, input = {}) {
  const benchmarkAware = input.benchmark_aware !== false;
  const benchmarkFeedback = benchmarkAware ? assessBenchmarkFeedback(rootDir, {
    objective: input.objective,
    runtime: input.runtime,
    framework: input.framework,
    skill: input.skill,
    task_family: input.task_family,
    limit: input.benchmark_limit,
  }) : null;
  return {
    benchmark_feedback: benchmarkFeedback,
    strategy_bias: input.strategy_bias,
    context_scope: input.context_scope,
    target_budget: input.target_budget,
    related_test_budget: input.related_test_budget,
    max_failure_items: input.max_failure_items,
    ast_edit_mode: input.ast_edit_mode,
    ast_max_files: input.ast_max_files,
    ast_max_identifiers: input.ast_max_identifiers,
    prefer_structure_aware: input.prefer_structure_aware,
    allow_workspace_wide_edits: input.allow_workspace_wide_edits,
  };
}

module.exports = {
  deriveCoderPolicy,
  derivePolicyInput,
};
