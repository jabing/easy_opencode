---
description: Inspect and recover the latest orchestrator entry state
agent: eoc_orchestrator
subtask: true
---

# Orchestrator State Command

Use this to recover the latest entry-agent state before starting a new flow.

## Core Usage

```bash
# Show the latest recoverable state across implement-task, coder-loop, and eoc-start
node bin/eoc-script.js orchestrator-state recover

# Get structured recovery data for automation or debugging
node bin/eoc-script.js orchestrator-state recover --json

# Clear the remembered entry state
node bin/eoc-script.js orchestrator-state clear
```

## What It Recovers

- latest implementation plan id
- latest coder-loop run id
- active gated eoc run id
- active flow summary and suggested continue commands
- resume confidence, drift warnings, and recommended next action
- linked snapshot id when a safe rollback point exists

## When To Use It

- The user says “continue”, “resume”, “keep going”, or “fix the last failure”.
- You want to know whether there is an unfinished implement-task plan.
- You want the entry agent to continue the current workflow instead of starting from scratch.
- You need to know whether the current branch/worktree still matches the recorded plan baseline.
