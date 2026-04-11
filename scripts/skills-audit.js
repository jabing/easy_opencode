#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const skillsDir = path.join(root, 'skills');

const requiredHeaders = [
  '## When to Activate',
  '## Acceptance Criteria',
  '## Skill Metadata',
  '## Open-Source Benchmarks'
];

const dirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
const failures = [];

for (const dir of dirs) {
  const file = path.join(skillsDir, dir, 'SKILL.md');
  if (!fs.existsSync(file)) {
    failures.push({ skill: dir, issue: 'missing SKILL.md' });
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');
  for (const header of requiredHeaders) {
    const pattern = new RegExp('^' + header.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '$', 'm');
    if (!pattern.test(content)) {
      failures.push({ skill: dir, issue: 'missing section: ' + header });
    }
  }

  const metadataChecks = ['- Owner:', '- Version:', '- Last Reviewed:', '- Stability:', '- Overlap Domain:'];
  if (/^## Skill Metadata/m.test(content)) {
    for (const check of metadataChecks) {
      if (!content.includes(check)) {
        failures.push({ skill: dir, issue: 'incomplete metadata field: ' + check });
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Skill audit failed. Issues found: ' + failures.length);
  for (const f of failures) {
    console.error('- ' + f.skill + ': ' + f.issue);
  }
  process.exit(1);
}

console.log('Skill audit passed. Checked ' + dirs.length + ' skills.');
