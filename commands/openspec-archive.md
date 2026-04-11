---
description: Archive a completed OpenSpec change and merge spec deltas
agent: doc-updater
subtask: true
---

# OpenSpec Archive

Archive completed change: $ARGUMENTS

## Archive Steps

1. Confirm implementation and validation are complete.
2. Merge approved deltas into `openspec/specs/` source-of-truth files.
3. Move change folder to archive location (or mark archived).
4. Summarize what changed in canonical specs.
5. Record residual risks and deferred work.

## Guardrails

- Refuse archive if tasks are incomplete.
- Refuse archive if acceptance criteria evidence is missing.
