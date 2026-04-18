const path = require('path');
const { detectProjectRuntime } = require('./runners/index.js');
const { buildProfileNotes, buildValidationGaps } = require('../rules/project-profile-rules.js');
const { getGitChangedFiles, hasGit } = require('./git.js');

/** @typedef {import('../../shared/domain.js').ProjectProfileResult} ProjectProfileResult */
/** @typedef {import('../../shared/domain.js').ValidationCommand} ValidationCommand */
/** @typedef {ProjectProfileResult & {
 *   profile_version: string,
 *   git: boolean,
 *   changed_files: string[],
 *   validation_by_kind: Record<string, string>,
 *   validation_gaps: string[],
 *   profile_notes: string[],
 * }} DetectedProjectProfile */

/** @param {ValidationCommand[] | undefined} validation */
function toValidationMap(validation) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const item of validation || []) {
    if (!item || !item.kind || !item.command) continue;
    out[item.kind] = item.command;
  }
  return out;
}

/** @param {string} root @returns {DetectedProjectProfile} */
function detectProjectProfile(root) {
  /** @type {ProjectProfileResult} */
  const fallback = {
    runtime: 'unknown',
    language: 'unknown',
    framework: 'unknown',
    package_manager: null,
    package_name: path.basename(root),
    validation: [],
    detected_by: null,
    confidence: 0.4,
  };
  const detected = detectProjectRuntime(root) || fallback;
  /** @type {DetectedProjectProfile} */
  const profile = {
    profile_version: '1.2',
    ...detected,
    git: hasGit(root),
    changed_files: getGitChangedFiles(root),
    validation_by_kind: {},
    validation_gaps: [],
    profile_notes: [],
  };
  profile.validation = Array.isArray(profile.validation) ? profile.validation : [];
  profile.validation_by_kind = toValidationMap(profile.validation);
  profile.validation_gaps = buildValidationGaps(profile);
  profile.profile_notes = buildProfileNotes(profile);
  profile.confidence = typeof profile.confidence === 'number' ? profile.confidence : 0.7;
  return profile;
}

module.exports = {
  detectProjectProfile,
  toValidationMap,
};
