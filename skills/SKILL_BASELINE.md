# Skill Baseline (Strongest/Latest Policy)

This repository follows a curated-skill policy:

- Keep one strongest skill per overlapping domain.
- Remove deprecated or superseded skills.
- Prefer full upstream sync for externally sourced skills.

## Current Decisions

### Kept as Primary

- `ui-ux-pro-max` (upstream-synced full package)
- `continuous-learning-v2` (supersedes v1)
- Core engineering stack skills (`*-patterns`, `*-testing`, security, tdd, verification, deployment)

### Removed as Deprecated / Low-Value / Overlapping

- `continuous-learning` (deprecated, superseded by `continuous-learning-v2`)
- `vue-bigscreen-elite` (overlaps with stronger `ui-ux-pro-max` design layer)
- `token-management` (low-content weak duplicate with stronger context/optimization skills)
- `project-guidelines-example` (template/demo, not production skill)
- `visa-doc-translate` (non-core domain for this coding plugin)
- `liquid-glass-design` (narrow style subset covered by `ui-ux-pro-max`)

## Upgrade Rules

1. Any externally sourced skill must include `UPSTREAM.md` with:
   - source repo
   - license
   - synced commit
   - sync date
2. Any superseded skill must be removed, not just marked deprecated.
3. New skill additions must include:
   - clear non-overlapping domain
   - executable assets if applicable (`scripts/`, `data/`, `templates/`)
   - verification steps.
