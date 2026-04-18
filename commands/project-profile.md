---
description: Inspect detailed project profile, framework, toolchain, and validation gaps
agent: repo-aware-coder
subtask: true
---

# Project Profile Command

Inspect this repository and produce a detailed implementation profile: $ARGUMENTS

## Workflow

1. Run the project profiler:

```bash
node bin/eoc-script.js project-profile --json
```

2. Read the JSON profile.
3. Summarize:
   - runtime, language, framework, and app type
   - package manager, build/test/lint/typecheck/format tools
   - repo shape, entrypoints, and important config files
   - validation gaps and profile notes that should influence implementation strategy

## Required Output

### Runtime and Framework
### Toolchain Summary
### Repo Shape and Entrypoints
### Validation Gaps
### Recommended Implementation Strategy

## Guardrails

- Prefer detected tools over guessed commands.
- Call out framework-specific constraints clearly.
- If validation coverage is weak, say exactly which command types are missing.
