# ADR 0001: Introduce core / adapters / cli layering for batch 1

## Status
Accepted

## Context
Several scripts mixed domain rules, file-system access, process spawning, and CLI rendering in the same file. That made future TypeScript migration and module testing harder.

## Decision
For batch 1 we introduce a lightweight layered structure:

- `src/core/`: reusable logic and validation rules
- `src/adapters/`: file-system and process helpers
- `src/cli/`: argument parsing and human-readable output
- `src/control-plane/`: workflow orchestration, scheduler, kernel state, and execution policy
- `scripts/`: backward-compatible executable wrappers

## Consequences
- Existing command entrypoints stay stable.
- New work can move gradually instead of forcing a risky full rewrite.
- Core and control-plane modules become easier to test and migrate to stronger typing later.
