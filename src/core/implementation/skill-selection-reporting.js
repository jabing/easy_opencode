const { allowCrossRuntime } = require('./skill-selection-shared.js');
const { deriveRuntimeSupport } = require('../skills/runtime-hints.js');

/** @param {{ skill: any, score: number, compatibility: any, decision: any }} item */
function toPublicCandidate(item) {
  const routing = deriveRuntimeSupport(item.skill);
  return {
    name: item.skill.name,
    dir: item.skill.dir,
    level: item.skill.level,
    executable: item.skill.executable,
    support_tier: item.skill.support_tier || null,
    score: item.score,
    runtime_match: item.compatibility.runtime.status === 'match',
    framework_match: item.compatibility.framework.status === 'match',
    task_family: item.skill.task_family || null,
    triggers: item.skill.triggers,
    decision: item.decision,
    routing_support: {
      runtimes: routing.runtimes,
      source: routing.source,
      unknown_frameworks: routing.unknown_frameworks,
    },
    compatibility: {
      runtime: item.compatibility.runtime.status,
      framework: item.compatibility.framework.status,
      language: item.compatibility.language.status,
      supported_runtimes: item.compatibility.supported_runtimes,
      supported_frameworks: item.compatibility.supported_frameworks,
      supported_languages: item.compatibility.supported_languages,
    },
  };
}

/** @param {Array<{ decision: { constraints?: Array<{ kind: string, status: string }> } }>} items */
function summarizeRejections(items) {
  const counters = { runtime_mismatch: 0, framework_mismatch: 0, other: 0 };
  for (const item of items) {
    const constraints = item && item.decision && Array.isArray(item.decision.constraints) ? item.decision.constraints : [];
    let counted = false;
    for (const constraint of constraints) {
      if (constraint.kind === 'runtime' && constraint.status === 'failed') {
        counters.runtime_mismatch += 1;
        counted = true;
      }
      if (constraint.kind === 'framework' && constraint.status === 'failed') {
        counters.framework_mismatch += 1;
        counted = true;
      }
    }
    if (!counted) counters.other += 1;
  }
  return counters;
}

/** @param {string} query @param {{ runtime: string, language: string, framework: string }} profile @param {Record<string, any>} opts @param {Array<{ skill: any, score: number, accepted: boolean, decision: any, compatibility: any }>} evaluated */
function buildSelectionReport(query, profile, opts, evaluated) {
  const accepted = evaluated
    .filter((item) => item.accepted && item.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
  const rejected = evaluated
    .filter((item) => !item.accepted)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
  const publicAccepted = accepted.slice(0, Number(opts.limit || 5)).map((item, index) => ({ rank: index + 1, ...toPublicCandidate(item) }));
  const publicRejected = rejected.slice(0, Number(opts['rejected-limit'] || 5)).map((item) => {
    const routing = deriveRuntimeSupport(item.skill);
    return {
      name: item.skill.name,
      dir: item.skill.dir,
      score: item.score,
      summary: item.decision.summary,
      routing_support: {
        runtimes: routing.runtimes,
        source: routing.source,
        unknown_frameworks: routing.unknown_frameworks,
      },
      compatibility: {
        runtime: item.compatibility.runtime.status,
        framework: item.compatibility.framework.status,
        language: item.compatibility.language.status,
        supported_runtimes: item.compatibility.supported_runtimes,
        supported_frameworks: item.compatibility.supported_frameworks,
        supported_languages: item.compatibility.supported_languages,
      },
      constraints: item.decision.constraints,
    };
  });
  return {
    report_version: '2.0',
    selection_basis: 'constraints_then_ranking',
    mode: 'automatic',
    objective: query,
    allow_cross_runtime: allowCrossRuntime(opts),
    profile: {
      runtime: profile.runtime,
      language: profile.language,
      framework: profile.framework,
    },
    accepted_candidates: publicAccepted,
    rejected_candidates: publicRejected,
    totals: {
      evaluated: evaluated.length,
      accepted: accepted.length,
      rejected: rejected.length,
    },
    rejected_by_reason: summarizeRejections(rejected),
  };
}

/** @param {any} selection */
function summarizeSkillSelection(selection) {
  if (!selection) return null;
  return {
    name: selection.name,
    dir: selection.dir,
    level: selection.level,
    executable: Boolean(selection.executable),
    support_tier: selection.support_tier || null,
    task_family: selection.task_family || null,
    runtime_match: Boolean(selection.runtime_match),
    framework_match: Boolean(selection.framework_match),
    routing_support: selection.routing_support || null,
    compatibility: selection.compatibility || null,
    decision: selection.decision || null,
    verify: selection.verify || [],
  };
}

module.exports = {
  buildSelectionReport,
  summarizeSkillSelection,
  toPublicCandidate,
};
