const { inferVerifyCommands } = require('./feedback.js');
const { buildVerifySchema } = require('../verification/schema.js');

/**
 * @typedef {{ commands?: string[] } & Record<string, unknown>} VerifyPlan
 */

/**
 * @param {string} root
 * @param {Record<string, unknown>} [profile]
 * @param {Record<string, unknown>} [memory]
 * @param {string[]} [requested]
 * @param {Record<string, unknown>} [options]
 */
function runFeatureVerifyPlanning(root, profile = {}, memory = {}, requested = [], options = {}) {
  const verify = /** @type {VerifyPlan} */ (inferVerifyCommands(root, profile, memory, requested, options));
  const feedback = { ...verify, schema: buildVerifySchema(profile, verify) };
  return {
    commands: Array.isArray(verify.commands) ? verify.commands : [],
    feedback,
    schema: feedback.schema,
  };
}

module.exports = {
  runFeatureVerifyPlanning,
};
