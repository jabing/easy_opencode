---
description: Run the end-to-end implementation pipeline from skill match to coder loop
agent: eoc_orchestrator
subtask: true
---

# Implement Task Command

Use the integrated implementation pipeline for this task: $ARGUMENTS

## Goal

Turn a request into a concrete execution packet by chaining:

1. runtime detection
2. skill matching
3. risk-aware scaffold generation
4. repo-aware implementation context
5. coder loop validation and repair brief

## Core Flow

```bash
# Plan + detect + match + run initial validation
node bin/eoc-script.js implement-task run --objective "$ARGUMENTS" --emit-prompt

# Plan + scaffold from an explicit executable skill
node bin/eoc-script.js implement-task run --objective "$ARGUMENTS" --skill add-express-route --scaffold --var name=health --var route=/health --var method=GET --emit-prompt

# Force a safer scaffold policy when needed
node bin/eoc-script.js implement-task run --objective "$ARGUMENTS" --skill add-express-route --scaffold --bundle-mode minimal --integration-mode plan --emit-prompt

# Inspect the saved packet later (defaults to latest plan if omitted)
node bin/eoc-script.js implement-task status --plan-id <plan-id>
node bin/eoc-script.js implement-task status

# Reprint the current repair brief
node bin/eoc-script.js implement-task next-prompt --plan-id <plan-id>
node bin/eoc-script.js implement-task next-prompt
```

## When To Use It

- The task needs both planning and implementation context.
- You want the plugin to choose the most likely executable skill before editing.
- You want one entrypoint that leaves behind a saved packet and repair brief.
- You are starting a new feature, endpoint, module, test, or focused bug fix.

## Operating Rules

1. Prefer `run` without `--scaffold` first when the target files are unclear.
2. Use `--skill ... --scaffold` when you already know the high-confidence executable skill.
3. The command now applies benchmark-aware scaffold policy automatically:
   - high-risk buckets bias toward smaller bundles and planned integration updates
   - low-risk improving buckets can keep fuller scaffolds
4. Treat generated scaffold files as starting points, then refine with the repair brief.
5. Keep the target file set narrow and feed the same objective back into `/coder-loop` until green.
6. If the matched skill is weak or generic, fall back to context-driven coding rather than forcing scaffolds.

## Expected Output

- a saved implementation plan id (and latest-plan pointer)
- selected skill and alternatives
- scaffold policy and integration depth when scaffolding runs
- context packet path
- next prompt / repair brief path
- current coder-loop status and failing checks
