/** @typedef {{ task_family?: string, taskFamily?: string, manifest?: { task_family?: string, taskFamily?: string } | null, dir?: string, name?: string, skill?: string, selected_skill?: string, id?: string }} TaskFamilyInput */
/** @typedef {{ task?: { task_family?: string, selected_skill?: string } | null, plan?: { selected_skill?: TaskFamilyInput | null } | null }} TaskResult */

/** @param {unknown} value @param {string} [fallback] */
function normalizeToken(value, fallback = 'other') {
  const token = String(value || '').trim().toLowerCase();
  return token || fallback;
}

/** @param {unknown} name */
function classifyByName(name) {
  const value = normalizeToken(name);
  if (!value || value === 'other') return 'other';
  if (/(endpoint|route|handler|controller)/.test(value)) return 'endpoint';
  if (/(unit-test|test|spec|regression)/.test(value)) return 'test';
  if (/(service|module)/.test(value)) return 'service';
  if (/(config|env)/.test(value)) return 'config';
  if (/(cli|command)/.test(value)) return 'cli';
  if (/(component|widget|ui)/.test(value)) return 'component';
  if (/(model|schema|migration)/.test(value)) return 'model';
  if (/(review|gate|audit|security)/.test(value)) return 'review';
  if (/(profile|detect|observe|benchmark)/.test(value)) return 'tooling';
  return 'other';
}

/** @param {string | TaskFamilyInput | null | undefined} input */
function resolveTaskFamily(input) {
  if (!input) return 'other';
  if (typeof input === 'string') return classifyByName(input);
  const direct = input.task_family || input.taskFamily || (input.manifest && (input.manifest.task_family || input.manifest.taskFamily));
  if (direct) return normalizeToken(direct);
  const candidate = input.dir || input.name || input.skill || input.selected_skill || input.id || '';
  return classifyByName(candidate);
}

/** @param {TaskResult | null | undefined} result */
function resolveResultSkill(result) {
  const task = result && result.task ? result.task : null;
  const plan = result && result.plan ? result.plan : null;
  const selected = plan && plan.selected_skill ? plan.selected_skill : null;
  return selected && (selected.dir || selected.name) ? (selected.dir || selected.name) : (task && task.selected_skill ? task.selected_skill : null);
}

/** @param {TaskResult | null | undefined} result */
function resolveResultTaskFamily(result) {
  const task = result && result.task ? result.task : null;
  if (task && task.task_family) return normalizeToken(task.task_family);
  const plan = result && result.plan ? result.plan : null;
  const selected = plan && plan.selected_skill ? plan.selected_skill : null;
  return resolveTaskFamily(selected || resolveResultSkill(result));
}

module.exports = {
  classifyByName,
  normalizeToken,
  resolveTaskFamily,
  resolveResultSkill,
  resolveResultTaskFamily,
};
