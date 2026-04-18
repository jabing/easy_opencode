const {
  isRecord,
  assertString,
  assertNumber,
  assertBoolean,
  assertStringArray,
  assertArray,
  assertRecord,
  assertCounts,
  assertCheckEntries,
  assertIsoDateString,
} = require('./common.js');

/** @param {unknown} value */
function assertProjectProfileContract(value) {
  if (!isRecord(value)) throw new Error('project-profile output must be an object');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.runtime, 'project-profile.runtime');
  assertString(record.language, 'project-profile.language');
  assertString(record.framework, 'project-profile.framework');
  if (!(typeof record.confidence === 'string' || typeof record.confidence === 'number')) {
    throw new Error('project-profile.confidence must be a string or number');
  }
  if (!Array.isArray(record.validation)) throw new Error('project-profile.validation must be an array');
  for (const [index, item] of record.validation.entries()) {
    if (!isRecord(item)) throw new Error(`project-profile.validation[${index}] must be an object`);
    assertString(item.kind, `project-profile.validation[${index}].kind`);
    assertString(item.command, `project-profile.validation[${index}].command`);
  }
  if (record.entrypoints !== undefined) assertStringArray(record.entrypoints, 'project-profile.entrypoints');
  if (record.config_files !== undefined) assertStringArray(record.config_files, 'project-profile.config_files');
  if (record.validation_gaps !== undefined) assertStringArray(record.validation_gaps, 'project-profile.validation_gaps');
  if (record.profile_notes !== undefined) assertStringArray(record.profile_notes, 'project-profile.profile_notes');
}

/** @param {unknown} value */

function assertQualityGateContract(value) {
  if (!isRecord(value)) throw new Error('quality-gate output must be an object');
  const record = /** @type {Record<string, unknown>} */ (value);
  if (record.root !== undefined) assertString(record.root, 'quality-gate.root');
  assertString(record.gate, 'quality-gate.gate');
  assertCounts(record.counts, 'quality-gate.counts');
  assertCheckEntries(record.results, 'quality-gate.results');
}

/** @param {unknown} value */

function assertReleaseCheckContract(value) {
  if (!isRecord(value)) throw new Error('release-check output must be an object');
  const record = /** @type {Record<string, unknown>} */ (value);
  assertString(record.decision, 'release-check.decision');
  assertCounts(record.counts, 'release-check.counts');
  assertCheckEntries(record.checks, 'release-check.checks');
  if (record.policy_override !== undefined && record.policy_override !== null) {
    assertRecord(record.policy_override, 'release-check.policy_override');
    const policyOverride = /** @type {Record<string, unknown>} */ (record.policy_override);
    if (policyOverride.applied !== undefined) assertBoolean(policyOverride.applied, 'release-check.policy_override.applied');
  }
}

/** @param {unknown} value */
module.exports = {
  assertProjectProfileContract,
  assertQualityGateContract,
  assertReleaseCheckContract
};
