---
name: claude-public-tooling
description: Public-feature parity guidance for Claude-style coding tools using official docs only (slash commands, hooks, MCP, context compaction, health checks).
origin: EOC
---

# Claude Public Tooling Parity Skill

## When to Activate

- Upgrading OpenCode plugin capabilities against public Claude tooling features
- Designing command/hook/MCP behaviors for safer, more predictable workflows
- Auditing parity gaps across coding assistants

## Public Capability Areas

- Slash commands and command ergonomics
- Session/context compaction strategy
- MCP integration and permission boundaries
- Health diagnostics and environment validation

## Open-Source Benchmarks

Reference projects for `claude-public-tooling` optimization:

- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) - Cross-tool command workflow patterns.
- [SuperClaude-Org/SuperClaude_Framework](https://github.com/SuperClaude-Org/SuperClaude_Framework) - Public command framework and methodology patterns.

### Optimization Guidance
- Only adopt capabilities from official/publicly documented behavior.
- Separate feature parity from vendor-specific private implementation details.
- Prefer auditable config-driven behavior over implicit heuristics.

## Acceptance Criteria

- Inputs: Target tool behavior, current plugin capability map, and compatibility constraints.
- Outputs: Concrete parity diff and implementation plan/patches.
- Validation: Feature behavior verified through reproducible command flows.
- Done: Public parity improved without relying on non-public implementation details.

## Skill Metadata

- Owner: `easy-opencode-team`
- Version: `1.0.0`
- Last Reviewed: `2026-04-11`
- Stability: `stable`
- Overlap Domain: `tooling-parity`
