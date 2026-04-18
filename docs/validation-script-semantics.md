# Validation Script Semantics

Batch 1 separates repository validation semantics from the overloaded `lint` and `build` names without breaking existing automation.

## Preferred repository maintenance commands

- `npm run check:metadata` validates command/skill metadata consistency.
- `npm run syntax-check` validates JavaScript/TypeScript parseability.
- `npm run check:repo` validates repository assets, generated config, and asset references.

## Compatibility bridges

- `npm run lint` now runs `check:metadata` and `syntax-check` together.
- `npm run build` now runs `check:repo` and `npm pack --dry-run` together.

These compatibility bridges keep release automation stable while later batches introduce a dedicated lint stack and a more explicit production build pipeline.

## Legacy direct entrypoints

The legacy single-purpose checks remain available for downstream consumers that still reference them directly:

- `npm run lint:legacy`
- `npm run build:legacy`
