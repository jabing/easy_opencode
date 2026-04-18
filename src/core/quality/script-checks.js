const { evaluateQualityRules } = require('../rules/quality-rules.js');
const { addResult, exists } = require('./shared.js');

/** @typedef {{ status: string, check: string, detail: string }} QualityResult */
/** @typedef {{ code: number, output: string }} InternalScriptResult */
/** @typedef {{ scripts?: Record<string, string> }} PackageLike */
/** @typedef {{ ok: boolean, detail: string }} QualityGateSummary */
/** @typedef {{ runCommand: (command: string, args: string[], options: { cwd: string, timeoutMs: number }) => Promise<{ code: number, timedOut: boolean, output: string }>} } ScriptDeps */

/**
 * @param {'lint' | 'typecheck' | 'build'} name
 * @param {boolean} pluginWorkspace
 * @param {string} root
 * @returns {Promise<InternalScriptResult | null>}
 */
async function runInternalScript(name, pluginWorkspace, root) {
  if (!pluginWorkspace) return null;
  if (name === 'lint') {
    const { runLint } = require('../lint/engine.js');
    const result = runLint(root || process.cwd());
    const note = `files=${result.files}; errors=${result.errors}; warnings=${result.warnings}`;
    const detail = result.ok
      ? note
      : result.findings.slice(0, 5).map((item) => `${item.file}:${item.line || 0}:${item.column || 0} ${item.rule} ${item.message}`).join(' | ') || note;
    return { code: result.ok ? 0 : 1, output: detail };
  }
  if (name === 'typecheck') {
    const { runTypecheck } = require('../ts-typecheck.js');
    const result = runTypecheck(root);
    const summary = `checked=${result.strict_checked}; total=${result.total_src_files}; quarantined=${result.quarantined}`;
    const note = result.degraded ? `${summary}; degraded=typescript-unavailable` : summary;
    return { code: result.ok ? (result.degraded ? 2 : 0) : 1, output: result.ok ? note : result.failures.slice(0, 5).join(' | ') };
  }
  if (name === 'build') {
    const { runBuildPipeline } = require('../build/pipeline.js');
    const result = runBuildPipeline(root);
    const artifact = result.artifact ? `${result.artifact.filename || 'n/a'} files=${result.artifact.files}` : 'artifact=n/a';
    const failures = result.checks.filter((item) => !item.ok).map((item) => `${item.name}: ${item.detail}`);
    return { code: result.ok ? 0 : 1, output: result.ok ? `${artifact}; mode=${result.mode}` : failures.join(' | ') || artifact };
  }
  return null;
}

/**
 * @param {string} root
 * @param {QualityGateSummary} metadataGate
 * @param {QualityGateSummary} skillGate
 * @param {QualityGateSummary} skillMetadataGate
 * @param {QualityResult[]} results
 */
function appendWorkspaceQualityResults(root, metadataGate, skillGate, skillMetadataGate, results) {
  const qualityEvaluation = evaluateQualityRules({
    root,
    metadataCheck: () => metadataGate,
    skillRegistryCheck: () => skillGate,
    skillMetadataCheck: () => skillMetadataGate,
  });
  const skillFindings = qualityEvaluation.findings.filter((item) => item.ruleId === 'quality.skill-registry');
  const skillMetadataFindings = qualityEvaluation.findings.filter((item) => item.ruleId === 'quality.skill-metadata');
  const metadataFindings = qualityEvaluation.findings.filter((item) => item.ruleId === 'quality.metadata-consistency');
  addResult(results, skillFindings.some((item) => item.severity === 'error') ? 'fail' : 'pass', 'skills.registry', skillFindings.length === 0 ? skillGate.detail : skillFindings.map((item) => item.message).join(' | '));
  addResult(results, skillMetadataFindings.some((item) => item.severity === 'error') ? 'fail' : 'pass', 'skills.metadata', skillMetadataFindings.length === 0 ? skillMetadataGate.detail : skillMetadataFindings.map((item) => item.message).join(' | '));
  addResult(results, metadataFindings.some((item) => item.severity === 'error') ? 'fail' : 'pass', 'metadata.consistency', metadataFindings.length === 0 ? metadataGate.detail : metadataFindings.map((item) => item.message).join(' | '));
}

/** @param {string} root @param {boolean} pluginWorkspace @param {QualityResult[]} results */
function appendPackagePresenceResults(root, pluginWorkspace, results) {
  addResult(results, exists(root, 'package.json') ? 'pass' : pluginWorkspace ? 'fail' : 'warn', 'package.json', exists(root, 'package.json') ? 'present' : (pluginWorkspace ? 'missing' : 'not present (non-Node project is allowed)'));
  addResult(results, exists(root, '.gitignore') ? 'pass' : 'warn', '.gitignore', exists(root, '.gitignore') ? 'present' : 'missing');
  addResult(results, pluginWorkspace ? (exists(root, '.opencode/command-policy.json') ? 'pass' : 'fail') : 'skip', '.opencode/command-policy.json', pluginWorkspace ? (exists(root, '.opencode/command-policy.json') ? 'present' : 'missing') : 'not applicable outside plugin workspace');
}

/**
 * @param {PackageLike} pkg
 * @param {boolean} full
 * @param {boolean} strict
 * @param {boolean} pluginWorkspace
 * @param {number} timeoutMs
 * @param {string} root
 * @param {QualityResult[]} results
 * @param {ScriptDeps} deps
 */
async function appendScriptResults(pkg, full, strict, pluginWorkspace, timeoutMs, root, results, deps) {
  const scripts = (pkg && typeof pkg === 'object' && pkg.scripts && typeof pkg.scripts === 'object') ? pkg.scripts : {};
  if (!full) {
    addResult(results, 'skip', 'script checks', 'skipped (use --full)');
    return;
  }
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  /** @type {Array<['lint' | 'typecheck' | 'build', string[]]>} */
  const ordered = [['lint', ['run', 'lint']], ['typecheck', ['run', 'typecheck']], ['build', ['run', 'build']]];
  for (const [name, args] of ordered) {
    if (!scripts[name]) {
      addResult(results, 'skip', `script:${name}`, 'not defined');
      continue;
    }
    const internal = await runInternalScript(name, pluginWorkspace, root);
    if (internal) {
      if (name === 'typecheck' && internal.code === 2) {
        addResult(results, strict ? 'fail' : 'warn', `script:${name}`, `degraded: ${internal.output}`);
        continue;
      }
      addResult(results, internal.code === 0 ? 'pass' : 'fail', `script:${name}`, internal.code === 0 ? `ok (${internal.output})` : `internal fail: ${internal.output.slice(0, 300)}`);
      continue;
    }
    const execution = await deps.runCommand(npmCmd, args, { cwd: root, timeoutMs });
    if (/EPERM/i.test(execution.output || '')) {
      addResult(results, 'fail', `script:${name}`, 'spawn EPERM (cannot bypass full gate)');
      continue;
    }
    if (execution.timedOut) {
      addResult(results, 'fail', `script:${name}`, `timeout after ${timeoutMs}ms`);
      continue;
    }
    addResult(results, execution.code === 0 ? 'pass' : 'fail', `script:${name}`, execution.code === 0 ? 'ok' : `exit ${execution.code}: ${execution.output.slice(0, 300)}`);
  }
}

module.exports = {
  runInternalScript,
  appendWorkspaceQualityResults,
  appendPackagePresenceResults,
  appendScriptResults,
};
