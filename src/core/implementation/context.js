const fs = require('fs');
const path = require('path');
/** @type {any | null} */
let ts = null;
try {
  ts = require('typescript');
} catch {
  ts = null;
}

const {
  detectProjectProfile,
  findRelatedTests,
  normalizeTarget,
  splitCsv,
  summarizeJsTsFile,
  unique,
} = require('../project-profile.js');
const { buildCodeIntelligence, buildChangeSurface, summarizeTargetNeighborhood } = require('./code-intelligence.js');
const { chooseEditStrategy } = require('./edit-engine.js');
const { recommendTaskRoute } = require('./task-routing.js');
const { readOrInferProjectMemory } = require('../project/memory.js');
const { buildSemanticIndex, summarizeSemanticNeighborhood } = require('./semantic-index.js');

/** @param {string} root @returns {any[]} */
function readLatestLoopFailures(root) {
  const latest = path.join(root, '.opencode', 'coder-loop', 'latest.json');
  if (!fs.existsSync(latest)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(latest, 'utf8'));
    return Array.isArray(data.latest_failures) ? data.latest_failures.slice(0, 20) : [];
  } catch {
    return [];
  }
}

/** @param {string} root @param {string | string[] | null | undefined} targets @returns {string[]} */
function ensureExistingTargets(root, targets) {
  const normalized = unique(splitCsv(targets).map((item) => normalizeTarget(root, item)));
  if (normalized.length > 0) return normalized;

  /** @type {string[]} */
  const fallback = [];
  const candidates = [
    'src/index.ts',
    'src/index.tsx',
    'src/index.js',
    'src/main.ts',
    'src/main.tsx',
    'src/main.js',
    'index.ts',
    'index.js',
  ];
  for (const rel of candidates) {
    if (fs.existsSync(path.join(root, rel))) fallback.push(rel);
    if (fallback.length >= 3) break;
  }
  return fallback;
}

/**
 * @typedef {{ target_budget?: number, related_test_budget?: number, strategy_bias?: string, context_scope?: string, ast_edit_mode?: string }} ContextPolicy
 */

/**
 * @param {{ rootDir?: string, objective?: string, targets?: string[] | string, mode?: string, policy?: ContextPolicy | null }} [options]
 */
function buildImplementationContext({ rootDir = process.cwd(), objective = '', targets = [], mode = 'auto', policy = null } = {}) {
  const root = path.resolve(rootDir);
  const profile = detectProjectProfile(root);
  /** @type {ContextPolicy | null} */
  const effectivePolicy = policy && typeof policy === 'object' ? policy : null;
  const initialTargets = ensureExistingTargets(root, targets);
  const intelligence = buildCodeIntelligence(root, objective, initialTargets);
  const requestedTargets = initialTargets.length > 0 ? initialTargets : intelligence.inferred_targets;
  /** @type {any} */
  const projectMemory = readOrInferProjectMemory(root, profile, null, { persist: true });
  const semanticIndex = buildSemanticIndex(root, requestedTargets);
  const inferredRoute = recommendTaskRoute({
    objective,
    profile,
    targets: requestedTargets,
    latestFailures: readLatestLoopFailures(root),
    benchmarkFeedback: projectMemory && projectMemory.benchmark_feedback ? projectMemory.benchmark_feedback : null,
  });
  const targetBudget = effectivePolicy ? Math.max(1, Number(effectivePolicy.target_budget || requestedTargets.length || 1)) : requestedTargets.length;
  const normalizedTargets = requestedTargets.slice(0, targetBudget);
  const omittedTargets = requestedTargets.slice(targetBudget);
  const discoveredRelatedTests = findRelatedTests(root, normalizedTargets);
  const relatedTestBudget = effectivePolicy ? Math.max(1, Number(effectivePolicy.related_test_budget || discoveredRelatedTests.length || 1)) : discoveredRelatedTests.length;
  const relatedTests = discoveredRelatedTests.slice(0, relatedTestBudget);
  const omittedRelatedTests = discoveredRelatedTests.slice(relatedTestBudget);
  const changeSurface = buildChangeSurface(intelligence, normalizedTargets);
  const editStrategy = chooseEditStrategy({
    objective,
    taskKind: inferredRoute.task_kind,
    changeSurface,
    policy: effectivePolicy || {},
    latestFailures: readLatestLoopFailures(root),
  });
  const targetSummaries = normalizedTargets.map((target) => ({
    ...summarizeJsTsFile(root, target, ts),
    related_tests: relatedTests.filter((testFile) => {
      const base = path.basename(target).replace(/\.[A-Za-z0-9]+$/, '');
      return testFile.includes(base) || path.dirname(testFile) === path.dirname(target);
    }),
    intelligence: summarizeTargetNeighborhood(intelligence, target),
    semantic: summarizeSemanticNeighborhood(semanticIndex, target),
  }));

  const styleContract = projectMemory && projectMemory.style_profile ? {
    controller_pattern: projectMemory.style_profile.controller_pattern || null,
    async_style: projectMemory.style_profile.async_style || null,
    test_style: projectMemory.style_profile.test_style || null,
    validation_style: projectMemory.style_profile.validation_style || null,
    preferred_test_runner: projectMemory.preferred_test_runner_profile || null,
  } : null;

  /** @type {string[]} */
  const hints = [];
  if (profile.language === 'typescript') hints.push('Prefer symbol-safe edits and keep types explicit.');
  if (effectivePolicy && effectivePolicy.strategy_bias) hints.push(`Coder policy bias: ${effectivePolicy.strategy_bias}.`);
  if (relatedTests.length > 0) hints.push('Update or extend related tests before widening implementation scope.');
  if (profile.framework && profile.framework !== profile.runtime && profile.framework !== 'unknown') hints.push(`Follow ${profile.framework}-specific structure and conventions before adding files.`);
  if (profile.test_runner) hints.push(`Prefer ${profile.test_runner} when adding or updating tests.`);
  if (profile.typecheck_tool) hints.push(`Use ${profile.typecheck_tool} as the primary compile/type signal.`);
  if (profile.repo_shape === 'workspace') hints.push('Scope edits carefully: this repository looks like a workspace/monorepo.');
  if (profile.changed_files.length > 0) hints.push('Check uncommitted changes before widening file scope.');
  if (profile.validation.length === 0) hints.push('No validation commands were auto-detected; add explicit build/test/lint scripts.');
  if (Array.isArray(profile.validation_gaps) && profile.validation_gaps.length > 0) hints.push(`Validation gaps detected: ${profile.validation_gaps.join(', ')}.`);
  if (effectivePolicy && effectivePolicy.context_scope === 'narrow') hints.push('Narrow context policy is active: avoid pulling in distant neighbors unless failures force it.');
  if (effectivePolicy && effectivePolicy.ast_edit_mode) hints.push(`Preferred AST edit mode: ${effectivePolicy.ast_edit_mode}.`);

  return {
    schema_version: '1.1',
    generated_at: new Date().toISOString(),
    objective: String(objective || '').trim(),
    mode,
    profile,
    context_policy: effectivePolicy || null,
    semantic_index: {
      entrypoints: semanticIndex.entrypoints,
      files_indexed: semanticIndex.files_indexed,
      targets: normalizedTargets.map((target) => summarizeSemanticNeighborhood(semanticIndex, target)).filter(Boolean),
    },
    task_route: inferredRoute,
    edit_strategy: editStrategy,
    context_buckets: {
      primary_symbols: changeSurface.primary_symbols,
      direct_neighbors: changeSurface.direct_neighbors,
      test_neighbors: changeSurface.test_neighbors,
      high_risk_neighbors: changeSurface.high_risk_neighbors,
      candidate_edit_files: changeSurface.candidate_edit_files,
    },
    style_contract: styleContract,
    change_surface: changeSurface,
    targets: targetSummaries,
    omitted_targets: omittedTargets,
    related_tests: relatedTests,
    omitted_related_tests: omittedRelatedTests,
    latest_failures: readLatestLoopFailures(root),
    implementation_hints: hints,
  };
}

module.exports = {
  buildImplementationContext,
};
