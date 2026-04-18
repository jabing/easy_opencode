#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { readAllSkills } = require('../src/core/skills/manifest.js');
const { writeCapabilityRegistry } = require('../src/core/capabilities/registry.js');
const { validateSkillMetadata } = require('../src/core/quality/skill-metadata.js');
const { deriveRuntimeSupport } = require('../src/core/skills/runtime-hints.js');

const ROOT = process.cwd();

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) {
      opts._.push(t);
      continue;
    }
    const k = t.slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith('--')) opts[k] = true;
    else {
      opts[k] = n;
      i += 1;
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv);
  const quiet = opts.quiet === true;
  const shouldWrite = opts['no-write'] ? false : true;
  const shouldCheck = opts['no-check'] ? false : true;
  const outPath = path.resolve(ROOT, String(opts.write || path.join('skills', 'registry.json')));
  const capabilityOutPath = path.resolve(ROOT, String(opts['capabilities-write'] || path.join('capabilities', 'registry.json')));
  const skillsDir = path.join(ROOT, 'skills');

  if (!fs.existsSync(skillsDir)) {
    console.error('[skill-registry] skills directory not found.');
    process.exit(1);
  }

  const failures = [];
  const warnings = [];
  const metadataValidation = validateSkillMetadata(ROOT);
  const names = new Map();
  const items = readAllSkills(ROOT).map((skill) => {
    const key = skill.name || skill.dir;
    names.set(key, (names.get(key) || 0) + 1);
    if (!skill.files.manifest) warnings.push(`${skill.dir}: missing manifest.json`);
    if (skill.upstream && !skill.upstream.repository) warnings.push(`${skill.dir}: UPSTREAM.md missing repository`);
    const routing = deriveRuntimeSupport(skill);
    return {
      dir: skill.dir,
      name: skill.name,
      description: skill.description,
      origin: skill.origin,
      version: skill.version,
      level: skill.level,
      executable: skill.executable,
      support_tier: skill.support_tier,
      support_scope: skill.support_scope,
      runtimes: skill.runtimes,
      languages: skill.languages,
      frameworks: skill.frameworks,
      triggers: skill.triggers,
      verify: skill.verify,
      routing_support: routing,
      assets: skill.assets,
      upstream: skill.upstream,
      files: skill.files,
    };
  });

  for (const [name, count] of names.entries()) {
    if (count > 1) failures.push(`duplicate skill name: ${name}`);
  }

  const countsByLevel = { L1: 0, L2: 0, L3: 0 };
  const countsBySupportTier = { tier1: 0, tier2: 0, tier3: 0, tier4: 0 };
  for (const item of items) {
    countsByLevel[item.level] = (countsByLevel[item.level] || 0) + 1;
    countsBySupportTier[item.support_tier || 'tier4'] = (countsBySupportTier[item.support_tier || 'tier4'] || 0) + 1;
  }

  failures.push(...metadataValidation.failures);
  warnings.push(...metadataValidation.warnings);

  const registry = {
    generated_at: new Date().toISOString(),
    counts: {
      total_dirs: items.length,
      indexed: items.length,
      failures: failures.length,
      warnings: warnings.length,
      by_level: countsByLevel,
      by_support_tier: countsBySupportTier,
      executable: items.filter((item) => item.executable).length,
      metadata_failures: metadataValidation.failures.length,
      metadata_warnings: metadataValidation.warnings.length,
    },
    metadata_validation: { ok: metadataValidation.ok, failures: metadataValidation.failures, warnings: metadataValidation.warnings },
    skills: items.sort((a, b) => a.dir.localeCompare(b.dir)),
  };

  if (shouldWrite) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
    writeCapabilityRegistry(ROOT, capabilityOutPath);
  }

  if (shouldCheck && failures.length) {
    for (const message of failures) console.error(`[skill-registry] ERROR ${message}`);
    for (const message of warnings) console.warn(`[skill-registry] WARN ${message}`);
    process.exit(1);
  }

  if (!quiet) {
    console.log(`[skill-registry] indexed ${registry.counts.indexed} skills (${registry.counts.executable} executable)`);
    if (shouldWrite) {
      console.log(`[skill-registry] wrote ${path.relative(ROOT, outPath)}`);
      console.log(`[skill-registry] wrote ${path.relative(ROOT, capabilityOutPath)}`);
    }
    for (const message of warnings) console.warn(`[skill-registry] WARN ${message}`);
  }
}

main();
