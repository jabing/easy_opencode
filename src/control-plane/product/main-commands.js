const { getMode } = require('./modes.js');
const { buildAutomationPolicy } = require('../../core/automation/default-pipeline.js');

/** @typedef {'plan' | 'implement' | 'test' | 'review' | 'ship' | 'doctor'} MainCommandId */
/** @typedef {{ id: MainCommandId, description: string }} MainCommandDefinition */
/**
 * @typedef {{
 *   schema_version: number,
 *   applied_bundles: string[],
 *   enabled_bundles: string[],
 *   disabled_bundles: string[],
 *   mode_overrides: Record<string, unknown>,
 *   automation_policy_overrides: Record<string, unknown>,
 *   bootstrap: Record<string, unknown> | null,
 *   source: string,
 *   file_path: string,
 * }} MainCommandEcosystemState
 */
/** @typedef {{ recommended_bundles: string[] }} MainCommandWorkspaceProfile */
/** @typedef {{ rootDir?: string, mode?: string | null, ecosystemState?: MainCommandEcosystemState, workspaceProfile?: MainCommandWorkspaceProfile }} MainCommandOptions */

/** @type {Record<MainCommandId, MainCommandDefinition>} */
const MAIN_COMMANDS = {
  plan: { id: 'plan', description: 'Detect project shape and produce a planning-oriented profile snapshot.' },
  implement: { id: 'implement', description: 'Run the main implementation path through implement-task.' },
  test: { id: 'test', description: 'Run repository tests with the unified test runner.' },
  review: { id: 'review', description: 'Run review gate with mode-aware quality defaults.' },
  ship: { id: 'ship', description: 'Run release-readiness checks with mode-aware release policy.' },
  doctor: { id: 'doctor', description: 'Run a concise health check over build, quality, and project profile.' },
};

/** @param {string} command @param {string[]} [argv] @param {MainCommandOptions} [options] */
function buildMainCommandPlan(command, argv = [], options = {}) {
  const mode = getMode(options.rootDir || process.cwd(), options.mode || null);
  switch (String(command || '').trim()) {
    case 'plan': return { command: 'plan', mode, runs: [{ script: 'project-profile', args: ['--json', ...argv] }] };
    case 'implement': {
      const ecosystemState = options.ecosystemState || {
        schema_version: 1,
        applied_bundles: [],
        enabled_bundles: [],
        disabled_bundles: [],
        mode_overrides: {},
        automation_policy_overrides: {},
        bootstrap: null,
        source: 'default',
        file_path: '',
      };
      const workspaceProfile = options.workspaceProfile || {
        recommended_bundles: Array.from(new Set([
          ...(Array.isArray(ecosystemState.applied_bundles) ? ecosystemState.applied_bundles : []),
          ...(Array.isArray(ecosystemState.enabled_bundles) ? ecosystemState.enabled_bundles : []),
        ])),
      };
      return {
        command: 'implement',
        mode,
        automation_policy: buildAutomationPolicy({
          command: 'implement',
          mode,
          ecosystemState,
          workspaceProfile,
        }),
        runs: [{ script: 'implement-task', args: ['run', ...argv] }],
      };
    }
    case 'test': return { command: 'test', mode, runs: [{ script: 'run-tests', args: [...argv] }] };
    case 'review': {
      const args = ['report'];
      if (mode.defaults.review_with_quality_gate) args.push('--with-quality-gate', '--quality-mode', mode.defaults.quality_mode);
      if (mode.defaults.review_json) args.push('--json');
      args.push(...argv);
      return { command: 'review', mode, runs: [{ script: 'review-gate', args }] };
    }
    case 'ship': {
      const args = ['--policy', mode.defaults.release_policy];
      if (mode.id !== 'solo') args.push('--strict');
      args.push(...argv);
      return { command: 'ship', mode, runs: [{ script: 'release-check', args }] };
    }
    case 'doctor': {
      return { command: 'doctor', mode, runs: [{ script: 'build-check', args: [] }, { script: 'quality-gate', args: mode.defaults.quality_mode === 'full' ? ['--full', '--strict'] : ['--strict'] }, { script: 'project-profile', args: ['--json'] }] };
    }
    default: throw new Error(`Unknown main command: ${command}`);
  }
}

/** @returns {MainCommandDefinition[]} */
function listMainCommands() { return Object.values(MAIN_COMMANDS); }

module.exports = { MAIN_COMMANDS, buildMainCommandPlan, listMainCommands };
