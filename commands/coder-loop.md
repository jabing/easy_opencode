---
description: Run a repo-aware implementation loop for TS/JS changes with validation feedback
agent: ts-coder
subtask: true
---

# Coder Loop Command

Implement and validate this task using the repo-aware coder loop: $ARGUMENTS

## Workflow

1. Build context first.
2. Make the smallest correct code change.
3. Run the coder loop.
4. Fix only the failing checks.
5. Repeat until all checks are green or the remaining blocker is clearly external.

## Commands

```bash
# Create or refresh implementation context
node bin/eoc-script.js prepare-implementation-context --objective "$ARGUMENTS" --targets <comma-separated-files> --strategy-bias conservative|balanced|accelerated --out .opencode/implementation/context.json --json

# Run the current validation loop and emit a repair brief
node bin/eoc-script.js coder-loop run --objective "$ARGUMENTS" --targets <comma-separated-files> --strategy-bias conservative|balanced|accelerated --emit-prompt

# After edits, rerun the same loop
node bin/eoc-script.js coder-loop run --run-id <run-id> --emit-prompt

# Inspect loop state
node bin/eoc-script.js coder-loop status --run-id <run-id>
```

## Implementation Rules

- Keep edits local to target files and directly related tests.
- Prefer AST-based edits for symbol renames/import adjustments. In high-risk buckets, follow the emitted AST edit mode and stay surgical by default.
- Only widen file scope when the current failures prove it is necessary.
- Always quote the specific failing check before the next edit.

## Done Criteria

- Typecheck/build/test/lint checks detected by the repo are green
- No new unrelated file churn
- Final summary includes changed files, validations run, and residual risks
