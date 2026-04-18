const path = require('path');
const { spawnSync } = require('child_process');
const { toVarMap } = require('./skill-selection.js');

/**
 * @typedef {{
 *   root?: string,
 *   out?: string,
 *   template?: string,
 *   force?: boolean,
 *   name?: string,
 *   feature?: string,
 *   objective?: string,
 *   subject?: string,
 *   var?: string[],
 *   [key: string]: unknown
 * }} ScaffoldOptions
 */

/**
 * @param {string} assetRoot
 * @param {string} skillName
 * @param {ScaffoldOptions} opts
 * @param {string | null} [taskFamily]
 */
function runSkillScaffold(assetRoot, skillName, opts, taskFamily = null) {
  const isFeatureTask = String(taskFamily || '').trim() === 'feature';
  const vars = toVarMap(Array.isArray(opts.var) ? opts.var : []);
  const scriptPath = path.join(assetRoot, 'scripts', isFeatureTask ? 'generate-feature.js' : 'skill-runner.js');
  const args = isFeatureTask
    ? [scriptPath, String(vars.name || opts.name || opts.feature || opts.objective || 'generated-feature').trim(), '--root', String(opts.root), '--json']
    : [scriptPath, 'scaffold', skillName, '--root', String(opts.root), '--json'];
  if (!isFeatureTask && opts.out) args.push('--out', String(opts.out));
  if (!isFeatureTask && opts.template) args.push('--template', String(opts.template));
  if (opts.force) args.push('--force');
  if (opts['dry-run']) args.push('--dry-run');
  if (!isFeatureTask && opts['strategy-bias']) args.push('--strategy-bias', String(opts['strategy-bias']));
  if (!isFeatureTask && opts['bundle-mode']) args.push('--bundle-mode', String(opts['bundle-mode']));
  if (opts['integration-mode']) args.push('--integration-mode', String(opts['integration-mode']));
  if (!isFeatureTask && opts['benchmark-aware']) args.push('--benchmark-aware');
  if (!isFeatureTask && opts['benchmark-limit']) args.push('--benchmark-limit', String(opts['benchmark-limit']));
  if (isFeatureTask && (vars.subject || opts.subject || opts.objective)) args.push('--subject', String(vars.subject || opts.subject || opts.objective));
  if (!isFeatureTask && opts.objective) args.push('--objective', String(opts.objective));
  for (const pair of Array.isArray(opts.var) ? opts.var : []) {
    if (!isFeatureTask || !/^subject=/.test(String(pair))) args.push('--var', String(pair));
  }
  const result = spawnSync(process.execPath, args, {
    cwd: assetRoot,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
    env: { ...process.env, EOC_ASSET_ROOT: assetRoot },
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim() || 'unknown scaffold failure';
    throw new Error(detail);
  }
  return /** @type {Record<string, unknown>} */ (JSON.parse(String(result.stdout || '{}')));
}

module.exports = {
  runSkillScaffold,
};
