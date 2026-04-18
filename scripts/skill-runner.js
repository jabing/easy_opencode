#!/usr/bin/env node
const path = require('path');
const { readAllSkills, resolveSkill } = require('../src/core/skills/manifest.js');
const { buildCapabilityRegistry, resolveCapability } = require('../src/core/capabilities/registry.js');
const { parseArgs } = require('../src/shared/cli.js');
const { scaffoldSkill, formatScaffoldOutput } = require('../src/core/skills/scaffold/service.js');
const { assertNamedContract } = require('../src/shared/contracts.js');

function parseSkillRunnerArgs(argv) {
  return parseArgs(argv, { initial: { _: [], var: [] }, multiValueKeys: ['var'] });
}

function listSkills(root, opts) {
  const capabilityRegistry = buildCapabilityRegistry(root);
  const capabilityMap = new Map(capabilityRegistry.capabilities.map((item) => [item.source_ref, item]));
  let skills = readAllSkills(root);
  if (opts.level) skills = skills.filter((skill) => skill.level === opts.level);
  if (opts['support-tier']) skills = skills.filter((skill) => skill.support_tier === String(opts['support-tier']));
  if (opts.runtime) {
    skills = skills.filter((skill) => {
      if (!Array.isArray(skill.actions) || skill.actions.length === 0) return false;
      return skill.actions.some((action) => {
        if (!action.when || !action.when.runtime) return true;
        const allowed = Array.isArray(action.when.runtime) ? action.when.runtime : [action.when.runtime];
        return allowed.includes(opts.runtime);
      });
    });
  }
  if (opts.json) {
    const payload = skills.map((skill) => ({
      name: skill.name,
      dir: skill.dir,
      level: skill.level,
      executable: skill.executable,
      support_tier: skill.support_tier || null,
      task_family: skill.task_family || null,
      capability_id: capabilityMap.get(skill.dir) ? capabilityMap.get(skill.dir).id : null,
      execution_mode: capabilityMap.get(skill.dir) ? capabilityMap.get(skill.dir).execution_mode : null,
      runtimes: skill.runtimes,
      languages: skill.languages,
      frameworks: skill.frameworks,
    }));
    assertNamedContract('skill-runner-list', payload);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  for (const skill of skills) {
    const capability = capabilityMap.get(skill.dir);
    console.log(`${skill.name}	${skill.level}	${skill.support_tier || 'tier4'}	${skill.task_family || 'other'}	${capability ? capability.execution_mode : (skill.executable ? 'exec' : 'doc')}	${skill.description}`);
  }
}

function showSkill(root, name, opts) {
  const skill = resolveSkill(root, name);
  if (!skill) throw new Error(`Unknown skill: ${name}`);
  const capability = resolveCapability(root, `skill:${skill.dir}`) || resolveCapability(root, skill.dir);
  const payload = {
    name: skill.name,
    dir: skill.dir,
    level: skill.level,
    executable: skill.executable,
    support_tier: skill.support_tier || null,
    support_scope: skill.support_scope || null,
    runtimes: skill.runtimes || [],
    task_family: skill.task_family || null,
    languages: skill.languages,
    frameworks: skill.frameworks,
    triggers: skill.triggers,
    verify: skill.verify,
    actions: skill.actions,
    files: skill.files,
    capability_id: capability ? capability.id : null,
    execution_mode: capability ? capability.execution_mode : null,
    capability_kind: capability ? capability.kind : null,
  };
  if (opts.json) { assertNamedContract('skill-runner-show', payload); console.log(JSON.stringify(payload, null, 2)); }
  else {
    console.log(`# ${skill.name}`);
    console.log(`level: ${skill.level}`);
    console.log(`executable: ${skill.executable ? 'yes' : 'no'}`);
    if (skill.task_family) console.log(`task_family: ${skill.task_family}`);
    if (skill.languages.length) console.log(`languages: ${skill.languages.join(', ')}`);
    if (skill.frameworks.length) console.log(`frameworks: ${skill.frameworks.join(', ')}`);
    if (skill.triggers.length) console.log(`triggers: ${skill.triggers.join(' | ')}`);
    if (skill.verify.length) console.log(`verify: ${skill.verify.join(' && ')}`);
    console.log(`files: ${JSON.stringify(skill.files)}`);
  }
}

function matchSkill(root, query, opts) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) throw new Error('Query is required for match');
  const tokens = q.split(/\s+/).filter(Boolean);
  const capabilityRegistry = buildCapabilityRegistry(root);
  const capabilityMap = new Map(capabilityRegistry.capabilities.map((item) => [item.source_ref, item]));
  const skills = readAllSkills(root)
    .map((skill) => {
      let score = 0;
      const haystack = [skill.name, skill.dir, skill.description, ...skill.triggers, ...skill.languages, ...skill.frameworks].join(' ').toLowerCase();
      for (const token of tokens) {
        if (skill.name.toLowerCase().includes(token)) score += 8;
        if (skill.dir.toLowerCase().includes(token)) score += 7;
        if (haystack.includes(token)) score += 2;
      }
      if (opts.runtime && skill.actions.some((action) => {
        if (!action.when || !action.when.runtime) return false;
        const allowed = Array.isArray(action.when.runtime) ? action.when.runtime : [action.when.runtime];
        return allowed.includes(opts.runtime);
      })) score += 2;
      return { skill, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
    .slice(0, 10);
  if (opts.json) {
    const payload = skills.map((item) => ({ name: item.skill.name, score: item.score, level: item.skill.level, support_tier: item.skill.support_tier || null, capability_id: capabilityMap.get(item.skill.dir) ? capabilityMap.get(item.skill.dir).id : null }));
    assertNamedContract('skill-runner-match', payload);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  for (const item of skills) {
    const capability = capabilityMap.get(item.skill.dir);
    console.log(`${item.skill.name}	${item.score}	${item.skill.level}	${item.skill.support_tier || 'tier4'}	${capability ? capability.kind : 'general'}	${item.skill.description}`);
  }
}

function runScaffold(root, name, opts) {
  const skill = resolveSkill(root, name);
  if (!skill) throw new Error(`Unknown skill: ${name}`);
  const { result, runtime, policy } = scaffoldSkill(root, skill, opts);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const text = formatScaffoldOutput({ result, skill, runtime, policy });
  if (text) console.log(text);
}

function listCapabilities(root, opts) {
  const registry = buildCapabilityRegistry(root);
  let items = registry.capabilities;
  if (opts.source) items = items.filter((item) => item.source_type === String(opts.source));
  if (opts.kind) items = items.filter((item) => item.kind === String(opts.kind));
  if (opts.mode) items = items.filter((item) => item.execution_mode === String(opts.mode));
  if (opts['support-tier']) items = items.filter((item) => String(item.support_tier || 'tier4') === String(opts['support-tier']));
  if (opts.json) {
    assertNamedContract('skill-runner-capabilities', items);
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  for (const item of items) console.log(`${item.id}	${item.source_type}	${item.execution_mode}	${item.support_tier || 'tier4'}	${item.kind}	${item.description || item.entrypoint || ''}`);
}

function usage() {
  console.log([
    'Usage:',
    '  node scripts/skill-runner.js list [--level L3] [--runtime node] [--support-tier tier1] [--json]',
    '  node scripts/skill-runner.js show <skill> [--json]',
    '  node scripts/skill-runner.js match --query "add endpoint" [--runtime python] [--json]',
    '  node scripts/skill-runner.js scaffold <skill> --root <project> --var key=value [--template id] [--dry-run] [--force] [--strategy-bias conservative|balanced|accelerated] [--bundle-mode auto|minimal|standard|full] [--integration-mode auto|apply|plan|skip] [--benchmark-aware] [--json]',
    '  node scripts/skill-runner.js capabilities [--source agent|skill|script] [--mode agent|hybrid|script|document] [--support-tier tier1|tier2|tier3|tier4] [--kind planner|implementer|reviewer|verifier|releaser|transformer|general] [--json]',
    '',
    'Notes:',
    '  - Skills may scaffold one file or a multi-file bundle.',
    '  - Auto bundle policy: conservative => minimal bundle + planned integration, balanced => standard bundle + applied integration, accelerated => full bundle + applied integration.',
    '  - Common derived variables: {{kebab_name}}, {{snake_name}}, {{camel_name}}, {{pascal_name}}, {{subject}}, {{class_name}}.',
  ].join('\n'));
}

function main(argv = process.argv) {
  const opts = parseSkillRunnerArgs(argv);
  const root = path.resolve(__dirname, '..');
  const command = opts._[0] || 'list';

  if (command === 'list') return listSkills(root, opts);
  if (command === 'show') return showSkill(root, opts._[1], opts);
  if (command === 'match') return matchSkill(root, opts.query || opts._[1], opts);
  if (command === 'capabilities') return listCapabilities(root, opts);
  if (command === 'scaffold') return runScaffold(root, opts._[1], opts);
  if (command === 'help' || command === '--help' || command === '-h') return usage();
  throw new Error(`Unknown subcommand: ${command}`);
}

module.exports = {
  parseSkillRunnerArgs,
  listSkills,
  showSkill,
  matchSkill,
  runScaffold,
  listCapabilities,
  usage,
  main,
};

if (require.main === module) {
  try {
    if (process.env.EOC_LEGACY_WRAPPER !== '1') require('./internal-tools.js').main([process.argv[0], process.argv[1], 'skill-runner', ...process.argv.slice(2)]);
    else main();
  } catch (error) {
    console.error(`[skill-runner] ${error.message}`);
    process.exit(1);
  }
}
