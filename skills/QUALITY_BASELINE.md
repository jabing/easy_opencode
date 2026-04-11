# Skills Quality Baseline

This document defines the minimum quality bar for every `skills/*/SKILL.md` file.

## Required Sections

Every skill must include these sections:

1. `## When to Activate`
2. `## Acceptance Criteria`
3. `## Skill Metadata`
4. `## Open-Source Benchmarks`

## Acceptance Criteria Standard

Each skill must explicitly define all of the following:

- Input boundary: what context is required before using the skill.
- Output contract: what concrete deliverable the skill must produce.
- Validation steps: commands/checks used to verify correctness.
- Done condition: objective pass/fail criteria.

Recommended template:

```md
## Acceptance Criteria
- Inputs: [required context, files, constraints]
- Outputs: [artifact produced]
- Validation: [commands/checks]
- Done: [objective conditions]
```

## Metadata Standard

Use this exact structure:

```md
## Skill Metadata
- Owner: `easy-opencode-team`
- Version: `1.0.0`
- Last Reviewed: `YYYY-MM-DD`
- Stability: `stable|beta|experimental`
- Overlap Domain: `domain-name`
```

## Governance Rules

- Keep each skill focused on one domain outcome.
- Avoid duplicating complete workflows across skills.
- Reference canonical alternatives in overlapping skills.
- Update `Last Reviewed` whenever behavior or references change.

## CI / Audit Gate

Use `scripts/skills-audit.js` to enforce section presence:

```bash
node scripts/skills-audit.js
```

Audit must pass before release.
