const { readAllSkills, normalizeList } = require('../skills/manifest.js');
const { deriveRuntimeSupport, inferRuntimesFromFrameworks } = require('../skills/runtime-hints.js');

const ROUTE_SENSITIVE_FAMILIES = new Set(['endpoint', 'handler', 'controller', 'feature', 'model', 'service', 'module']);
const RUNTIME_PARTITIONED_TRIGGER_ALLOWLIST = new Set(['add endpoint']);

/** @typedef {{ dir: string, executable?: boolean, task_family?: string | null, frameworks?: string[] | string | null, triggers?: string[] | string | null, runtimes?: string[] | string | null, actions?: Array<{ when?: { runtime?: string | string[] | null } }> | null }} SkillRecord */

/** @param {unknown} value */
function normalizeValue(value) {
  return String(value || '').trim().toLowerCase();
}

/** @param {SkillRecord | null | undefined} skill */
function normalizedFrameworks(skill) {
  return normalizeList(skill && skill.frameworks);
}

/** @param {SkillRecord | null | undefined} skill */
function runtimeSupportFor(skill) {
  return deriveRuntimeSupport(/** @type {any} */ (skill || {}));
}

/** @param {SkillRecord | null | undefined} skill */
function frameworkInferenceFor(skill) {
  return inferRuntimesFromFrameworks(normalizedFrameworks(skill));
}

/** @param {SkillRecord | null | undefined} skill */
function requiresDeterministicRuntime(skill) {
  if (!skill || !skill.executable) return false;
  if (ROUTE_SENSITIVE_FAMILIES.has(normalizeValue(skill.task_family))) return true;
  return normalizedFrameworks(skill).some((framework) => ['express', 'fastapi', 'django', 'springboot', 'jpa', 'gin', 'fiber', 'react', 'vue'].includes(framework));
}

/** @param {SkillRecord | null | undefined} skill */
function validateSkillRecord(skill) {
  if (!skill) {
    return { failures: ['invalid skill record'], warnings: [], routing: { runtimes: [], source: 'none', unknown_frameworks: [] } };
  }
  /** @type {string[]} */
  const failures = [];
  /** @type {string[]} */
  const warnings = [];
  const runtimeSupport = runtimeSupportFor(skill);
  const frameworkInference = frameworkInferenceFor(skill);
  const declaredFrameworks = normalizedFrameworks(skill);
  const triggers = normalizeList(skill.triggers);

  if (skill.executable && triggers.length === 0) {
    failures.push(`${skill.dir}: executable skill missing triggers`);
  }

  if (requiresDeterministicRuntime(skill) && runtimeSupport.runtimes.length === 0) {
    failures.push(`${skill.dir}: executable routing skill lacks derivable runtime metadata`);
  }

  if (frameworkInference.runtimes.length > 0 && runtimeSupport.source !== 'framework_inference') {
    const overlap = runtimeSupport.runtimes.filter((runtime) => frameworkInference.runtimes.includes(runtime));
    if (runtimeSupport.runtimes.length > 0 && overlap.length === 0) {
      failures.push(`${skill.dir}: framework/runtime conflict (${declaredFrameworks.join('/')} -> ${frameworkInference.runtimes.join('/')} but skill declares ${runtimeSupport.runtimes.join('/')})`);
    }
  }

  if (skill.executable && declaredFrameworks.length > 0 && frameworkInference.unknown_frameworks.length > 0 && runtimeSupport.runtimes.length === 0) {
    warnings.push(`${skill.dir}: frameworks without runtime hints (${frameworkInference.unknown_frameworks.join('/')})`);
  }

  if (skill.executable && !skill.task_family) {
    warnings.push(`${skill.dir}: executable skill missing task_family`);
  }

  return {
    failures,
    warnings,
    routing: {
      runtimes: runtimeSupport.runtimes,
      source: runtimeSupport.source,
      unknown_frameworks: runtimeSupport.unknown_frameworks,
    },
  };
}

/** @param {SkillRecord[]} skills */
function detectTriggerConflicts(skills) {
  /** @type {Map<string, Array<{ dir: string, frameworks: string[], runtimes: string[] }>>} */
  const triggerMap = new Map();
  /** @type {string[]} */
  const failures = [];
  /** @type {string[]} */
  const warnings = [];

  for (const skill of skills.filter((item) => item && item.executable)) {
    const routing = runtimeSupportFor(skill);
    for (const trigger of normalizeList(skill.triggers)) {
      if (!triggerMap.has(trigger)) triggerMap.set(trigger, []);
      const entries = triggerMap.get(trigger);
      if (entries) {
        entries.push({
          dir: skill.dir,
          frameworks: normalizedFrameworks(skill),
          runtimes: routing.runtimes,
        });
      }
    }
  }

  for (const [trigger, entries] of triggerMap.entries()) {
    if (entries.length < 2) continue;
    const knownRuntimeEntries = entries.filter((entry) => entry.runtimes.length > 0);
    const distinctRuntimes = new Set(knownRuntimeEntries.flatMap((entry) => entry.runtimes));
    const hasUnknownRuntime = knownRuntimeEntries.length !== entries.length;
    if (!hasUnknownRuntime && distinctRuntimes.size >= 2 && RUNTIME_PARTITIONED_TRIGGER_ALLOWLIST.has(trigger)) {
      warnings.push(`trigger collision "${trigger}" is partitioned by runtime: ${entries.map((entry) => `${entry.dir}[${entry.runtimes.join('/')}]`).join(', ')}`);
      continue;
    }
    if (hasUnknownRuntime || distinctRuntimes.size < 2) {
      failures.push(`trigger collision "${trigger}" is not safely partitioned: ${entries.map((entry) => entry.dir).join(', ')}`);
      continue;
    }
    warnings.push(`trigger collision "${trigger}" is partitioned by runtime: ${entries.map((entry) => `${entry.dir}[${entry.runtimes.join('/')}]`).join(', ')}`);
  }

  return { failures, warnings };
}

/** @param {string} root */
function validateSkillMetadata(root) {
  const skills = /** @type {SkillRecord[]} */ (readAllSkills(root));
  /** @type {string[]} */
  const failures = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {any[]} */
  const perSkill = [];

  for (const skill of skills) {
    const result = validateSkillRecord(skill);
    failures.push(...result.failures);
    warnings.push(...result.warnings);
    perSkill.push({
      dir: skill.dir,
      executable: Boolean(skill.executable),
      task_family: skill.task_family || null,
      routing: result.routing,
      failures: result.failures,
      warnings: result.warnings,
    });
  }

  const triggerConflicts = detectTriggerConflicts(skills);
  failures.push(...triggerConflicts.failures);
  warnings.push(...triggerConflicts.warnings);

  /** @type {string[]} */
  const detailParts = [];
  if (failures.length === 0) detailParts.push('ok');
  detailParts.push(`skills=${skills.length}`);
  detailParts.push(`failures=${failures.length}`);
  detailParts.push(`warnings=${warnings.length}`);
  if (failures.length > 0) detailParts.push(failures.slice(0, 3).join(' | '));
  else if (warnings.length > 0) detailParts.push(warnings.slice(0, 2).join(' | '));

  return {
    ok: failures.length === 0,
    detail: detailParts.join(' '),
    failures,
    warnings,
    per_skill: perSkill,
    trigger_conflicts: triggerConflicts,
  };
}

module.exports = {
  ROUTE_SENSITIVE_FAMILIES,
  detectTriggerConflicts,
  requiresDeterministicRuntime,
  validateSkillMetadata,
  validateSkillRecord,
};
