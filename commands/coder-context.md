---
description: Prepare a repo-aware implementation packet before editing code
agent: repo-aware-coder
subtask: true
---

# Coder Context Command

Prepare a repo-aware implementation packet for this task: $ARGUMENTS

## Goal

Before editing code, build a compact implementation packet that captures:

- target files
- related tests
- detected validation commands
- recent local failures
- exported symbols and nearby implementation surface

## Workflow

1. Infer the smallest plausible target file set.
2. Generate an implementation packet:

```bash
node bin/eoc-script.js prepare-implementation-context --objective "$ARGUMENTS" --targets <comma-separated-files> --out .opencode/implementation/context.json --json
```

3. Read the generated JSON.
4. Restate the execution plan using the packet, not generic assumptions.
5. Identify the first code edit and the first validation command.

## Required Output

### 1. Target Files
### 2. Related Tests
### 3. Validation Commands
### 4. Risks / Constraints
### 5. First Edit
### 6. First Validation Step

## Guardrails

- Do not start broad refactors.
- Prefer the smallest file set that can satisfy the task.
- Use the packet's validation commands instead of inventing new ones when available.
