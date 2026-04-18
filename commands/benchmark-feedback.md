---
agent: eoc_orchestrator
subtask: true
---

# /benchmark-feedback

Assess current implementation risk using recent benchmark history for the current runtime, framework, task family, and selected skill.

## What it does

- detects the current project profile
- infers the latest plan / selected skill when available
- scores recent benchmark trends
- returns a strategy bias for the orchestrator:
  - `accelerated`
  - `balanced`
  - `conservative`
- suggests whether to require a stronger review gate or fuller validation

## Examples

```bash
node bin/eoc-script.js benchmark-feedback report --json
node bin/eoc-script.js benchmark-feedback report --skill add-express-route --task-family endpoint --json
```
