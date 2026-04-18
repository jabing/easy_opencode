const fs = require('fs');
const path = require('path');
const { writeFeatureIntegrationJson } = require('./artifacts.js');

/** @typedef {Record<string, string | number | boolean | null | undefined>} TemplateVars */
/** @typedef {{ id?: string, template?: string, output?: string, primary?: boolean, role?: string }} FeatureModuleDef */
/** @typedef {{ type?: string, file?: string, content?: string, create_if_missing?: unknown, only_if_exists?: unknown, import_path?: string, register_name?: string }} FeatureUpdateDef */
/** @typedef {{ paths?: Record<string, unknown>, dependency_graph?: Record<string, string[]>, ordered_modules?: FeatureModuleDef[], updates?: FeatureUpdateDef[], verify?: string[] }} FeatureBundlePlan */
/** @typedef {{ name?: string, base?: string }} FeatureSkill */
/** @typedef {{ id: string | undefined, template: string, output: string, body: string, primary: boolean, role: string }} GeneratedOutput */
/** @typedef {{ changed: boolean, body: string, alreadyPresent?: boolean }} TextMutation */
/** @typedef {{ type: string, file: string, status: string, content: string }} UpdateResult */
/** @typedef {{ output: string, role: string, module: string | undefined }} OutputRole */
/** @typedef {{ feature_name: string | null, generated_at: string, mode: string, created_files: string[], updated_files: string[], routes_added: string[], docs_added: string[], manual_steps: string[], verify_commands: string[], dependency_graph: Record<string, string[]> | undefined, paths: Record<string, unknown> | undefined, schema_version: string }} IntegrationSummary */

/** @param {unknown} value @param {TemplateVars} vars */
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
    return _;
  });
  return Array.from(keys);
}

/** @param {TemplateVars} vars @param {unknown[]} values @returns {string[]} */
function missingPlaceholders(vars, values) {
  const missing = new Set();
  for (const value of values) {
    for (const key of collectPlaceholders(value)) missing.add(key);
  }
  for (const key of Object.keys(vars)) missing.delete(key);
  return Array.from(missing).sort((a, b) => a.localeCompare(b));
}

/** @param {string} filePath */
function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/** @param {FeatureModuleDef | null | undefined} fileDef @returns {string} */
function inferFileRole(fileDef) {
  if (fileDef && fileDef.role) return String(fileDef.role);
  const output = String((fileDef && fileDef.output) || '').split(path.sep).join('/').toLowerCase();
  if (fileDef && fileDef.primary) return 'primary';
  if (output.includes('/tests/') || output.startsWith('tests/') || output.endsWith('.spec.ts') || output.endsWith('.test.ts')) return 'test';
  if (output.startsWith('.opencode/feature-bundles/')) return 'guide';
  if (output.startsWith('docs/')) return 'docs';
  return 'support';
}

/** @param {unknown} text @returns {string} */
function normalizeUpdateText(text) {
  return String(text || '').replace(/\r\n/g, '\n').trim();
}

/** @param {unknown} existing @param {unknown} block @returns {TextMutation} */
function appendBlockToText(existing, block) {
  const current = String(existing || '');
  const normalizedCurrent = current.replace(/\r\n/g, '\n');
  const trimmedCurrent = normalizedCurrent.replace(/\s+$/g, '');
  const normalizedBlock = normalizeUpdateText(block);
  if (!normalizedBlock) return { changed: false, body: current };
  if (normalizeUpdateText(normalizedCurrent).includes(normalizedBlock)) {
    return { changed: false, body: current, alreadyPresent: true };
  }
  const separator = trimmedCurrent ? '\n\n' : '';
  return { changed: true, body: `${trimmedCurrent}${separator}${normalizedBlock}\n` };
}

/** @param {string} current @param {string} importLine @returns {string} */
function insertAfterLastImport(current, importLine) {
  if (!importLine) return current;
  if (current.includes(importLine)) return current;
  const imports = [...current.matchAll(/^(?:import\s.+;?|from\s+.+\s+import\s+.+)\n?/gm)];
  const last = imports[imports.length - 1];
  if (last) {
    const lastIndex = typeof last.index === 'number' ? last.index : 0;
    const pos = lastIndex + last[0].length;
    return `${current.slice(0, pos)}${current[pos - 1] === '\n' ? '' : '\n'}${importLine}\n${current.slice(pos)}`;
  }
  return `${importLine}\n${current}`;
}

/** @param {string} current @param {FeatureUpdateDef} update @param {TemplateVars} vars @returns {TextMutation} */
function applyNodeEntrypointRegistration(current, update, vars) {
  const importPath = renderString(update.import_path || '', vars);
  const registerName = renderString(update.register_name || '', vars);
  if (!importPath || !registerName) return { changed: false, body: current };
  const importLine = `import { ${registerName} } from '${importPath}';`;
  const appVarMatch = current.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:express|fastify)\s*\(\)/)
    || current.match(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:express|fastify)\s*\(\)/)
    || current.match(/\b([A-Za-z_$][\w$]*)\s*=\s*express\s*\(\)/);
  const appVar = appVarMatch ? appVarMatch[1] : 'app';
  const useLine = `${appVar}.use(${registerName}());`;
  if (current.includes(importLine) && current.includes(useLine)) return { changed: false, body: current, alreadyPresent: true };
  let next = insertAfterLastImport(current, importLine);
  if (!next.includes(useLine)) {
    const insertionPattern = /(\n\s*(?:app|server|router)\.use\([^\n;]*(?:errorHandler|appErrorHandler|handleError)[^\n;]*\);|\n\s*(?:export\s+default\s+app|app\.listen\(|server\.listen\(|module\.exports\s*=))/;
    const match = next.match(insertionPattern);
    next = match && typeof match.index === 'number'
      ? `${next.slice(0, match.index)}\n${useLine}${next.slice(match.index)}`
      : `${next.replace(/\s+$/g, '')}\n${useLine}\n`;
  }
  return { changed: next !== current, body: next, alreadyPresent: false };
}

/** @param {string} current @param {TemplateVars} vars @returns {TextMutation} */
function applyPythonEntrypointRegistration(current, vars) {
  const importLine = String(vars.python_include_router_import || '').trim();
  const includeLine = String(vars.python_include_router_call || '').trim();
  if (!importLine || !includeLine) return { changed: false, body: current };
  if (current.includes(importLine) && current.includes(includeLine)) return { changed: false, body: current, alreadyPresent: true };
  let next = insertAfterLastImport(current, importLine);
  if (!next.includes(includeLine)) {
    const match = next.match(/\n\s*app\s*=\s*FastAPI\([^\n]*\)\n?/);
    if (match && typeof match.index === 'number') {
      const pos = match.index + match[0].length;
      next = `${next.slice(0, pos)}${includeLine}\n${next.slice(pos)}`;
    } else {
      next = `${next.replace(/\s+$/g, '')}\n${includeLine}\n`;
    }
  }
  return { changed: next !== current, body: next, alreadyPresent: false };
}

/** @param {string} current @param {TemplateVars} vars @returns {TextMutation} */
function applyGoEntrypointRegistration(current, vars) {
  const importPath = String(vars.go_route_index_import || '').trim();
  const registerCall = String(vars.go_route_register_call || '').trim();
  if (!registerCall) return { changed: false, body: current };
  let next = current;
  if (importPath && !next.includes(`"${importPath}"`)) {
    const block = next.match(/import\s*\(([^]*?)\)/m);
    if (block && typeof block.index === 'number') {
      const pos = block.index + block[0].length - 1;
      next = `${next.slice(0, pos)}\n\t"${importPath}"${next.slice(pos)}`;
    } else {
      next = `import "${importPath}"\n\n${next}`;
    }
  }
  if (!next.includes(registerCall)) {
    const fnMatch = next.match(/func\s+RegisterRoutes\([^)]*\)\s*\{\n?/m) || next.match(/func\s+[A-Za-z0-9_]+\([^)]*\)\s*\{\n?/m);
    if (fnMatch && typeof fnMatch.index === 'number') {
      const pos = fnMatch.index + fnMatch[0].length;
      next = `${next.slice(0, pos)}\t${registerCall}\n${next.slice(pos)}`;
    } else {
      next = `${next.replace(/\s+$/g, '')}\n${registerCall}\n`;
    }
  }
  return { changed: next !== current, body: next, alreadyPresent: false };
}

/** @param {unknown} before @param {FeatureUpdateDef} update @param {TemplateVars} vars @returns {TextMutation} */
function applyEntrypointRouteRegistration(before, update, vars) {
  const current = String(before || '').replace(/\r\n/g, '\n');
  const runtime = String(vars.runtime || '').trim();
  if (runtime === 'python') return applyPythonEntrypointRegistration(current, vars);
  if (runtime === 'go') return applyGoEntrypointRegistration(current, vars);
  return applyNodeEntrypointRegistration(current, update, vars);
}

/** @param {FeatureUpdateDef | null | undefined} update @param {TemplateVars} vars @returns {string} */
function summarizeUpdateContent(update, vars) {
  const type = String((update && update.type) || 'ensure_block');
  const rendered = renderString((update && update.content) || '', vars);
  if (type !== 'register_route_in_entrypoint') return rendered;
  const runtime = String(vars.runtime || '').trim();
  if (runtime === 'python') {
    return [String(vars.python_include_router_import || '').trim(), String(vars.python_include_router_call || '').trim()].filter(Boolean).join('\n');
  }
  if (runtime === 'go') {
    const importPath = String(vars.go_route_index_import || '').trim();
    const registerCall = String(vars.go_route_register_call || '').trim();
    return [importPath ? `\t"${importPath}"` : '', registerCall].filter(Boolean).join('\n');
  }
  const importPath = renderString((update && update.import_path) || '', vars);
  const registerName = renderString((update && update.register_name) || '', vars);
  return [importPath && registerName ? `import { ${registerName} } from '${importPath}';` : '', registerName ? `app.use(${registerName}());` : ''].filter(Boolean).join('\n');
}

/** @param {GeneratedOutput | null | undefined} item @returns {number} */
function outputOrderWeight(item) {
  const key = String((item && item.id) || (item && item.role) || '').toLowerCase();
  /** @type {{ repository: number, schema: number, service: number, controller: number, route: number, docs: number, integration: number, guide: number, test: number, [key: string]: number | undefined }} */
  const order = {
    repository: 10,
    schema: 20,
    service: 30,
    controller: 40,
    route: 50,
    docs: 60,
    integration: 70,
    guide: 70,
    test: 80,
  };
  return order[key] || 999;
}

/** @param {GeneratedOutput[] | null | undefined} items @returns {GeneratedOutput[]} */
function sortOutputsForPresentation(items) {
  return [...(items || [])].sort((a, b) => outputOrderWeight(a) - outputOrderWeight(b) || String(a.output || '').localeCompare(String(b.output || '')));
}

/** @param {FeatureUpdateDef[] | null | undefined} updates @param {string} projectRoot @param {TemplateVars} vars @param {{ ['dry-run']?: boolean }} opts @param {string} integrationMode @returns {UpdateResult[]} */
function applyUpdates(updates, projectRoot, vars, opts, integrationMode) {
  if (integrationMode === 'skip') {
    return (updates || []).map((update) => ({
      type: String(update.type || 'ensure_block'),
      file: renderString(update.file || '', vars),
      status: 'skipped_by_policy',
      content: renderString(update.content || '', vars),
    }));
  }
  /** @type {UpdateResult[]} */
  const results = [];
  for (const update of updates || []) {
    const type = String(update.type || 'ensure_block');
    const fileRel = renderString(update.file || '', vars);
    const absPath = path.resolve(projectRoot, fileRel);
    const content = summarizeUpdateContent(update, vars);
    const exists = fs.existsSync(absPath);
    const createIfMissing = Boolean(update.create_if_missing);
    const onlyIfExists = Boolean(update.only_if_exists);
    if (!exists && onlyIfExists) {
      results.push({ type, file: fileRel, status: 'skipped_missing', content });
      continue;
    }
    if (!exists && !createIfMissing && !onlyIfExists) {
      results.push({ type, file: fileRel, status: 'skipped_missing', content });
      continue;
    }
    const before = exists ? fs.readFileSync(absPath, 'utf8') : '';
    const outcome = type === 'register_route_in_entrypoint'
      ? applyEntrypointRouteRegistration(before, update, vars)
      : appendBlockToText(before, type === 'ensure_line' ? normalizeUpdateText(content) : content);
    if (opts['dry-run'] || integrationMode === 'plan') {
      results.push({
        type,
        file: fileRel,
        status: outcome.alreadyPresent ? 'already_present' : (outcome.changed ? 'would_apply' : 'noop'),
        content,
      });
      continue;
    }
    if (outcome.changed) {
      ensureDirForFile(absPath);
      fs.writeFileSync(absPath, outcome.body, 'utf8');
      results.push({ type, file: fileRel, status: exists ? 'updated' : 'created', content });
    } else {
      results.push({ type, file: fileRel, status: 'already_present', content });
    }
  }
  return results;
}

/**
 * @param {{ root: string, skill: FeatureSkill, action?: unknown, vars: TemplateVars, plan: FeatureBundlePlan, dryRun?: boolean, force?: boolean, json?: boolean, integrationMode?: string }} input
 */
function runFeatureBundle({ root, skill, action, vars, plan, dryRun = false, force = false, json = false, integrationMode = 'apply' }) {
  void action;
  /** @type {GeneratedOutput[]} */
  const outputs = [];
  /** @type {unknown[]} */
  const missingValues = [];
  for (const moduleDef of plan.ordered_modules || []) {
    const templatePath = path.join(String(skill.base || ''), 'templates', String(moduleDef.template || ''));
    if (!fs.existsSync(templatePath)) throw new Error(`Missing template: ${templatePath}`);
    const templateBody = fs.readFileSync(templatePath, 'utf8');
    const outputRel = renderString(moduleDef.output || '', vars);
    const renderedBody = renderString(templateBody, vars);
    missingValues.push(outputRel, renderedBody);
    outputs.push({
      id: moduleDef.id,
      template: String(moduleDef.template || ''),
      output: outputRel,
      body: renderedBody,
      primary: Boolean(moduleDef.primary),
      role: inferFileRole(moduleDef),
    });
  }

  const missing = missingPlaceholders(vars, missingValues);
  if (missing.length > 0) throw new Error(`Missing template variables: ${missing.join(', ')}`);

  for (const file of outputs) {
    const absOut = path.resolve(root, file.output);
    if (fs.existsSync(absOut) && !force && !dryRun) {
      throw new Error(`Refusing to overwrite existing file: ${file.output}. Pass --force to overwrite.`);
    }
  }

  if (!dryRun) {
    for (const file of outputs) {
      const absOut = path.resolve(root, file.output);
      ensureDirForFile(absOut);
      fs.writeFileSync(absOut, file.body, 'utf8');
    }
  }

  const updates = applyUpdates(plan.updates, root, vars, { 'dry-run': dryRun }, integrationMode);
  const integrationNote = outputs.find((item) => item.output.startsWith('.opencode/feature-bundles/'))?.output || null;
  /** @type {IntegrationSummary} */
  const integrationSummary = {
    schema_version: '1.0',
    feature_name: String(vars.kebab_name || vars.name || '') || null,
    generated_at: new Date().toISOString(),
    mode: integrationMode,
    created_files: outputs.map((item) => item.output),
    updated_files: updates.filter((item) => ['updated', 'created'].includes(item.status)).map((item) => item.file),
    routes_added: updates.filter((item) => item.type === 'register_route_in_entrypoint' && ['updated', 'created', 'would_apply'].includes(item.status)).map((item) => item.file),
    docs_added: outputs.filter((item) => item.role === 'docs').map((item) => item.output).concat(updates.filter((item) => /docs/i.test(String(item.file || '')) && ['updated', 'created', 'would_apply'].includes(item.status)).map((item) => item.file)),
    manual_steps: [],
    verify_commands: Array.isArray(plan.verify) ? plan.verify : [],
    dependency_graph: plan.dependency_graph,
    paths: plan.paths,
  };
  const integrationJson = dryRun ? null : writeFeatureIntegrationJson(root, String(vars.kebab_name || vars.name || 'feature'), integrationSummary);
  const presentedOutputs = sortOutputsForPresentation(outputs);
  /** @type {{ mode: string, skill: string | undefined, runtime: string | number | boolean | null | undefined, dry_run: boolean, outputs: string[], output_roles: OutputRole[], output: string | null, updates: UpdateResult[], paths: Record<string, unknown> | undefined, dependency_graph: Record<string, string[]> | undefined, integration_note: string | null, integration_summary: IntegrationSummary, integration_json: string | null, integration_status: string, preview?: { output: string, body: string, role: string, module: string | undefined }[] }} */
  const result = {
    mode: 'feature_bundle',
    skill: skill.name,
    runtime: vars.runtime,
    dry_run: Boolean(dryRun),
    outputs: presentedOutputs.map((item) => item.output),
    output_roles: presentedOutputs.map((item) => ({ output: item.output, role: item.role, module: item.id })),
    output: (presentedOutputs.find((item) => item.primary) || presentedOutputs[0] || null)?.output || null,
    updates,
    paths: plan.paths,
    dependency_graph: plan.dependency_graph,
    integration_note: integrationNote,
    integration_summary: integrationSummary,
    integration_json: integrationJson ? path.relative(root, integrationJson).split(path.sep).join('/') : null,
    integration_status: integrationMode === 'skip' ? 'skipped' : (dryRun || integrationMode === 'plan' ? 'planned' : 'applied'),
  };
  if (json) {
    result.preview = presentedOutputs.map((item) => ({ output: item.output, body: item.body, role: item.role, module: item.id }));
  }
  return result;
}

module.exports = {
  runFeatureBundle,
};
