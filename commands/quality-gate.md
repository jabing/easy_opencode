# Quality Gate Command

Run production-focused quality checks before merge/commit.

## Usage

```bash
# Fast mode (default): structural + static + metadata checks
node scripts/quality-gate.js

# Full mode: include lint/test/build/typecheck scripts when present
node scripts/quality-gate.js --full

# Strict mode: warnings also fail the gate
node scripts/quality-gate.js --strict

# JSON output for CI aggregation
node scripts/quality-gate.js --json
```

## Checks

- Required files (`package.json`, `.gitignore`)
- `package.json` parse validity
- Static scan for risky patterns:
  - `debugger`
  - test `.only(...)`
  - possible hardcoded credentials
  - debug traces / TODO/FIXME (warning by default)
- Skill inventory gate:
  - validate skill structure and metadata via `scripts/skill-registry.js`
  - generate `skills/registry.json` for version/source tracking
- Metadata consistency gate:
  - validate counts in `README.md`, `AGENTS.md`, and `package.json` description
  - compare against actual command/skill/agent assets
- Optional full script checks:
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`

## Goal

Use fast mode during inner loop; use `--full` before commit/PR for stronger confidence.
