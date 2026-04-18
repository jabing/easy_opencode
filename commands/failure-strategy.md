---
description: Classify coder-loop failures and choose the next recovery strategy
agent: eoc_orchestrator
subtask: true
---

# Failure Strategy Command

Use this after a failing coder-loop round to decide whether to keep fixing, rebuild context, repair the environment, review, or roll back.

## Core Usage

```bash
# Inspect the latest coder-loop run
node bin/eoc-script.js failure-strategy report

# Inspect a specific run in machine-readable form
node bin/eoc-script.js failure-strategy report --run-id <run-id> --json
```

## What It Decides

- whether the current failures are local and worth another fix round
- whether the context is stale and should be rebuilt
- whether the failure is environmental or dependency-related
- whether a linked snapshot makes rollback safer than continuing
- whether validation is green and the task should move to `/review-gate`

## Signals It Uses

- failing check kinds and failure categories
- number of touched files and blast radius
- repeated identical failure fingerprints across rounds
- regression spikes between rounds
- environment and dependency error patterns
- linked implementation plan and safety snapshot availability
- benchmark-aware risk feedback for the current runtime/framework/task family
