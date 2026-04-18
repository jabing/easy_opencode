const fs = require('fs');
const path = require('path');
const { buildEocConfig } = require('../../shared/opencode-config.js');
const { readJson } = require('../../shared/json.js');
const { REQUIRED_KERNEL_PATHS } = require('../../shared/product-scope.js');

/**
 * @typedef {{ prompt?: string | null }} AgentConfig
 * @typedef {{ template?: string | null, agent?: string | null }} CommandConfig
 * @typedef {{
 *   instructions?: string[],
 *   agent?: Record<string, AgentConfig>,
 *   command?: Record<string, CommandConfig>
 * }} EocBuildConfig
 * @typedef {{ ok: boolean, missing: string[], reasons: string[] }} BuildCheckResult
 */

/** @param {string | null | undefined} template */
function extractFileReference(template) {
  const match = String(template || '').match(/^\{file:([^}]+)\}/);
  return match ? match[1] : null;
}

/** @param {string} root @param {EocBuildConfig} config */
function validateConfigReferences(root, config) {
  /** @type {string[]} */
  const reasons = [];
  const instructions = Array.isArray(config.instructions) ? config.instructions : [];
  for (const item of instructions) {
    const rel = String(item || '').replace(/^\.\//, '');
    if (rel && !fs.existsSync(path.join(root, rel))) reasons.push(`missing instruction asset: ${rel}`);
  }
  const agents = config.agent && typeof config.agent === 'object' ? config.agent : {};
  for (const [name, agent] of Object.entries(agents)) {
    const prompt = extractFileReference(agent && agent.prompt);
    const rel = prompt && prompt.replace(/^\.\//, '');
    if (rel && !fs.existsSync(path.join(root, rel))) reasons.push(`agent ${name} references missing prompt ${prompt}`);
  }
  const commands = config.command && typeof config.command === 'object' ? config.command : {};
  for (const [name, command] of Object.entries(commands)) {
    const template = extractFileReference(command && command.template);
    const rel = template && template.replace(/^\.\//, '');
    if (rel && !fs.existsSync(path.join(root, rel))) reasons.push(`command ${name} references missing template ${template}`);
  }
  return reasons;
}

/** @param {string} [root] @returns {BuildCheckResult} */
function runBuildCheck(root = process.cwd()) {
  const missing = REQUIRED_KERNEL_PATHS.filter((relPath) => !fs.existsSync(path.join(root, relPath)));
  if (missing.length > 0) return { ok: false, missing, reasons: [] };
  /** @type {string[]} */
  const reasons = [];
  const actual = /** @type {EocBuildConfig} */ (/** @type {unknown} */ (readJson(path.join(root, 'opencode.json'))));
  const expected = /** @type {EocBuildConfig} */ (/** @type {unknown} */ (buildEocConfig('.', path.join(root, 'commands'))));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) reasons.push('opencode.json is not synchronized with repository assets');
  const serialized = JSON.stringify(actual);
  if (serialized.includes('./.opencode/easy-opencode/')) reasons.push('opencode.json still contains legacy ./.opencode/easy-opencode paths');
  const agentNames = new Set(Object.keys(actual.agent || {}));
  for (const [name, command] of Object.entries(actual.command || {})) {
    if (command.agent && !agentNames.has(command.agent)) reasons.push(`command ${name} references unknown agent ${command.agent}`);
  }
  reasons.push(...validateConfigReferences(root, actual));
  return { ok: reasons.length === 0, missing: [], reasons };
}

function main() {
  const result = runBuildCheck();
  if (!result.ok) {
    process.stderr.write('[build-check] FAIL\n');
    result.missing.forEach((item) => process.stderr.write(`- missing: ${item}\n`));
    result.reasons.forEach((item) => process.stderr.write(`- ${item}\n`));
    process.exit(1);
  }
  process.stdout.write('[build-check] PASS\n');
}

module.exports = { runBuildCheck, main, extractFileReference, validateConfigReferences };
