const fs = require('fs');
const path = require('path');
const { readAllSkills } = require('../skills/manifest.js');
const { getScriptSupportProfile } = require('../support-tiers/report.js');
const { getAgentCapabilityPolicy, getScriptCapabilityPolicy } = require('../../shared/capability-policy.js');

/**
 * @typedef {{
 *   agent?: Record<string, AgentConfig>,
 *   command?: Record<string, CommandConfig>,
 * }} OpencodeConfig
 */

/**
 * @typedef {{
 *   description?: string,
 *   hidden?: boolean,
 *   prompt?: string,
 *   mode?: string,
 *   tools?: Record<string, unknown>,
 * }} AgentConfig
 */

/**
 * @typedef {{
 *   agent?: string,
 *   template?: string,
 *   subtask?: boolean,
 * }} CommandConfig
 */

/**
 * @typedef {{
 *   dir: string,
 *   name: string,
 *   description?: string,
 *   executable?: boolean,
 *   support_tier?: string,
 *   level?: string,
 *   task_family?: string,
 *   support_scope?: Record<string, unknown>,
 *   runtimes?: string[],
 *   languages?: string[],
 *   frameworks?: string[],
 *   manifest?: Record<string, unknown>,
 *   verify?: unknown,
 *   actions?: Array<{ id?: string | null, type?: string | null }> | null,
 *   files: { skill?: string | null },
 *   triggers?: unknown,
 * }} SkillRecord
 */

/** @typedef {'general' | 'planner' | 'reviewer' | 'verifier' | 'releaser' | 'transformer' | 'implementer'} CapabilityKind */
/** @typedef {'agent' | 'skill' | 'script'} CapabilitySourceType */
/** @typedef {'agent' | 'hybrid' | 'document' | 'script'} ExecutionMode */
/** @typedef {'recommended' | 'extended' | 'internal'} CapabilitySurface */
/** @typedef {'stable' | 'beta' | 'experimental'} CapabilityMaturity */

/**
 * @typedef {{
 *   id: string,
 *   source_type: CapabilitySourceType,
 *   source_ref: string,
 *   name: string,
 *   description: string,
 *   kind: CapabilityKind,
  *   execution_mode: ExecutionMode,
 *   surface: CapabilitySurface,
 *   maturity: CapabilityMaturity,
 *   recommended: boolean,
 *   support_tier?: string,
 *   hidden: boolean,
 *   entrypoint: string | null,
 *   prompt_file: string | null,
 *   tools: Record<string, boolean>,
 *   aliases: string[],
 *   metadata: Record<string, unknown>,
 * }} CapabilityRecord
 */

/** @typedef {{ support_tier: string, support_scope: Record<string, unknown>, acceptance: Record<string, unknown> }} ScriptSupportProfile */

/** @param {string} filePath */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

/** @param {unknown} value */
function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return [String(value).trim()].filter(Boolean);
}

/** @param {unknown} value @param {boolean} fallback */
function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

/** @param {unknown} value @param {CapabilitySurface} fallback */
function normalizeSurface(value, fallback = 'extended') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'recommended') return 'recommended';
  if (normalized === 'extended') return 'extended';
  if (normalized === 'internal') return 'internal';
  return fallback;
}

/** @param {unknown} value @param {CapabilityMaturity} fallback */
function normalizeMaturity(value, fallback = 'experimental') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'stable') return 'stable';
  if (normalized === 'beta') return 'beta';
  if (normalized === 'experimental') return 'experimental';
  return fallback;
}

/** @param {SkillRecord} skill */
function deriveSkillMetadata(skill) {
  const manifest = skill.manifest && typeof skill.manifest === 'object' ? skill.manifest : {};
  const declaredKind = String(manifest.capability_kind || manifest.kind || '').trim().toLowerCase();
  /** @type {CapabilityKind | null} */
  let kind = null;
  if (['general', 'planner', 'reviewer', 'verifier', 'releaser', 'transformer', 'implementer'].includes(declaredKind)) {
    kind = /** @type {CapabilityKind} */ (declaredKind);
  }
  const defaultSurface = skill.support_tier === 'tier1' || skill.support_tier === 'tier2' ? 'recommended' : 'extended';
  const surface = normalizeSurface(manifest.capability_surface || manifest.surface, defaultSurface);
  const maturity = normalizeMaturity(manifest.capability_maturity || manifest.maturity, skill.support_tier === 'tier1' ? 'stable' : 'beta');
  const recommended = normalizeBoolean(manifest.recommended, surface === 'recommended');
  return { kind, surface, maturity, recommended };
}

/** @param {unknown} seed @returns {CapabilityKind} */
function inferCapabilityKind(seed) {
  const value = String(seed || '').toLowerCase();
  if (!value) return 'general';
  if (/\b(review|reviewer|audit|security|architect)\b/.test(value)) return 'reviewer';
  if (/\b(verify|verification|quality|lint|typecheck|test|gate|check|coverage|preflight|readiness)\b/.test(value)) return 'verifier';
  if (/\b(release|delivery|deploy|publish|ship)\b/.test(value)) return 'releaser';
  if (/\b(refactor|rewrite|transform|format|migrate|fix|resolver)\b/.test(value)) return 'transformer';
  if (/\b(coder|implement|implementation|scaffold|build|e2e|workflow|runner|add|create|route|endpoint|component|controller|model|service|handler|module)\b/.test(value)) return 'implementer';
  if (/\b(planner|plan|proposal|spec)\b/.test(value)) return 'planner';
  return 'general';
}

/** @param {SkillRecord} skill */
function inferSkillKind(skill) {
  const family = String(skill.task_family || '').toLowerCase();
  const seed = [skill.name, skill.dir, family, ...normalizeList(skill.triggers)].join(' ');
  return inferCapabilityKind(seed);
}

/** @param {string} scriptName */
function inferScriptKind(scriptName) {
  return inferCapabilityKind(scriptName.replace(/\.js$/i, ''));
}

/** @param {unknown} tools */
function normalizeTools(tools) {
  if (!tools || typeof tools !== 'object') return {};
  return Object.fromEntries(Object.entries(tools).map(([key, value]) => [key, Boolean(value)]));
}

/** @param {string} root @returns {OpencodeConfig} */
function loadOpencodeConfig(root) {
  return /** @type {OpencodeConfig} */ (readJson(path.join(root, 'opencode.json')) || { agent: {}, command: {} });
}

/** @param {string} root @param {string} filePath */
function relativeUnix(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

/** @param {string} root @param {OpencodeConfig} config @returns {CapabilityRecord[]} */
function collectAgentCapabilities(root, config) {
  void root;
  const agents = config.agent && typeof config.agent === 'object' ? config.agent : {};
  return Object.entries(agents).map(([agentId, agent]) => {
    const overrideMeta = getAgentCapabilityPolicy(agentId) || {};
    const overriddenKind = overrideMeta.kind || null;
    const hidden = Boolean(agent.hidden);
    const surface = normalizeSurface(overrideMeta.surface, hidden ? 'internal' : 'extended');
    const maturity = normalizeMaturity(overrideMeta.maturity, hidden ? 'beta' : 'stable');
    const recommended = normalizeBoolean(overrideMeta.recommended, surface === 'recommended');
    return ({
    id: `agent:${agentId}`,
    source_type: 'agent',
    source_ref: agentId,
    name: agentId,
    description: String(agent.description || '').trim(),
    kind: overriddenKind || inferCapabilityKind(`${agentId} ${agent.description || ''}`),
    execution_mode: 'agent',
    surface,
    maturity,
    recommended,
    hidden,
    entrypoint: String(agent.prompt || '').trim() || null,
    prompt_file: String(agent.prompt || '').startsWith('{file:')
      ? String(agent.prompt).replace(/^\{file:/, '').replace(/\}$/, '')
      : null,
    tools: normalizeTools(agent.tools),
    aliases: [],
    metadata: {
      mode: agent.mode || null,
    },
    });
  });
}

/** @param {unknown} skill @returns {skill is SkillRecord} */
function isSkillRecord(skill) {
  if (!skill || typeof skill !== 'object') return false;
  const record = /** @type {{ dir?: unknown, name?: unknown }} */ (skill);
  return typeof record.dir === 'string' && typeof record.name === 'string';
}

/** @param {string} root @returns {CapabilityRecord[]} */
function collectSkillCapabilities(root) {
  const skills = /** @type {SkillRecord[]} */ (readAllSkills(root).filter(isSkillRecord));
  return skills.map((skill) => {
    const derived = deriveSkillMetadata(skill);
    return ({
    id: `skill:${skill.dir}`,
    source_type: 'skill',
    source_ref: skill.dir,
    name: skill.name,
    description: String(skill.description || ''),
    kind: derived.kind || inferSkillKind(skill),
    execution_mode: skill.executable ? 'hybrid' : 'document',
    surface: derived.surface,
    maturity: derived.maturity,
    recommended: derived.recommended,
    support_tier: skill.support_tier || 'tier4',
    hidden: false,
    entrypoint: skill.files.skill || null,
    prompt_file: skill.files.skill || null,
    tools: {},
    aliases: skill.name !== skill.dir ? [skill.name] : [],
    metadata: {
      level: skill.level,
      executable: Boolean(skill.executable),
      task_family: skill.task_family || null,
      support_scope: skill.support_scope || { runtimes: skill.runtimes || [], languages: skill.languages || [], frameworks: skill.frameworks || [] },
      runtimes: skill.runtimes || [],
      languages: skill.languages || [],
      frameworks: skill.frameworks || [],
      verify: skill.verify,
      actions: Array.isArray(skill.actions) ? skill.actions.map((action) => ({
        id: action.id || null,
        type: action.type || null,
      })) : [],
      files: skill.files,
    },
    });
  });
}

/** @param {string} root @param {string} entryName @returns {ScriptSupportProfile} */
function inferScriptSupport(root, entryName) {
  const script = String(entryName || '').replace(/\.js$/i, '');
  const profile = /** @type {ScriptSupportProfile} */ (getScriptSupportProfile(root, script));
  return {
    support_tier: profile.support_tier || 'tier4',
    support_scope: profile.support_scope || {
      runtimes: [],
      frameworks: [],
      languages: [],
      provider_ids: [],
    },
    acceptance: profile.acceptance || {},
  };
}

/** @param {string} root @returns {CapabilityRecord[]} */
function collectScriptCapabilities(root) {
  const scriptsDir = path.join(root, 'scripts');
  if (!fs.existsSync(scriptsDir)) return [];
  return fs.readdirSync(scriptsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .filter((entry) => !['npm-install.js', 'npm-postinstall.js', 'install.js', 'uninstall.js'].includes(entry.name))
    .map((entry) => {
      const support = inferScriptSupport(root, entry.name);
      const scriptName = entry.name.replace(/\.js$/i, '');
      const meta = getScriptCapabilityPolicy(scriptName) || {};
      const surface = normalizeSurface(meta.surface, 'internal');
      const maturity = normalizeMaturity(meta.maturity, surface === 'recommended' ? 'stable' : 'beta');
      return /** @type {CapabilityRecord} */ ({
        id: `script:${scriptName}`,
        source_type: 'script',
        source_ref: entry.name,
        name: scriptName,
        description: '',
        kind: meta.kind || inferScriptKind(entry.name),
        execution_mode: 'script',
        surface,
        maturity,
        recommended: normalizeBoolean(meta.recommended, surface === 'recommended'),
        support_tier: support.support_tier,
        hidden: false,
        entrypoint: relativeUnix(root, path.join(scriptsDir, entry.name)),
        prompt_file: null,
        tools: {},
        aliases: [],
        metadata: {
          support_scope: support.support_scope,
          acceptance: support.acceptance,
        },
      });
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** @typedef {Map<string, CapabilityRecord>} CapabilityMap */

/**
 * @typedef {{
 *   id: string,
 *   interface: 'command',
 *   source_ref: string,
 *   target_id: string | null,
 *   agent: string | null,
 *   template: string | null,
 *   subtask: boolean,
 * }} CommandAlias
 */

/** @param {string} root @param {OpencodeConfig} config @param {CapabilityMap} capabilityMap @returns {CommandAlias[]} */
function createCommandAliases(root, config, capabilityMap) {
  void root;
  const commands = config.command && typeof config.command === 'object' ? config.command : {};
  const aliases = [];
  for (const [commandId, command] of Object.entries(commands)) {
    let targetId = null;
    if (command.agent && capabilityMap.has(`agent:${command.agent}`)) targetId = `agent:${command.agent}`;
    if (!targetId && capabilityMap.has(`script:${commandId}`)) targetId = `script:${commandId}`;
    aliases.push(/** @type {CommandAlias} */ ({
      id: `command:${commandId}`,
      interface: 'command',
      source_ref: commandId,
      target_id: targetId,
      agent: command.agent || null,
      template: command.template || null,
      subtask: Boolean(command.subtask),
    }));
  }
  return aliases;
}

/** @param {string} root */
function buildCapabilityRegistry(root) {
  const resolvedRoot = path.resolve(root || process.cwd());
  const config = loadOpencodeConfig(resolvedRoot);
  const capabilities = [
    ...collectAgentCapabilities(resolvedRoot, config),
    ...collectSkillCapabilities(resolvedRoot),
    ...collectScriptCapabilities(resolvedRoot),
  ].sort((a, b) => a.id.localeCompare(b.id));
  const capabilityMap = new Map(capabilities.map((cap) => [cap.id, cap]));
  const aliases = createCommandAliases(resolvedRoot, config, capabilityMap);

  for (const alias of aliases) {
    if (alias.target_id && capabilityMap.has(alias.target_id)) {
      const target = capabilityMap.get(alias.target_id);
      if (target) target.aliases.push(alias.id);
    }
  }

  /** @type {Record<string, number>} */
  const bySourceType = {};
  /** @type {Record<string, number>} */
  const byExecutionMode = {};
  /** @type {Record<string, number>} */
  const byKind = {};
  /** @type {Record<string, number>} */
  const bySupportTier = {};
  for (const capability of capabilities) {
    bySourceType[capability.source_type] = (bySourceType[capability.source_type] || 0) + 1;
    byExecutionMode[capability.execution_mode] = (byExecutionMode[capability.execution_mode] || 0) + 1;
    byKind[capability.kind] = (byKind[capability.kind] || 0) + 1;
    const supportTier = String(capability.support_tier || 'tier4');
    bySupportTier[supportTier] = (bySupportTier[supportTier] || 0) + 1;
  }

  return {
    generated_at: new Date().toISOString(),
    root_dir: '.',
    counts: {
      total: capabilities.length,
      agents: bySourceType.agent || 0,
      skills: bySourceType.skill || 0,
      scripts: bySourceType.script || 0,
      aliases: aliases.length,
      by_source_type: bySourceType,
      by_execution_mode: byExecutionMode,
      by_kind: byKind,
      by_support_tier: bySupportTier,
    },
    capabilities,
    aliases,
  };
}

/** @param {string} root @param {string | undefined} outPath */
function writeCapabilityRegistry(root, outPath) {
  const registry = buildCapabilityRegistry(root);
  const resolvedRoot = path.resolve(root || process.cwd());
  const target = path.resolve(resolvedRoot, outPath || path.join('capabilities', 'registry.json'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  return { registry, outPath: target };
}

/** @param {string} root @param {string} id */
function resolveCapability(root, id) {
  const normalized = String(id || '').trim().toLowerCase();
  if (!normalized) return null;
  const registry = buildCapabilityRegistry(root);
  return registry.capabilities.find((item) => item.id.toLowerCase() === normalized || item.name.toLowerCase() === normalized || item.source_ref.toLowerCase() === normalized) || null;
}

module.exports = {
  buildCapabilityRegistry,
  writeCapabilityRegistry,
  resolveCapability,
  inferCapabilityKind,
};
