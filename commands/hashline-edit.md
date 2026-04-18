---
description: Hash-anchored guarded line editing (annotate + apply with hash validation)
agent: eoc_orchestrator
subtask: true
---

# Hashline Edit Command

Apply safe line edits that are rejected if file context has changed.

## Usage

```bash
# Annotate file with hash anchors
node scripts/hashline-edit.js annotate --file src/app.ts

# Apply guarded patch
node scripts/hashline-edit.js apply --file src/app.ts --patch patch.json
```

## Patch Format

```json
{
  "edits": [
    { "line": 12, "hash": "abc123ef", "text": "const enabled = true;" }
  ]
}
```

If a line hash does not match current file content, apply fails and no changes are written.
