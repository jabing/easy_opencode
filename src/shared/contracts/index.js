const runtime = require('./runtime.js');
const core = require('./core.js');
const governance = require('./governance.js');
const internal = require('./internal.js');
const registry = require('./registry.js');

module.exports = {
  ...runtime,
  ...core,
  ...governance,
  ...internal,
  ...registry,
};
