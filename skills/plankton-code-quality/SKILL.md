# Plankton Code Quality Skill

Write-time code quality enforcement with automatic formatting and linting.

## When to Activate

- After writing/editing code
- Before committing changes
- When quality issues are detected

## What It Does

1. **Auto-format** - Runs Prettier/formatter on edited files
2. **Lint check** - Runs ESLint/Ruff/linter
3. **Auto-fix** - Attempts to fix issues automatically
4. **Report** - Shows remaining issues that need manual attention

## Configuration

Uses .prettierrc for formatting rules.

## Usage

/plankton              # Full quality check
/plankton --format     # Format only
/plankton --lint       # Lint only
/plankton --fix        # Auto-fix issues

## Supported Languages

- TypeScript/JavaScript
- Python
- JSON/YAML
- Markdown

## Open-Source Benchmarks

Reference projects for `plankton-code-quality` optimization:

- [fastapi/fastapi](https://github.com/fastapi/fastapi) - Clear API contracts, validation-first handlers.
- [prisma/prisma](https://github.com/prisma/prisma) - Strong schema modeling and migration discipline.

### Optimization Guidance
- Keep contract-first endpoint specs close to implementation.
- Use explicit error envelopes and typed validation boundaries.
- Document performance and consistency trade-offs per pattern.

## Acceptance Criteria

- Inputs: Clear task scope, target files/systems, and explicit constraints.
- Outputs: Concrete artifact (code/doc/config/decision) aligned with this skill domain.
- Validation: At least one executable check or deterministic review step is defined and run.
- Done: Result is actionable, non-contradictory with adjacent skills, and mapped to user intent.

## Skill Metadata

- Owner: `easy-opencode-team`
- Version: `1.0.0`
- Last Reviewed: `2026-04-11`
- Stability: `stable`
- Overlap Domain: `quality`

