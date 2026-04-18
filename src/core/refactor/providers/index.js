const { provider: typescriptProvider } = require('./typescript.js');
const { provider: pythonProvider } = require('./python.js');
const { provider: goProvider } = require('./go.js');
const { provider: javaProvider } = require('./java.js');
const { provider: textFallbackProvider } = require('./text-fallback.js');

const REGISTERED_REFACTOR_PROVIDERS = [
  typescriptProvider,
  pythonProvider,
  goProvider,
  javaProvider,
  textFallbackProvider,
];

function listRegisteredRefactorProviders() {
  return REGISTERED_REFACTOR_PROVIDERS.slice();
}

module.exports = {
  REGISTERED_REFACTOR_PROVIDERS,
  listRegisteredRefactorProviders,
};
