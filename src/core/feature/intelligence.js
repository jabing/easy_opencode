const DOMAIN_STOPWORDS = new Set(['feature', 'module', 'service', 'api']);

/** @typedef {{ featureName?: string, name?: string, subject?: string, featureKind?: string, feature_kind?: string, memory?: unknown }} FeatureSemanticsInput */
/** @typedef {{ family?: string }} SemanticSummary */
/** @typedef {{ auth_strategy?: string, preferred_feature_shape?: string[] }} SemanticMemory */
/** @typedef {{ with_test?: boolean }} SemanticRequest */

/** @param {string} name */
function splitFeatureName(name) {
  return String(name || '')
    .replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

/** @param {string[]} [tokens] @param {string} [featureKind] */
function classifyFeature(tokens = [], featureKind = '') {
  const set = new Set(tokens);
  const kind = String(featureKind || '').trim().toLowerCase();
  if (set.has('auth') || set.has('login') || set.has('session') || set.has('token')) return 'auth';
  if (set.has('webhook') || set.has('callback')) return 'webhook';
  if (set.has('admin') || set.has('backoffice')) return 'admin';
  if (set.has('billing') || set.has('invoice') || set.has('payment')) return 'billing';
  if (kind === 'crud') return 'crud';
  return kind || 'general';
}

/** @param {Array<string | null | undefined>} items */
function unique(items) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

/** @param {FeatureSemanticsInput} [input] */
function inferFeatureSemantics(input = {}) {
  const featureName = String(input.featureName || input.name || input.subject || '').trim();
  const featureKind = String(input.featureKind || input.feature_kind || '').trim();
  const tokens = splitFeatureName(featureName);
  const family = classifyFeature(tokens, featureKind);
  const domainSegments = tokens.filter((token) => !DOMAIN_STOPWORDS.has(token));
  /** @type {string[]} */
  const operationHints = [];
  const authRequired = family === 'auth' || family === 'admin';
  const requiresRepository = ['auth', 'billing', 'crud'].includes(family);
  const prefersDocs = family === 'webhook' || family === 'admin' || family === 'billing';
  const prefersTests = family !== 'webhook';

  if (family === 'auth') operationHints.push('create-session', 'refresh-session', 'revoke-session');
  else if (family === 'webhook') operationHints.push('verify-signature', 'store-event', 'dispatch-handler');
  else if (family === 'admin') operationHints.push('authorize-admin', 'audit-action', 'persist-change');
  else if (family === 'billing') operationHints.push('validate-request', 'persist-record', 'emit-domain-event');
  else if (featureKind === 'crud') operationHints.push('create', 'read', 'update', 'delete');
  else operationHints.push('create');

  let namespaceSegments = unique(domainSegments.length ? domainSegments : (tokens.length ? tokens : ['feature']));
  let routeNamespace = `/${featureName || namespaceSegments.join('-') || 'feature'}`.replace(/\/+/g, '/');
  if (family === 'auth') {
    namespaceSegments = unique(['auth'].concat(domainSegments.filter((token) => token !== 'auth')));
    routeNamespace = `/${namespaceSegments.join('/')}`;
  } else if (family === 'webhook') {
    namespaceSegments = unique(['webhooks'].concat(domainSegments.filter((token) => token !== 'webhook')));
    routeNamespace = `/${namespaceSegments.join('/')}`;
  } else if (family === 'admin') {
    namespaceSegments = unique(['admin'].concat(domainSegments.filter((token) => token !== 'admin')));
    routeNamespace = `/${namespaceSegments.join('/')}`;
  }
  routeNamespace = routeNamespace.replace(/\/+/g, '/');

  const domainKey = domainSegments[0] || tokens[0] || featureName || 'feature';
  const relations = unique(domainSegments.slice(0, 2));
  return {
    feature_name: featureName,
    feature_kind: featureKind || null,
    family,
    tokens,
    domain_segments: domainSegments,
    route_namespace: routeNamespace,
    python_route_prefix: routeNamespace,
    go_route_mount_path: routeNamespace,
    auth_required: authRequired,
    requires_repository: requiresRepository,
    prefers_docs: prefersDocs,
    prefers_tests: prefersTests,
    operation_hints: operationHints,
    semantic_tags: unique([family].concat(domainSegments)),
    domain_key: domainKey,
    relation_candidates: relations,
  };
}

/** @param {{ semantic?: SemanticSummary, memory?: SemanticMemory, requested?: SemanticRequest }} [input] */
function deriveSemanticDecisionPolicy({ semantic = {}, memory = {}, requested = {} } = {}) {
  /** @type {string[]} */
  const reasons = [];
  const family = String(semantic.family || 'general');
  const policy = {
    /** @type {string | null} */ auth_mode: null,
    /** @type {string | null} */ route_style: null,
    /** @type {boolean | null} */ with_repository: null,
    /** @type {boolean | null} */ with_test: null,
    /** @type {boolean | null} */ with_docs: null,
    /** @type {string[] | null} */ feature_shape: null,
    reasons,
  };

  if (family === 'auth' || family === 'admin') {
    policy.auth_mode = memory.auth_strategy === 'session' ? 'session-guard' : (memory.auth_strategy === 'passport' ? 'passport-adapter' : 'bearer-guard');
    policy.with_repository = true;
    reasons.push(`semantic policy enabled ${policy.auth_mode} for ${family} feature`);
    reasons.push('semantic policy kept repository enabled for identity-sensitive flows');
  }
  if (family === 'webhook') {
    policy.route_style = 'rest-endpoint';
    policy.with_docs = true;
    if (requested.with_test === undefined) policy.with_test = false;
    reasons.push('semantic policy enabled docs for webhook integration guidance');
    reasons.push('semantic policy defaulted tests off for webhook scaffolds without fixture context');
  }
  if (family === 'billing') {
    policy.with_repository = true;
    policy.with_test = true;
    reasons.push('semantic policy enabled repository and tests for billing-like persistence flows');
  }
  if (Array.isArray(memory.preferred_feature_shape) && memory.preferred_feature_shape.length > 0 && family === 'crud') {
    policy.feature_shape = memory.preferred_feature_shape.slice();
  }
  return policy;
}

module.exports = {
  inferFeatureSemantics,
  deriveSemanticDecisionPolicy,
};
