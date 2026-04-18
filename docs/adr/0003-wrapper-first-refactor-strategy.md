# ADR 0003: Use wrapper-first refactoring

## Status
Accepted

## Context
The repository has broad CLI and test coverage. Directly replacing command paths would create unnecessary migration risk.

## Decision
Refactors should first extract reusable modules under `src/` and keep the original `scripts/*.js` files as thin wrappers.

## Consequences
- Batch 1 reduces churn.
- Future batches can replace internals without breaking command contracts.
