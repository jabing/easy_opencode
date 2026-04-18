# implement-task skill selection report

`implement-task run --json` now emits a structured `skill_selection_report` designed for tuning, audits, and regression triage.

## Report guarantees

- `selection_basis`: `constraints_then_ranking` for automatic routing, `explicit_override` for `--skill`
- `report_version`: current schema version for machine consumers
- `accepted_candidates`: only candidates that pass hard compatibility constraints unless `--allow-cross-runtime` is set
- `rejected_candidates`: top rejected skills with summaries and failed constraints
- `rejected_by_reason`: rollup counters for runtime/framework mismatch pressure

## Default routing behavior

Automatic routing now applies **constraints before ranking**:

1. runtime compatibility
2. framework compatibility
3. lexical/trigger ranking among remaining candidates

A runtime or framework mismatch is rejected by default.
Cross-runtime candidates are only allowed when the operator passes `--allow-cross-runtime`, and even then the candidate is marked with waived constraints and mismatch penalties.

## Example fields

```json
{
  "report_version": "2.0",
  "selection_basis": "constraints_then_ranking",
  "allow_cross_runtime": false,
  "totals": {
    "evaluated": 51,
    "accepted": 2,
    "rejected": 49
  },
  "rejected_by_reason": {
    "runtime_mismatch": 34,
    "framework_mismatch": 11,
    "other": 4
  }
}
```

Use this report to answer:

- why a skill was selected
- which candidates were rejected and why
- whether a regression came from metadata, routing constraints, or ranking weights
