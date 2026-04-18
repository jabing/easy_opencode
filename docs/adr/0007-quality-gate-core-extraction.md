# ADR 0007: Extract quality gate core and keep the script as a thin wrapper

## Status
Accepted

## Context
`quality-gate` had become one of the largest and most critical scripts in the repository. That made the most important engineering gate harder to unit test, harder to type-check incrementally, and harder to align with the newer `src/core + src/cli + adapters` structure.

## Decision
We extracted the main quality-gate logic into `src/core/quality-gate.js` and introduced `src/cli/quality-gate-cli.js` as a dedicated entrypoint. The public script at `scripts/quality-gate.js` now stays as a thin compatibility wrapper.

The extraction keeps behavior stable while creating direct seams for:
- targeted unit tests around static scanning and registry generation
- future migration of remaining legacy helpers into `src/core`
- narrower responsibilities between core logic and CLI process handling

## Consequences
### Positive
- The quality gate no longer depends on a single large script for all behavior.
- Core gate logic can be tested without shelling into the CLI every time.
- Future refactors can migrate `quality-gate` internals in smaller steps.

### Tradeoffs
- Some helper logic still bridges old and new modules.
- The script wrapper remains for backward compatibility, so the repository temporarily contains two entrypoint layers.
