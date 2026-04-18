const fs = require('fs');
const path = require('path');

/**
 * @typedef {{
 *   schema_version: number,
 *   applied_bundles: string[],
 *   enabled_bundles: string[],
 *   disabled_bundles: string[],
 *   mode_overrides: Record<string, unknown>,
 *   automation_policy_overrides: Record<string, unknown>,
 *   bootstrap: Record<string, unknown> | null,
 *   source: 'default' | 'managed',
 *   file_path: string,
 * }} EcosystemState
 */

/** @param {unknown} values @returns {string[]} */
function uniqueStrings(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];
  for (const value of values) {
    const item = String(value).trim();
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

/** @param {unknown} value @param {string} label */
function validateRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid ecosystem state: ${label}`);
  }
}

/** @param {unknown} value @param {string} label */
function validateArray(value, label) {
  if (value !== undefined && !Array.isArray(value)) {
    throw new Error(`invalid ecosystem state: ${label}`);
  }
}

/**
 * @param {string} rootDir
 * @param {Record<string, unknown>} raw
 * @param {'default' | 'managed'} source
 * @returns {EcosystemState}
 */
function normalizeState(rootDir, raw, source) {
  validateRecord(raw, 'root');

  if (raw.mode_overrides !== undefined) {
    validateRecord(raw.mode_overrides, 'mode_overrides');
  }

  if (raw.automation_policy_overrides !== undefined) {
    validateRecord(raw.automation_policy_overrides, 'automation_policy_overrides');
  }

  validateArray(raw.applied_bundles, 'applied_bundles');
  validateArray(raw.enabled_bundles, 'enabled_bundles');
  validateArray(raw.disabled_bundles, 'disabled_bundles');

  if (raw.bootstrap !== undefined && raw.bootstrap !== null) {
    validateRecord(raw.bootstrap, 'bootstrap');
  }

  const file_path = path.join(path.resolve(rootDir), '.opencode', 'ecosystem.json');
  /** @type {Record<string, unknown>} */
  const emptyRecord = {};
  const modeOverrides = raw.mode_overrides && typeof raw.mode_overrides === 'object' && !Array.isArray(raw.mode_overrides)
    ? /** @type {Record<string, unknown>} */ (raw.mode_overrides)
    : emptyRecord;
  const automationPolicyOverrides = raw.automation_policy_overrides && typeof raw.automation_policy_overrides === 'object' && !Array.isArray(raw.automation_policy_overrides)
    ? /** @type {Record<string, unknown>} */ (raw.automation_policy_overrides)
    : emptyRecord;
  const bootstrap = raw.bootstrap && typeof raw.bootstrap === 'object' && !Array.isArray(raw.bootstrap)
    ? /** @type {Record<string, unknown>} */ (raw.bootstrap)
    : null;

  return {
    schema_version: Number(raw.schema_version || 1),
    applied_bundles: uniqueStrings(raw.applied_bundles),
    enabled_bundles: uniqueStrings(raw.enabled_bundles),
    disabled_bundles: uniqueStrings(raw.disabled_bundles),
    mode_overrides: modeOverrides,
    automation_policy_overrides: automationPolicyOverrides,
    bootstrap,
    source,
    file_path,
  };
}

/** @param {string} [rootDir] @returns {EcosystemState} */
function loadEcosystemState(rootDir = process.cwd()) {
  const file_path = path.join(path.resolve(rootDir), '.opencode', 'ecosystem.json');

  if (!fs.existsSync(file_path)) {
    return normalizeState(rootDir, {}, 'default');
  }

  const raw = JSON.parse(fs.readFileSync(file_path, 'utf8'));
  return normalizeState(rootDir, raw, 'managed');
}

module.exports = {
  loadEcosystemState,
};
