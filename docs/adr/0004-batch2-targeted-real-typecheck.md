# ADR 0004: Targeted real typecheck for batch 2

## Status
Accepted

## Context
Batch 1 introduced a `src/` layering skeleton and compatibility wrappers. The next risk was that the repository still used `typecheck` to mean syntax-only validation, which overstated the actual guarantee.

A full-repo TypeScript migration would expand scope too far for the second batch and would force large legacy scripts into strict typing prematurely.

## Decision
Batch 2 adds a real typecheck boundary without widening scope unnecessarily:

- keep `syntax-check` as syntax-only validation
- make `typecheck` run real TypeScript diagnostics through `typescript`
- constrain `tsconfig.json` to the new `src/` core, adapter, and CLI files plus local type shims
- keep legacy large scripts outside the strict batch-2 boundary
- preserve existing CLI compatibility

## Consequences
Benefits:

- `typecheck` now matches its name
- core paths have real typed guarantees
- regression risk stays low because legacy scripts remain runtime-compatible

Trade-offs:

- repository-wide typing is not complete yet
- large legacy modules such as `src/core/project-profile.js` remained outside strict checking at that stage

## Stop condition
Batch 2 stops once:

- `node scripts/typecheck.js` passes using real TS diagnostics
- `syntax-check` and `typecheck` are distinct commands
- key regression checks remain green
