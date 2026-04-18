---
description: Inspect and manage ecosystem bundles, recommendations, and bootstrap state
agent: eoc_orchestrator
subtask: true
---

# Ecosystem Command

Manage Easy OpenCode ecosystem state for this repository: $ARGUMENTS

## Usage

- `status` shows persisted ecosystem state and derived recommendations
- `list` shows built-in bundles
- `recommend` previews recommended bundles without mutating state
- `enable --bundle <id>` explicitly enables bundles
- `disable --bundle <id>` explicitly disables bundles
- `apply --bundle <id>` applies bundle changes to managed ecosystem state

Prefer this command for ecosystem posture and bootstrap management. Keep `bootstrap` hidden until the dedicated flow is implemented.
