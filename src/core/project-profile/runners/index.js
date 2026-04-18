/** @typedef {{ id?: string, detect: (root: string) => import('../../../shared/domain.js').ProjectProfileResult | null }} ProjectProfileRunner */
const node = require('./node.js');
const python = require('./python.js');
const go = require('./go.js');
const java = require('./java.js');

/** @type {ProjectProfileRunner[]} */
const RUNNERS = [node, python, go, java];

/** @param {string} root */
function detectProjectRuntime(root) {
  for (const runner of RUNNERS) {
    const profile = runner.detect(root);
    if (profile) return profile;
  }
  return null;
}

module.exports = {
  RUNNERS,
  detectProjectRuntime,
};
