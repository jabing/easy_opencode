/** @typedef {{
 *   id: string,
 *   summary: string,
 *   requires: string[],
 *   contributes: {
 *     commands: string[],
 *     hooks: string[],
 *     workspace_signals: string[],
 *     automation_policy: Record<string, unknown>,
 *   },
 * }} EcosystemBundle
 */

/** @type {EcosystemBundle[]} */
const BUILTIN_BUNDLES = [
  {
    id: 'node-service',
    summary: 'Enable Node.js service defaults for package, test, and release-aware workflows.',
    requires: [],
    contributes: {
      commands: ['implement', 'test', 'ship'],
      hooks: ['package-json-watch', 'test-defaults'],
      workspace_signals: ['package.json', 'node_modules', 'npm-lockfiles'],
      automation_policy: { verification: 'fast' },
    },
  },
  {
    id: 'release-governance',
    summary: 'Tighten release evidence and review gates for publishable repositories.',
    requires: [],
    contributes: {
      commands: ['review', 'ship'],
      hooks: ['release-evidence', 'quality-gate'],
      workspace_signals: ['release/', '.github/workflows'],
      automation_policy: { review_gate: true, verification: 'standard' },
    },
  },
  {
    id: 'lsp-refactor',
    summary: 'Prefer local LSP-backed refactor tooling when the workspace exposes editor signals.',
    requires: [],
    contributes: {
      commands: ['implement', 'review'],
      hooks: ['lsp-health'],
      workspace_signals: ['tsconfig.json', '.vscode/settings.json'],
      automation_policy: { scheduler: true },
    },
  },
  {
    id: 'mcp-devtools',
    summary: 'Enable MCP-aware local developer tool integrations when managed config is present.',
    requires: [],
    contributes: {
      commands: ['doctor', 'review'],
      hooks: ['mcp-health'],
      workspace_signals: ['.opencode/mcp.json', '.mcp.json'],
      automation_policy: { verification: 'standard' },
    },
  },
];

/** @param {EcosystemBundle} bundle @returns {EcosystemBundle} */
function cloneBundle(bundle) {
  return {
    id: bundle.id,
    summary: bundle.summary,
    requires: [...bundle.requires],
    contributes: {
      commands: [...bundle.contributes.commands],
      hooks: [...bundle.contributes.hooks],
      workspace_signals: [...bundle.contributes.workspace_signals],
      automation_policy: { ...bundle.contributes.automation_policy },
    },
  };
}

/** @returns {EcosystemBundle[]} */
function listBundles() {
  return BUILTIN_BUNDLES.map(cloneBundle);
}

/** @param {string} id @returns {EcosystemBundle | null} */
function getBundle(id) {
  const normalized = String(id || '').trim().toLowerCase();
  const bundle = BUILTIN_BUNDLES.find((item) => item.id === normalized);
  return bundle ? cloneBundle(bundle) : null;
}

module.exports = {
  getBundle,
  listBundles,
};
