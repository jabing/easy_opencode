const fs = require('fs');
const path = require('path');
const { MAIN_COMMANDS } = require('../control-plane/product/main-commands.js');
const { hasNamedContract } = require('../shared/contracts.js');
const { isRecommendedScript } = require('../shared/capability-policy.js');

/**
 * @typedef {{
 *   tier: string,
 *   surface: string,
 *   lifecycle?: string,
 *   compatibility?: string,
 *   summary: string,
 *   supports_json: boolean,
 *   recommended?: boolean,
 *   contract_name?: string,
 *   json_contracts?: string[],
 *   replacement?: string,
 * }} ScriptMetadata
 */

/** @type {Record<string, ScriptMetadata>} */
const PUBLIC_METADATA = {
  'project-profile': { tier: 'core', surface: 'public', lifecycle: 'active', compatibility: 'stable', summary: 'Analyze project structure and produce a profile snapshot.', supports_json: true, contract_name: 'project-profile' },
  'quality-gate': { tier: 'core', surface: 'public', lifecycle: 'active', compatibility: 'stable', summary: 'Run repository quality and delivery checks.', supports_json: true, contract_name: 'quality-gate' },
  'release-check': { tier: 'core', surface: 'public', lifecycle: 'active', compatibility: 'stable', summary: 'Evaluate release readiness against a selected policy.', supports_json: true, contract_name: 'release-check' },
  'release-rehearsal': { tier: 'governance', surface: 'public', lifecycle: 'active', compatibility: 'stable', summary: 'Simulate a governed release workflow with structured output.', supports_json: true, contract_name: 'release-rehearsal' },
  'release-evidence': { tier: 'governance', surface: 'public', lifecycle: 'active', compatibility: 'stable', summary: 'Export release evidence and audit material.', supports_json: true, contract_name: 'release-evidence' },
  'test-stability': { tier: 'governance', surface: 'public', lifecycle: 'stable', compatibility: 'stable', summary: 'Summarize flakiness and test-stability posture.', supports_json: true, contract_name: 'test-stability' },
  'observability-report': { tier: 'governance', surface: 'public', lifecycle: 'stable', compatibility: 'stable', summary: 'Produce benchmark and observability summaries.', supports_json: true, contract_name: 'observability-report' },
  'platform-report': { tier: 'governance', surface: 'public', lifecycle: 'stable', compatibility: 'stable', summary: 'Export platform-level release and telemetry reports.', supports_json: true, contract_name: 'platform-report' },
  'feature-acceptance': { tier: 'governance', surface: 'public', lifecycle: 'stable', compatibility: 'stable', summary: 'Summarize feature acceptance evidence.', supports_json: true, contract_name: 'feature-acceptance' },
  'preflight-production': { tier: 'governance', surface: 'public', lifecycle: 'stable', compatibility: 'stable', summary: 'Run production-focused preflight checks.', supports_json: true, contract_name: 'preflight-production' },
  'run-tests': { tier: 'core', surface: 'public', lifecycle: 'stable', compatibility: 'stable', summary: 'Run repository tests through the unified test runner.', supports_json: false },
  'detect-project-runtime': { tier: 'core', surface: 'public', lifecycle: 'stable', compatibility: 'stable', summary: 'Detect repository runtime and framework signals.', supports_json: true, contract_name: 'detect-project-runtime' },
  'implement-task': { tier: 'core', surface: 'public', lifecycle: 'stable', compatibility: 'stable', summary: 'Run the main implementation workflow.', supports_json: false },
  'review-gate': { tier: 'governance', surface: 'public', lifecycle: 'stable', compatibility: 'stable', summary: 'Run review gate and optional quality checks.', supports_json: true, contract_name: 'review-gate' },
  'failure-strategy': { tier: 'governance', surface: 'public', lifecycle: 'stable', compatibility: 'stable', summary: 'Inspect routing and failure-strategy posture.', supports_json: true, contract_name: 'failure-strategy' },
  'delivery-report': { tier: 'governance', surface: 'public', lifecycle: 'stable', compatibility: 'stable', summary: 'Summarize delivery posture and recommendation level.', supports_json: true, contract_name: 'delivery-report' },
  'internal-tools': { tier: 'internal', surface: 'internal', lifecycle: 'stable', compatibility: 'internal', summary: 'Unified internal maintenance entrypoint for internal utility domains.', supports_json: false },
  'analyze-project-structure': { tier: 'internal', surface: 'internal', lifecycle: 'deprecated', compatibility: 'compatibility', replacement: 'internal-tools', summary: 'Legacy wrapper for project structure analysis.', supports_json: true, contract_name: 'analyze-project-structure' },
  'prepare-implementation-context': { tier: 'internal', surface: 'internal', lifecycle: 'deprecated', compatibility: 'compatibility', replacement: 'internal-tools', summary: 'Legacy wrapper for implementation context preparation.', supports_json: true, contract_name: 'implementation-context' },
  'enrich-implementation-context': { tier: 'internal', surface: 'internal', lifecycle: 'deprecated', compatibility: 'compatibility', replacement: 'internal-tools', summary: 'Legacy wrapper for implementation context enrichment.', supports_json: true, contract_name: 'implementation-context-envelope' },
  'sync-project-memory': { tier: 'internal', surface: 'internal', lifecycle: 'deprecated', compatibility: 'compatibility', replacement: 'internal-tools', summary: 'Legacy wrapper for project memory synchronization.', supports_json: true, contract_name: 'project-memory-sync' },
  'debug-fix-loop': { tier: 'internal', surface: 'internal', lifecycle: 'deprecated', compatibility: 'compatibility', replacement: 'internal-tools', summary: 'Legacy wrapper for debug-fix workflow.', supports_json: true, contract_name: 'debug-fix-loop' },
  'command-registry': { tier: 'internal', surface: 'internal', lifecycle: 'stable', compatibility: 'internal', summary: 'Inspect command registry and compatibility metadata.', supports_json: true, contract_name: 'command-registry' },
  'model-route': { tier: 'internal', surface: 'internal', lifecycle: 'deprecated', compatibility: 'compatibility', replacement: 'internal-tools', summary: 'Legacy wrapper for internal routing views.', supports_json: true, json_contracts: ['model-route-view', 'model-route-plan'] },
  'benchmark-feedback': { tier: 'internal', surface: 'internal', lifecycle: 'deprecated', compatibility: 'compatibility', replacement: 'internal-tools', summary: 'Legacy wrapper for benchmark feedback reporting.', supports_json: true, contract_name: 'benchmark-feedback' },
  'orchestrator-state': { tier: 'internal', surface: 'internal', lifecycle: 'deprecated', compatibility: 'compatibility', replacement: 'internal-tools', summary: 'Legacy wrapper for orchestrator state operations.', supports_json: true, contract_name: 'orchestrator-state' },
  'release-override': { tier: 'internal', surface: 'internal', lifecycle: 'deprecated', compatibility: 'compatibility', replacement: 'internal-tools', summary: 'Legacy wrapper for release override operations.', supports_json: true, contract_name: 'release-override' },
  'safe-apply': { tier: 'internal', surface: 'internal', lifecycle: 'deprecated', compatibility: 'compatibility', replacement: 'internal-tools', summary: 'Legacy wrapper for guarded apply and snapshot state.', supports_json: true, contract_name: 'safe-apply' },
  'historical-debt-audit': { tier: 'internal', surface: 'internal', lifecycle: 'stable', compatibility: 'internal', summary: 'Audit deletion candidates and internal-tools merge domains.', supports_json: true, contract_name: 'historical-debt-audit' },
  'capability-registry': { tier: 'internal', surface: 'internal', lifecycle: 'deprecated', compatibility: 'compatibility', replacement: 'internal-tools', summary: 'Legacy wrapper for capability registry inspection.', supports_json: true, contract_name: 'capability-registry' },
  'skill-runner': { tier: 'internal', surface: 'internal', lifecycle: 'deprecated', compatibility: 'compatibility', replacement: 'internal-tools', summary: 'Legacy wrapper for skill inspection and scaffolding.', supports_json: true, json_contracts: ['skill-runner-list', 'skill-runner-show', 'skill-runner-match', 'skill-runner-capabilities', 'scaffold-output'] },
};

const DEPRECATION_POLICY = {
  lifecycle_values: ['active', 'stable', 'deprecated'],
  compatibility_values: ['stable', 'compatibility', 'internal'],
};

// P0 keeps low-level orchestration and future ecosystem/bootstrap flows off the public surface
// until dedicated implementations exist.
const EXPERIMENTAL_SCRIPTS = new Set(['claw', 'eoc-ultrawork', 'eoc-bridge', 'eoc-start', 'eoc-scheduler']);
const INTERNAL_PREFIXES = ['npm-', 'loop-', 'sync-', 'setup-', 'install', 'uninstall'];

/** @param {string} rootDir @returns {{ scripts?: Record<string, string> }} */
function readPackageJson(rootDir) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
}

/** @param {string} rootDir @returns {string[]} */
function listManagedScripts(rootDir) {
  const scriptsDir = path.join(rootDir, 'scripts');
  return fs.readdirSync(scriptsDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => name.replace(/\.js$/i, ''))
    .sort();
}

/** @param {string} command @returns {string | null} */
function extractScriptFromPackageScript(command) {
  const match = String(command || '').match(/node\s+scripts\/([A-Za-z0-9_-]+)\.js\b/);
  return match && typeof match[1] === 'string' ? match[1] : null;
}

/** @param {string} scriptName @returns {ScriptMetadata} */
function classifyScript(scriptName) {
  if (PUBLIC_METADATA[scriptName]) return { ...PUBLIC_METADATA[scriptName] };
  if (EXPERIMENTAL_SCRIPTS.has(scriptName)) return { tier: 'internal', surface: 'experimental', lifecycle: 'deprecated', compatibility: 'internal', replacement: 'eoc', summary: 'Experimental command surface.', supports_json: false };
  if (INTERNAL_PREFIXES.some((prefix) => scriptName.startsWith(prefix))) return { tier: 'internal', surface: 'internal', lifecycle: 'stable', compatibility: 'internal', summary: 'Maintenance or installation command.', supports_json: false };
  return { tier: 'internal', surface: 'internal', lifecycle: 'stable', compatibility: 'internal', summary: 'Managed internal command.', supports_json: false };
}

/** @param {string} rootDir @returns {Map<string, string[]>} */
function buildPackageAliasMap(rootDir) {
  const pkg = readPackageJson(rootDir);
  const aliases = new Map();
  for (const [alias, value] of Object.entries(pkg.scripts || {})) {
    const script = extractScriptFromPackageScript(value);
    if (!script) continue;
    if (!aliases.has(script)) aliases.set(script, []);
    aliases.get(script).push(alias);
  }
  return aliases;
}

/** @param {string} [rootDir] */
function buildCommandRegistry(rootDir = process.cwd()) {
  const aliases = buildPackageAliasMap(rootDir);
  const mainCommands = new Set(Object.keys(MAIN_COMMANDS));
  return listManagedScripts(rootDir).map((script) => {
    const meta = classifyScript(script);
    const scriptAliases = aliases.get(script) || [];
    const supportsJsonByAlias = scriptAliases.some((item) => item.endsWith(':json'));
    const supportsJson = meta.surface === 'public' ? (meta.supports_json || supportsJsonByAlias) : Boolean(meta.supports_json);
    return {
      id: `script:${script}`,
      script,
      tier: meta.tier,
      surface: meta.surface,
      summary: meta.summary,
      lifecycle: meta.lifecycle || 'stable',
      compatibility: meta.compatibility || (meta.surface === 'public' ? 'stable' : 'internal'),
      replacement: meta.replacement || null,
      recommended: Boolean(meta.recommended || isRecommendedScript(script)),
      contract_name: meta.contract_name || null,
      json_contracts: Array.isArray(meta.json_contracts) ? meta.json_contracts.slice().sort() : null,
      aliases: scriptAliases.slice().sort(),
      supports_json: Boolean(supportsJson),
      is_main_plan_target: mainCommands.has(script),
    };
  });
}

function buildMainEntryRegistry() {
  return Object.values(MAIN_COMMANDS).map((item) => ({
    id: `main:${item.id}`,
    command: item.id,
    tier: 'main',
    surface: 'public',
    summary: item.description,
  }));
}

/** @param {string} [rootDir] */
function validateCommandRegistry(rootDir = process.cwd()) {
  const entries = buildCommandRegistry(rootDir);
  const errors = [];
  const scripts = new Set(entries.map((item) => item.script));
  const seenIds = new Set();
  for (const entry of entries) {
    if (seenIds.has(entry.id)) errors.push(`duplicate registry id: ${entry.id}`);
    seenIds.add(entry.id);
    if (!['core', 'governance', 'internal'].includes(entry.tier)) errors.push(`invalid tier for ${entry.script}: ${entry.tier}`);
    if (!['public', 'internal', 'experimental'].includes(entry.surface)) errors.push(`invalid surface for ${entry.script}: ${entry.surface}`);
    if (!DEPRECATION_POLICY.lifecycle_values.includes(entry.lifecycle)) errors.push(`invalid lifecycle for ${entry.script}: ${entry.lifecycle}`);
    if (!DEPRECATION_POLICY.compatibility_values.includes(entry.compatibility)) errors.push(`invalid compatibility for ${entry.script}: ${entry.compatibility}`);
    if (entry.lifecycle === 'deprecated' && !entry.replacement) errors.push(`deprecated command ${entry.script} must declare replacement`);
    if (entry.supports_json && !entry.contract_name && !(Array.isArray(entry.json_contracts) && entry.json_contracts.length > 0)) errors.push(`JSON command ${entry.script} must declare contract_name or json_contracts`);
    if (entry.contract_name && !hasNamedContract(entry.contract_name)) errors.push(`unknown contract for ${entry.script}: ${entry.contract_name}`);
    if (Array.isArray(entry.json_contracts)) {
      for (const contractName of entry.json_contracts) {
        if (!hasNamedContract(contractName)) errors.push(`unknown contract for ${entry.script}: ${contractName}`);
      }
    }
  }
  for (const definition of Object.values(MAIN_COMMANDS)) {
    let planScript = null;
    switch (definition.id) {
      case 'plan': planScript = 'project-profile'; break;
      case 'implement': planScript = 'implement-task'; break;
      case 'test': planScript = 'run-tests'; break;
      case 'review': planScript = 'review-gate'; break;
      case 'ship': planScript = 'release-check'; break;
      case 'doctor': planScript = 'build-check'; break;
      default: planScript = null;
    }
    if (planScript && !scripts.has(planScript)) errors.push(`main command ${definition.id} targets missing script: ${planScript}`);
  }
  const pkg = readPackageJson(rootDir);
  for (const [alias, command] of Object.entries(pkg.scripts || {})) {
    const script = extractScriptFromPackageScript(command);
    if (script && !scripts.has(script)) errors.push(`package script ${alias} points to missing managed script: ${script}`);
  }
  return { ok: errors.length === 0, entries, errors, main_entries: buildMainEntryRegistry() };
}

module.exports = {
  PUBLIC_METADATA,
  buildCommandRegistry,
  buildMainEntryRegistry,
  buildPackageAliasMap,
  classifyScript,
  extractScriptFromPackageScript,
  listManagedScripts,
  DEPRECATION_POLICY,
  validateCommandRegistry,
};
