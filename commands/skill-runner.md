---
description: Discover, match, and scaffold executable skills
agent: eoc_orchestrator
---

# Skill Runner

Use the skill runner to discover executable skills and scaffold common development assets: $ARGUMENTS

## Common Flows

### List executable skills
```bash
node scripts/skill-runner.js list --level L3
```

### Match a skill to a request
```bash
node scripts/skill-runner.js match --query "$ARGUMENTS"
```

### Inspect a skill
```bash
node scripts/skill-runner.js show add-unit-test --json
```

### Scaffold from a skill
```bash
node scripts/skill-runner.js scaffold add-unit-test --root . --out tests/{{name}}.test.ts --var name=user-service --var subject=UserService
```

### Scaffold with policy control
```bash
node scripts/skill-runner.js scaffold add-express-route --root . --var name=health-check --strategy-bias conservative --bundle-mode minimal --integration-mode plan --dry-run --json
```

### Let benchmark history choose the policy
```bash
node scripts/skill-runner.js scaffold add-express-route --root . --var name=health-check --benchmark-aware --objective "add health endpoint" --json
```

## Operating Rules

1. Prefer `list` and `match` before scaffolding when the best skill is unclear.
2. Prefer `--dry-run --json` before writing into unfamiliar repositories.
3. Use `--root` to target the actual project when running from a nested working directory.
4. Preserve existing files unless the user explicitly asked to overwrite them. Use `--force` only when replacement is intended.
5. Use policy controls when risk is elevated:
   - `conservative` → smaller bundle, planned integration only
   - `balanced` → standard bundle, applied integration
   - `accelerated` → full bundle, applied integration
6. After scaffolding, run the suggested verify commands and refine the generated file.

## Expected Outcome

- The selected skill should map to the detected runtime when possible.
- The generated bundle depth and integration updates can now vary with explicit policy or benchmark-aware policy.
- Follow with `/coder-loop`, `/build-fix`, or `/code-review` for refinement.
