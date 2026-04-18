const fs = require('fs');
const path = require('path');
const { buildEocConfig } = require('../../shared/opencode-config.js');

/** @typedef {{ agents: number, skills: number, commands: number }} MetadataCounts */
/** @typedef {{ ok: boolean, detail: string, actual: MetadataCounts, failures: string[] }} MetadataCheckResult */
/** @typedef {[string, MetadataCounts]} MetadataTuple */

/** @param {string} root */
function countCommands(root) {
  const dir = path.join(root, 'commands');
  return fs.readdirSync(dir, { withFileTypes: true }).filter(/** @param {import('fs').Dirent} entry */ (entry) => entry.isFile() && entry.name.endsWith('.md')).length;
}

/** @param {string} root */
function countSkills(root) {
  const dir = path.join(root, 'skills');
  return fs.readdirSync(dir, { withFileTypes: true }).filter(/** @param {import('fs').Dirent} entry */ (entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'SKILL.md'))).length;
}

/** @param {string} root */
function countAgents(root) {
  const expected = buildEocConfig('.', path.join(root, 'commands'));
  return Object.keys(expected.agent || {}).length;
}

/** @param {string} text @param {RegExp} re @param {string} label */
function parseCountsLine(text, re, label) {
  const match = text.match(re);
  if (!match) throw new Error(`missing count line for ${label}`);
  return { agents: Number(match[1]), skills: Number(match[2]), commands: Number(match[3]) };
}

/** @param {string} name @param {number} actual @param {number} expected @param {string[]} failures */
function assertEq(name, actual, expected, failures) {
  if (actual !== expected) failures.push(`${name} expected=${expected} actual=${actual}`);
}

/** @param {string} root @returns {MetadataCheckResult} */
function validateMetadataConsistency(root = process.cwd()) {
  const actual = {
    agents: countAgents(root),
    skills: countSkills(root),
    commands: countCommands(root),
  };

  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const agentsMd = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  /** @type {MetadataTuple[]} */
  const tuples = [
    ['README.md', parseCountsLine(readme, /-\s*(\d+)\s+specialized agents[\s\S]*?-\s*(\d+)\+?\s+skills[\s\S]*?-\s*(\d+)\s+commands/i, 'README.md')],
    ['AGENTS.md', parseCountsLine(agentsMd, /with\s+(\d+)\s+specialized agents,\s*(\d+)\+?\s+skills,\s*(\d+)\s+commands/i, 'AGENTS.md')],
    ['package.json', parseCountsLine(String(pkg.description || ''), /with\s+(\d+)\s+specialized agents,\s*(\d+)\+?\s+skills,\s*(\d+)\s+commands/i, 'package.json description')],
  ];

  /** @type {string[]} */
  const failures = [];
  for (const [name, tuple] of tuples) {
    assertEq(`${name}:agents`, tuple.agents, actual.agents, failures);
    assertEq(`${name}:skills`, tuple.skills, actual.skills, failures);
    assertEq(`${name}:commands`, tuple.commands, actual.commands, failures);
  }

  return {
    ok: failures.length === 0,
    detail: failures.length === 0 ? `ok agents=${actual.agents} skills=${actual.skills} commands=${actual.commands}` : failures.join(' | '),
    actual,
    failures,
  };
}

module.exports = {
  assertEq,
  countAgents,
  countCommands,
  countSkills,
  parseCountsLine,
  validateMetadataConsistency,
};
