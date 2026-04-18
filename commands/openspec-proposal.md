---
description: Draft an OpenSpec-style change proposal before implementation
agent: eoc_planner
subtask: true
---

# OpenSpec Proposal

Create a spec-first change proposal for: $ARGUMENTS

## Required Output

1. `change_id`: short kebab-case id
2. Scope statement: in-scope / out-of-scope
3. Files to create under `openspec/changes/<change_id>/`:
   - `proposal.md`
   - `design.md` (optional, include if architecture impact exists)
   - `tasks.md`
   - `specs/<domain>/spec.md` delta
4. Acceptance criteria with testability notes
5. Rollout and rollback considerations

## Rules

- Do NOT write production code in this step.
- Highlight assumptions and unresolved questions.
- Keep proposal reviewable in one pass.
