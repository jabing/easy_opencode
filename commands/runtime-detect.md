---
description: Detect project runtime, framework, and validation commands
agent: repo-aware-coder
subtask: true
---

# Runtime Detect Command

Inspect this repository and detect the active runtime, language, framework, and validation commands: $ARGUMENTS

## Workflow

1. Run the runtime detector:

```bash
node bin/eoc-script.js detect-project-runtime --json
```

2. Read the JSON profile.
3. Summarize:
   - runtime and language
   - framework and package manager
   - validation commands that should be used for implementation and repair loops
4. Call out any missing build/test/lint/typecheck gaps.

## Required Output

### Runtime Profile
### Validation Commands
### Missing Tooling / Gaps
### Suggested Next Step

## Guardrails

- Prefer detected commands over guessed commands.
- Flag weak or missing validation coverage explicitly.
- Keep the summary actionable for the next coding step.
