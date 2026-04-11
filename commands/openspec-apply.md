---
description: Apply an OpenSpec change by executing tasks in order
agent: tdd-guide
subtask: true
---

# OpenSpec Apply

Implement approved OpenSpec change: $ARGUMENTS

## Execution Contract

1. Read `openspec/changes/<change_id>/proposal.md` and `tasks.md` first.
2. Implement tasks in order and mark completion explicitly.
3. Use TDD where practical (RED -> GREEN -> REFACTOR).
4. After each major task, run relevant checks and report results.
5. If scope drift appears, stop and return to proposal/design updates.

## Output

- Completed task checklist
- Changed files
- Test/validation evidence
- Known follow-ups
