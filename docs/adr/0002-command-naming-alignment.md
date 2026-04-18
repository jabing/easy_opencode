# ADR 0002: Align command naming with current capability

## Status
Accepted

## Context
The existing `typecheck` script performs syntax and parse validation, not full semantic type analysis.

## Decision
Batch 1 introduces an explicit `syntax-check` command and keeps `typecheck` as a backward-compatible alias.

## Consequences
- Existing automation remains compatible.
- New documentation and future migration work can distinguish syntax validation from real TypeScript type checking.
