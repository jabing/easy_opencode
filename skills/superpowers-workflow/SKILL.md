---
name: superpowers-workflow
description: Use this skill for disciplined agent execution: clarify -> plan -> execute -> verify -> summarize. Inspired by public command-framework patterns.
origin: EOC
---

# Superpowers Workflow Skill

## When to Activate

- Complex implementation requiring strict execution discipline
- Multi-step debugging/refactor flows with risk of scope drift
- Tasks that benefit from explicit role/phase transitions

## Operating Loop

1. Clarify: restate requirements and constraints.
2. Plan: build ordered steps with risks and checks.
3. Execute: perform smallest safe increments.
4. Verify: run tests/checks after each increment.
5. Summarize: decisions, artifacts, remaining risks.

## Open-Source Benchmarks

Reference projects for `superpowers-workflow` optimization:

- [SuperClaude-Org/SuperClaude_Framework](https://github.com/SuperClaude-Org/SuperClaude_Framework) - Command/persona/methodology orchestration patterns.
- [microsoft/playwright](https://github.com/microsoft/playwright) - Strong verification discipline for end-to-end behavior.

### Optimization Guidance
- Encode phase transitions as explicit command boundaries.
- Keep each execution step paired with a verification step.
- Prefer deterministic checks over subjective completion claims.

## Acceptance Criteria

- Inputs: Explicit task objective, constraints, and success conditions.
- Outputs: Phase-structured execution artifacts (plan, implementation, verification notes).
- Validation: Each major step has at least one objective check.
- Done: No unresolved blockers; residual risks are documented.

## Skill Metadata

- Owner: `easy-opencode-team`
- Version: `1.0.0`
- Last Reviewed: `2026-04-11`
- Stability: `stable`
- Overlap Domain: `execution-discipline`
