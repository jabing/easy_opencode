#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function countCommands() {
  const dir = path.join(ROOT, 'commands');
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.md')).length;
}

function countSkills() {
  const dir = path.join(ROOT, 'skills');
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md'))).length;
}

function countAgentsFromInstall() {
  const installPath = path.join(ROOT, 'scripts', 'install.js');
  const text = fs.readFileSync(installPath, 'utf8');
  const m = text.match(/function buildAgents\([^)]*\)\s*\{\s*return\s*\{([\s\S]*?)\n\s*\}\s*\}/);
  if (!m) throw new Error('cannot parse buildAgents() in scripts/install.js');
  const body = m[1];
  const keys = [
    ...body.matchAll(/^\s{4}(?:'([^']+)'|([a-zA-Z0-9_-]+))\s*:\s*\{/gm),
  ].map((x) => x[1] || x[2]);
  return keys.length;
}

function parseCountsLine(text, re, label) {
  const m = text.match(re);
  if (!m) throw new Error(`missing count line for ${label}`);
  return { agents: Number(m[1]), skills: Number(m[2]), commands: Number(m[3]) };
}

function assertEq(name, actual, expected, failures) {
  if (actual !== expected) failures.push(`${name} expected=${expected} actual=${actual}`);
}

function main() {
  const actual = {
    agents: countAgentsFromInstall(),
    skills: countSkills(),
    commands: countCommands(),
  };

  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const agentsMd = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  const readmeCounts = parseCountsLine(
    readme,
    /-\s*(\d+)\s+specialized agents[\s\S]*?-\s*(\d+)\+?\s+skills[\s\S]*?-\s*(\d+)\s+commands/i,
    'README.md'
  );
  const agentDocCounts = parseCountsLine(
    agentsMd,
    /with\s+(\d+)\s+specialized agents,\s*(\d+)\+?\s+skills,\s*(\d+)\s+commands/i,
    'AGENTS.md'
  );
  const pkgCounts = parseCountsLine(
    String(pkg.description || ''),
    /with\s+(\d+)\s+specialized agents,\s*(\d+)\+?\s+skills,\s*(\d+)\s+commands/i,
    'package.json description'
  );

  const failures = [];
  for (const [doc, counts] of [
    ['README.md', readmeCounts],
    ['AGENTS.md', agentDocCounts],
    ['package.json', pkgCounts],
  ]) {
    assertEq(`${doc}:agents`, counts.agents, actual.agents, failures);
    assertEq(`${doc}:skills`, counts.skills, actual.skills, failures);
    assertEq(`${doc}:commands`, counts.commands, actual.commands, failures);
  }

  if (failures.length > 0) {
    console.error('[metadata-check] FAIL');
    failures.forEach((f) => console.error(`- ${f}`));
    process.exit(1);
  }

  console.log(
    `[metadata-check] PASS agents=${actual.agents} skills=${actual.skills} commands=${actual.commands}`
  );
}

main();
