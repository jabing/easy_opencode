---
name: openspec-workflow
description: Use this skill for spec-first delivery with explicit proposal, tasks, implementation, and archive phases. Aligns with OpenSpec style change folders and review gates.
origin: EOC
---

# OpenSpec Workflow Skill

## When to Activate

- New feature requests with ambiguous scope
- Cross-module changes requiring explicit review gates
- Any change needing auditable requirement-to-implementation mapping

## Workflow

1. Create proposal and scope boundaries before code.
2. Define design and task breakdown with acceptance criteria.
3. Implement tasks in order and keep task status current.
4. Archive change by updating canonical specs after completion.

## Folder Convention

```text
openspec/
  specs/
  changes/
    <change-id>/
      proposal.md
      design.md
      tasks.md
      specs/
```

## Open-Source Benchmarks

Reference projects for `openspec-workflow` optimization:

- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) - Spec-driven development with proposal/tasks/spec-delta lifecycle.
- [OpenAPITools/openapi-generator](https://github.com/OpenAPITools/openapi-generator) - Contract-first artifact generation and consistency patterns.

### Optimization Guidance
- Keep spec deltas explicit, small, and reviewable.
- Require acceptance criteria in proposal and tasks.
- Archive completed changes into source-of-truth specs immediately.

## Acceptance Criteria

- Inputs: Clear problem statement, constraints, and impacted modules.
- Outputs: Proposal/design/tasks/spec delta files under `openspec/changes/<id>/`.
- Validation: Task checklist matches implemented commits and tests.
- Done: Change is implemented, validated, and archived into canonical specs.

## Skill Metadata

- Owner: `easy-opencode-team`
- Version: `1.0.0`
- Last Reviewed: `2026-04-11`
- Stability: `stable`
- Overlap Domain: `spec-first`
