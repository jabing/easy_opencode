# ADR 0002: Introduce control-plane as the execution and orchestration layer

## Status
Accepted

## Context
The repository had already moved deterministic checks and reusable rules into `src/core`, but a large amount of orchestration logic still lived in `scripts/lib`. That made the executable wrapper layer harder to reason about and increased the risk that new workflow, scheduler, and kernel logic would bypass the source layout entirely.

## Decision
We formalize a four-layer product kernel:

- `src/core/`: deterministic domain logic, checks, and rules
- `src/adapters/`: process and file-system adapters
- `src/cli/`: command-line rendering and argument handling
- `src/control-plane/`: workflows, kernel state, execution policy, scheduler, and mode-aware orchestration

`scripts/` remains as executable shim and integration tooling only; the temporary `scripts/lib/` wrapper layer was later removed once all internal callers were rewired to `src/`.

## Consequences
- Core logic no longer needs to live in `scripts/lib` to be reusable.
- Workflow, scheduler, and kernel APIs get a stable source-of-truth under `src/control-plane`.
- Future refactors can tighten the remaining wrapper surface instead of expanding it.
