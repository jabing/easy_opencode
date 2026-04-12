# Skill Registry Command

Generate and validate a structured skill registry with source/version tracking.

## Usage

```bash
# validate and write registry
node scripts/skill-registry.js --check --write skills/registry.json

# write registry only
node scripts/skill-registry.js --no-check --write skills/registry.json

# check only
node scripts/skill-registry.js --check --no-write
```

## Registry Output

- Generated file: `skills/registry.json`
- Includes:
  - skill name, origin, version
  - asset footprint (`scripts`, `data`, `templates`)
  - upstream metadata from `UPSTREAM.md` when available
  - warnings/failures summary

## Purpose

Use this command to keep skill inventory governable and upgrade-ready.
