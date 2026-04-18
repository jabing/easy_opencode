const path = require('path');

/** @typedef {Record<string, any> & { paths?: Record<string, string>, name?: string, subject?: string, class_name?: string, component_name?: string, package_name?: string, kebab_name?: string, slug_name?: string, snake_name?: string, camel_name?: string, pascal_name?: string, package_path?: string, function_name?: string }} TemplateVars */
/** @typedef {{ manifest?: { inputs?: Array<{ name?: string, default?: any }> } }} SkillLike */
/** @typedef {{ package_name?: string, runtime?: string, language?: string, framework?: string, package_manager?: string, test_runner?: string, lint_tool?: string, typecheck_tool?: string, format_tool?: string, repo_shape?: string }} ProjectProfile */

/** @param {unknown} value @param {Record<string, unknown>} vars @returns {string} */
function renderString(value, vars) {
  return String(value || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    if (vars[key] === undefined || vars[key] === null) return `{{${key}}}`;
    return String(vars[key]);
  });
}

/** @param {unknown} value @returns {string[]} */
function collectPlaceholders(value) {
  const keys = new Set();
  String(value || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    keys.add(String(key));
    return String(_);
  });
  return Array.from(keys);
}

/** @param {unknown} value @returns {string} */
function slugify(value) {
  return String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** @param {unknown} value @returns {string} */
function toPascalCase(value) {
  return String(value || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/** @param {unknown} value @returns {string} */
function toCamelCase(value) {
  const pascal = toPascalCase(value);
  return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : '';
}

/** @param {unknown} seed */
function deriveNameVariants(seed) {
  const raw = String(seed || '').trim();
  const kebab = slugify(raw);
  const pascal = toPascalCase(raw || kebab);
  const camel = toCamelCase(raw || kebab);
  const snake = kebab.replace(/-/g, '_');
  return { raw, kebab, slug: kebab, snake, pascal, camel, upper: snake.toUpperCase() };
}

/** @param {ProjectProfile} profile @param {string} projectRoot */
function buildRuntimeVars(profile, projectRoot) {
  const packageName = String(profile.package_name || path.basename(projectRoot));
  const packageVars = deriveNameVariants(packageName);
  return {
    runtime: profile.runtime || 'unknown',
    language: profile.language || 'unknown',
    framework: profile.framework || 'unknown',
    package_manager: profile.package_manager || 'unknown',
    test_runner: profile.test_runner || 'unknown',
    lint_tool: profile.lint_tool || 'unknown',
    typecheck_tool: profile.typecheck_tool || 'unknown',
    format_tool: profile.format_tool || 'unknown',
    repo_shape: profile.repo_shape || 'unknown',
    package_name: packageName,
    packageName,
    package_name_pascal: packageVars.pascal || packageName,
    package_name_camel: packageVars.camel || packageName,
    package_name_snake: packageVars.snake || packageName,
    package_path: String(packageName).replace(/\./g, '/'),
  };
}

/** @param {SkillLike} skill */
function buildInputDefaults(skill) {
  /** @type {Record<string, any>} */
  const out = {};
  const manifest = skill.manifest || {};
  /** @type {Array<{ name?: string, default?: any }>} */
  const normalizedInputs = Array.isArray(manifest.inputs) ? manifest.inputs : [];
  for (const input of normalizedInputs) {
    const key = String(input.name || '').trim();
    if (!key) continue;
    if (input.default !== undefined) out[key] = input.default;
  }
  return out;
}

/** @param {Record<string, unknown>} vars @param {unknown[]} values @returns {string[]} */
function missingPlaceholders(vars, values) {
  const missing = new Set();
  for (const value of values) {
    for (const key of collectPlaceholders(value)) missing.add(key);
  }
  for (const key of Object.keys(vars)) missing.delete(key);
  return Array.from(missing).sort((a, b) => a.localeCompare(b));
}

/** @param {TemplateVars} vars @param {Record<string, string>} paths */
function withPathVars(vars, paths) {
  /** @type {TemplateVars & Record<string, any>} */
  const next = { ...vars, paths: { ...(vars.paths || {}), ...(paths || {}) } };
  for (const [key, value] of Object.entries(next.paths || {})) next[`paths.${key}`] = value;
  return next;
}

/** @param {TemplateVars} vars */
function deriveContextVars(vars) {
  const nameSeed = vars.name || vars.subject || vars.class_name || vars.component_name || vars.package_name || 'item';
  const subjectSeed = vars.subject || vars.class_name || vars.name || 'Item';
  const nameVars = deriveNameVariants(nameSeed);
  const subjectVars = deriveNameVariants(subjectSeed);
  return {
    ...vars,
    name: vars.name || nameVars.kebab || 'item',
    kebab_name: vars.kebab_name || nameVars.kebab,
    slug_name: vars.slug_name || nameVars.kebab,
    snake_name: vars.snake_name || nameVars.snake,
    camel_name: vars.camel_name || nameVars.camel,
    pascal_name: vars.pascal_name || nameVars.pascal,
    component_name: vars.component_name || nameVars.pascal,
    class_name: vars.class_name || subjectVars.pascal,
    package_path: vars.package_path || String(vars.package_name || '').replace(/\./g, '/'),
    subject: vars.subject || subjectVars.pascal || nameVars.pascal,
    function_name: vars.function_name || subjectVars.camel || nameVars.camel,
  };
}

module.exports = {
  renderString,
  collectPlaceholders,
  slugify,
  toPascalCase,
  toCamelCase,
  deriveNameVariants,
  buildRuntimeVars,
  buildInputDefaults,
  missingPlaceholders,
  withPathVars,
  deriveContextVars,
};
