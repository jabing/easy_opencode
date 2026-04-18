const fs = require('fs');
const path = require('path');
const { CORE_INSTRUCTION_SKILLS, EXCLUDED_COMMAND_DOCS } = require('./product-scope.js');

/**
 * @typedef {{ subtask?: boolean, agent?: string } & Record<string, string | boolean | undefined>} CommandMeta
 * @typedef {{ description: string, template: string, agent: string, subtask: boolean }} BuiltCommand
 * @typedef {{ description: string, mode?: string, hidden?: boolean, prompt: string, tools: { read: boolean, write: boolean, edit: boolean, bash: boolean } }} BuiltAgent
 */

/** @type {Record<string, string>} */
const AGENT_ALIASES = {
  build: 'eoc_orchestrator',
  planner: 'eoc_planner',
  'code-reviewer': 'eoc_code_reviewer',
  orchestrator: 'eoc_orchestrator',
};

/** @param {string} assetPrefix @param {string} promptName */
function getPromptPath(assetPrefix, promptName) {
  return `{file:${assetPrefix}/prompts/agents/${promptName}}`;
}

/** @param {string} filePath @param {string} fallback */
function readTitle(filePath, fallback) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstHeading = content.split(/\r?\n/).find(/** @param {string} line */ (line) => line.trim().startsWith('# '));
    return firstHeading ? firstHeading.replace(/^#\s+/, '').trim() : fallback;
  } catch {
    return fallback;
  }
}

/** @param {string} filePath @returns {CommandMeta} */
function readCommandMeta(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const m = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
    if (!m || !m[1]) return {};
    /** @type {CommandMeta} */
    const out = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([a-zA-Z0-9_.-]+)\s*:\s*(.+)\s*$/);
      if (!kv || !kv[1] || !kv[2]) continue;
      const key = kv[1];
      const raw = kv[2].replace(/^["']|["']$/g, '').trim();
      if (key === 'subtask') out.subtask = raw === 'true';
      else out[key] = raw;
    }
    return out;
  } catch {
    return {};
  }
}

/** @param {string | undefined} name */
function normalizeAgentName(name) {
  if (!name) return name;
  return AGENT_ALIASES[name] || name;
}

/** @param {string} assetPrefix @returns {Record<string, BuiltAgent>} */
function buildAgents(assetPrefix) {
  return {
    eoc_orchestrator: { description: 'EOC default execution orchestrator', mode: 'primary', prompt: getPromptPath(assetPrefix, 'eoc-orchestrator.md'), tools: { write: true, edit: true, bash: true, read: true } },
    eoc_planner: { description: 'EOC planning specialist', hidden: true, prompt: getPromptPath(assetPrefix, 'planner.md'), tools: { read: true, bash: true, write: false, edit: false } },
    eoc_code_reviewer: { description: 'EOC code review specialist', mode: 'primary', prompt: getPromptPath(assetPrefix, 'code-reviewer.md'), tools: { read: true, bash: true, write: false, edit: false } },
    'tdd-guide': { description: 'TDD specialist', hidden: true, prompt: getPromptPath(assetPrefix, 'tdd-guide.md'), tools: { read: true, write: true, edit: true, bash: true } },
    'security-reviewer': { description: 'Security review specialist', hidden: true, prompt: getPromptPath(assetPrefix, 'security-reviewer.md'), tools: { read: true, bash: true, write: false, edit: false } },
    'build-error-resolver': { description: 'Build and type error fixer', hidden: true, prompt: getPromptPath(assetPrefix, 'build-error-resolver.md'), tools: { read: true, write: true, edit: true, bash: true } },
    'e2e-runner': { description: 'Playwright E2E specialist', hidden: true, prompt: getPromptPath(assetPrefix, 'e2e-runner.md'), tools: { read: true, write: true, edit: true, bash: true } },
    'refactor-cleaner': { description: 'Refactoring and cleanup specialist', hidden: true, prompt: getPromptPath(assetPrefix, 'refactor-cleaner.md'), tools: { read: true, write: true, edit: true, bash: true } },
    'doc-updater': { description: 'Documentation updater', hidden: true, prompt: getPromptPath(assetPrefix, 'doc-updater.md'), tools: { read: true, write: true, edit: true, bash: true } },
    'go-reviewer': { description: 'Go code review specialist', hidden: true, prompt: getPromptPath(assetPrefix, 'go-reviewer.md'), tools: { read: true, bash: true, write: false, edit: false } },
    'go-build-resolver': { description: 'Go build error specialist', hidden: true, prompt: getPromptPath(assetPrefix, 'go-build-resolver.md'), tools: { read: true, write: true, edit: true, bash: true } },
    'database-reviewer': { description: 'Database schema and SQL specialist', hidden: true, prompt: getPromptPath(assetPrefix, 'database-reviewer.md'), tools: { read: true, bash: true, write: false, edit: false } },
    architect: { description: 'Architecture and scalability specialist', hidden: true, prompt: getPromptPath(assetPrefix, 'architect.md'), tools: { read: true, bash: true, write: false, edit: false } },
    'python-reviewer': { description: 'Python code review specialist', hidden: true, prompt: getPromptPath(assetPrefix, 'python-reviewer.md'), tools: { read: true, bash: true, write: false, edit: false } },
    'repo-aware-coder': { description: 'Repo-aware implementation specialist', hidden: true, prompt: getPromptPath(assetPrefix, 'repo-aware-coder.md'), tools: { read: true, write: true, edit: true, bash: true } },
    'ts-coder': { description: 'TypeScript and JavaScript implementation specialist', hidden: true, prompt: getPromptPath(assetPrefix, 'coder-ts.md'), tools: { read: true, write: true, edit: true, bash: true } },
  };
}

/** @param {string} commandsDir @param {string} assetPrefix @returns {Record<string, BuiltCommand>} */
function buildCommandConfig(commandsDir, assetPrefix) {
  /** @type {Record<string, string>} */
  const agentByCommand = {
    plan: 'eoc_planner', orchestrate: 'eoc_planner', tdd: 'tdd-guide', 'go-test': 'tdd-guide', 'test-coverage': 'tdd-guide',
    'code-review': 'eoc_code_reviewer', 'python-review': 'python-reviewer', security: 'security-reviewer', 'build-fix': 'build-error-resolver',
    e2e: 'e2e-runner', 'refactor-clean': 'refactor-cleaner', 'update-docs': 'doc-updater', 'update-codemaps': 'doc-updater',
    'go-review': 'go-reviewer', 'go-build': 'go-build-resolver', 'openspec-proposal': 'eoc_planner', 'openspec-apply': 'tdd-guide',
    'openspec-archive': 'doc-updater', 'tooling-parity': 'eoc_planner', 'eoc-start': 'eoc_orchestrator', 'eoc-parallel': 'eoc_orchestrator',
    'eoc-metrics': 'eoc_orchestrator', 'eoc-bridge': 'eoc_orchestrator', 'eoc-ultrawork': 'eoc_orchestrator', 'hashline-edit': 'eoc_orchestrator',
    'ast-rewrite': 'refactor-cleaner', 'coder-context': 'repo-aware-coder', 'coder-loop': 'ts-coder', 'skill-registry': 'eoc_planner',
    'skill-runner': 'eoc_orchestrator', 'implement-task': 'eoc_orchestrator', 'safe-apply': 'eoc_orchestrator', 'benchmark-suite': 'eoc_orchestrator',
    'observability-report': 'eoc_orchestrator', 'review-gate': 'eoc_code_reviewer', 'project-profile': 'repo-aware-coder',
  };
  const excluded = new Set(EXCLUDED_COMMAND_DOCS.map((name) => `${name}.md`));
  const commandFiles = fs.readdirSync(commandsDir, { withFileTypes: true })
    .filter(/** @param {import('fs').Dirent} entry */ (entry) => entry.isFile() && entry.name.endsWith('.md') && !excluded.has(entry.name))
    .map(/** @param {import('fs').Dirent} entry */ (entry) => entry.name)
    .sort(/** @param {string} a @param {string} b */ (a, b) => a.localeCompare(b));
  /** @type {Record<string, BuiltCommand>} */
  const result = {};
  const fallbackAgent = 'eoc_orchestrator';
  const knownAgents = new Set(Object.keys(buildAgents(assetPrefix)));
  for (const fileName of commandFiles) {
    const name = fileName.replace(/\.md$/, '');
    const meta = readCommandMeta(path.join(commandsDir, fileName));
    const metaAgent = typeof meta.agent === 'string' ? meta.agent : undefined;
    const preferredAgent = normalizeAgentName(metaAgent) || agentByCommand[name] || fallbackAgent;
    result[name] = {
      description: readTitle(path.join(commandsDir, fileName), name),
      template: `{file:${assetPrefix}/commands/${fileName}}\n\n$ARGUMENTS`,
      agent: knownAgents.has(preferredAgent) ? preferredAgent : fallbackAgent,
      subtask: typeof meta.subtask === 'boolean' ? meta.subtask : true,
    };
  }
  return result;
}

/** @param {string} assetPrefix @param {string} commandsDir */
function buildEocConfig(assetPrefix, commandsDir) {
  const instructions = [
    `${assetPrefix}/AGENTS.md`,
    `${assetPrefix}/.opencode/instructions/INSTRUCTIONS.md`,
    ...CORE_INSTRUCTION_SKILLS.map((skill) => `${assetPrefix}/skills/${skill}/SKILL.md`),
  ];
  return {
    $schema: 'https://opencode.ai/config.json',
    default_agent: 'eoc_orchestrator',
    instructions,
    plugin: [`${assetPrefix}/.opencode/plugins`],
    agent: buildAgents(assetPrefix),
    command: buildCommandConfig(commandsDir, assetPrefix),
  };
}

module.exports = { AGENT_ALIASES, normalizeAgentName, buildAgents, buildCommandConfig, buildEocConfig, readCommandMeta };
