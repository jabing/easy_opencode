---
description: Summarize plugin observability events and benchmark trends
agent: eoc_orchestrator
subtask: true
---

# Observability Report Command

Summarize event streams, benchmark trends, and the latest batch-over-batch comparison: $ARGUMENTS

## Core Commands

```bash
# Full observability summary
node bin/eoc-script.js observability-report report --json

# Browse recent events of a given type
node bin/eoc-script.js observability-report events --type coder-loop.round --limit 20

# Show recent benchmark runs
node bin/eoc-script.js observability-report benchmarks --limit 10

# Compare the latest two benchmark runs
node bin/eoc-script.js observability-report benchmark-compare

# Show bucketed benchmark trends by framework
node bin/eoc-script.js observability-report benchmark-trends --group-by framework --json
```

## What It Shows

- event counts by type / flow / status
- recent objectives and execution trails
- benchmark pass rate and task success rate
- average failed-count / output-count trends
- latest benchmark comparison, including improved and regressed cases
- bucketed benchmark trend summaries by runtime / framework / runtime+framework

Use `benchmark-trends` for grouped trend views across recent benchmark runs, including `runtime`, `framework`, `runtime-framework`, `skill-family`, and `skill`.
