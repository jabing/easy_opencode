const path = require('path');
const { buildChangeSurface, buildCodeIntelligence, summarizeTargetNeighborhood } = require('../../implementation/code-intelligence.js');
const { findRelatedTests, summarizeJsTsFile } = require('../../project-profile.js');

const NODE_FAMILY_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);

/** @param {string | null | undefined} target */
function isNodeFamilyTarget(target) {
  return NODE_FAMILY_EXTENSIONS.has(path.extname(String(target || '')).toLowerCase());
}

/** @param {{ rootDir?: string, objective?: string, targets?: string[] }} [options] */
function analyzeNodeProject({ rootDir = process.cwd(), objective = '', targets = [] } = {}) {
  const intelligence = buildCodeIntelligence(rootDir, objective, targets);
  return {
    intelligence,
    change_surface: buildChangeSurface(intelligence, targets),
  };
}

/** @param {{ rootDir?: string, target: string, analysis?: ReturnType<typeof analyzeNodeProject> | null, objective?: string, targets?: string[] }} options */
function summarizeNodeTarget({ rootDir = process.cwd(), target, analysis = null, objective = '', targets = [] }) {
  const resolvedAnalysis = analysis || analyzeNodeProject({ rootDir, objective, targets: targets.length > 0 ? targets : [target] });
  const intelligence = resolvedAnalysis.intelligence || resolvedAnalysis;
  return {
    provider_id: 'node',
    ...summarizeJsTsFile(rootDir, target, undefined),
    related_tests: findRelatedTests(rootDir, [target]),
    intelligence: summarizeTargetNeighborhood(intelligence, target),
  };
}

function createNodeProvider() {
  return {
    id: 'node',
    /** @param {{ runtime?: string } | null | undefined} profile @param {string | null} target */
    supports(profile, target) {
      if (target == null) return String(profile && profile.runtime || '').toLowerCase() === 'node';
      return isNodeFamilyTarget(target);
    },
    analyzeProject: analyzeNodeProject,
    summarizeTarget: summarizeNodeTarget,
  };
}

module.exports = {
  analyzeNodeProject,
  createNodeProvider,
  isNodeFamilyTarget,
  summarizeNodeTarget,
};
