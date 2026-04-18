# ADR 0005: Minimal rule engine for shared quality, profile, and risk checks

## Status
Accepted

## Context
Batch 3 aims to reduce repeated heuristic logic without turning the repository into a full platform rewrite.

## Decision
Introduce a minimal shared rule evaluator in `src/core/rules/engine.js` and reuse it in three places:

- quality checks (`src/core/rules/quality-rules.js`)
- project profile guidance (`src/core/rules/project-profile-rules.js`)
- file risk scanning (`src/core/rules/file-risk-rules.js`)

The engine only normalizes findings and aggregates counts. It does not introduce a new build system, persistence layer, or plugin loader.

## Consequences
- Existing CLI entrypoints stay compatible.
- Repeated `if/else` logic is reduced in targeted paths.
- Rule outputs become more explainable and easier to expand later.
- Large legacy scripts are not forced into strict typing during this batch.
