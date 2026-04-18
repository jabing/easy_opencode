const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('./shared.js');
const { validateSkillMetadata } = require('./skill-metadata.js');

/** @param {string} root @param {() => string} [now] */
function validateSkillsAndWriteRegistry(root, now = () => new Date().toISOString()) {
  const skillsDir = path.join(root, 'skills');
  if (!fs.existsSync(skillsDir)) return { ok: false, detail: 'skills directory missing' };

  const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  /** @type {string[]} */
  const failures = [];
  const names = new Map();
  /** @type {Array<Record<string, unknown>>} */
  const skills = [];

  for (const dir of dirs) {
    const base = path.join(skillsDir, dir);
    const skillFile = path.join(base, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      failures.push(`${dir}: missing SKILL.md`);
      continue;
    }
    const content = fs.readFileSync(skillFile, 'utf8');
    const fm = /** @type {Record<string, unknown>} */ (parseFrontmatter(content));
    const name = String(fm.name || dir).trim();
    names.set(name, (names.get(name) || 0) + 1);
    skills.push({
      dir,
      name,
      origin: fm.origin || '',
      version: fm.version || '',
      assets: {
        scripts: fs.existsSync(path.join(base, 'scripts')),
        data: fs.existsSync(path.join(base, 'data')),
        templates: fs.existsSync(path.join(base, 'templates')),
      },
    });
  }

  for (const [name, count] of names.entries()) {
    if (count > 1) failures.push(`duplicate skill name: ${name}`);
  }

  const metadataGate = validateSkillMetadata(root);
  const registry = {
    generated_at: now(),
    counts: { total_dirs: dirs.length, indexed: skills.length, failures: failures.length, metadata_failures: metadataGate.failures.length, metadata_warnings: metadataGate.warnings.length },
    skills,
    metadata_validation: { ok: metadataGate.ok, failures: metadataGate.failures, warnings: metadataGate.warnings },
  };
  fs.writeFileSync(path.join(skillsDir, 'registry.json'), JSON.stringify(registry, null, 2) + '\n', 'utf8');
  const combinedFailures = [...failures, ...metadataGate.failures];
  return { ok: combinedFailures.length === 0, detail: combinedFailures.length === 0 ? 'ok' : combinedFailures.join(' | '), failures: combinedFailures, warnings: metadataGate.warnings };
}

module.exports = { validateSkillsAndWriteRegistry };
