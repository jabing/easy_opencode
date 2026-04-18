# Ecosystem Bundles And Presets

Easy OpenCode keeps its day-to-day kernel slim, but it now exposes an explicit ecosystem layer for managed automation.

## Bundles

Bundles are the lowest-level managed ecosystem unit. A bundle contributes a known set of workflow defaults:

- commands it influences
- hooks it enables
- workspace signals it responds to
- automation policy hints it adds

Current built-in bundles:

- `node-service`
- `release-governance`
- `lsp-refactor`
- `mcp-devtools`

Bundle intent is stored in `.opencode/ecosystem.json` through:

- `enabled_bundles`
- `disabled_bundles`
- `applied_bundles`

## Presets

Presets are product-facing combinations of bundles. They are designed for the explicit bootstrap flow rather than for low-level day-to-day bundle mutation.

Current built-in presets:

- `node-solo`
- `node-team`
- `node-platform`
- `release-governance`

Preset resolution expands to bundle plans deterministically. For example:

- `node-team` -> `node-service`, `release-governance`, `lsp-refactor`
- `node-platform` -> `node-service`, `release-governance`, `lsp-refactor`, `mcp-devtools`

## Recommendation Model

Recommendations are split into two layers:

- bundle recommendations
  - detector-driven, granular, and explainable
- preset recommendations
  - mode-aware product defaults such as `team + node -> node-team`

Disabled bundles always win over inferred recommendations. If a preset requires a disabled bundle, that preset is not recommended.

## Surfaces

- `eoc ecosystem`
  - inspect and manage state
- `eoc bootstrap`
  - preview or apply preset-driven defaults
- `eoc doctor --bootstrap`
  - diagnostic handoff that adds bootstrap preview to the doctor plan without mutating state
