---
description: Run benchmark suites for runtime detection, task success, and batch-over-batch comparisons
agent: eoc_orchestrator
subtask: true
---

# Benchmark Suite Command

Run repeatable benchmark suites against one or more real projects and compare task success across plugin batches: $ARGUMENTS

## Core Commands

```bash
# Generate a starter suite file with task-level expectations
node bin/eoc-script.js benchmark-suite sample --out benchmarks.sample.json

# Run the suite and fail the command if any case fails
node bin/eoc-script.js benchmark-suite run --suite benchmarks.sample.json

# Run and capture structured output
node bin/eoc-script.js benchmark-suite run --suite benchmarks.sample.json --json

# Compare two benchmark runs by run id or file path
node bin/eoc-script.js benchmark-suite compare --baseline <run-id> --current <run-id> --json

# Compare the latest two benchmark runs automatically
node bin/eoc-script.js benchmark-suite compare --latest --json

# Summarize bucketed trends across recent benchmark runs
node bin/eoc-script.js benchmark-suite trend --group-by runtime-framework --json
```

## What It Measures

- runtime detection correctness
- selected skill correctness
- task-bundle scaffold success
- output/update counts for generated task artifacts
- initial coder-loop status and failed-count budget
- optional merge-gate verdicts for task readiness
- pass/fail and task-success deltas across benchmark runs
- bucketed trends by runtime / framework / runtime+framework across recent runs

## Recommended Workflow

1. Generate a starter suite.
2. Point each case at a real project root.
3. Add expectations for runtime, framework, selected skill, minimum outputs, and optional merge-gate verdict.
4. Run the suite after every major plugin batch.
5. Use `benchmark-suite compare --latest` to measure whether pass rate, task success rate, and failure counts improved or regressed.
6. Use `benchmark-suite trend --group-by runtime-framework` to see which language/framework buckets are improving, stable, or regressing over time.
7. Use `benchmark-suite trend --group-by skill-family` or `--group-by skill` to measure which task families and specific scaffold skills are getting stronger or weaker over time.
