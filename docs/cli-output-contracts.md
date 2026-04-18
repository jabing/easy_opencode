# CLI output contracts

This repository now enforces lightweight runtime contracts for the most critical structured outputs.

Protected command families currently include:

- `project-profile --json`
- `quality-gate --json`
- `release-check --json`
- `release-evidence --json`
- `release-rehearsal --json`
- `test-stability --json`
- `observability-report report --json`
- `platform-report report --json`

The goal is not full JSON Schema coverage for every command. Instead, these contracts protect the highest-value machine-consumed entrypoints from accidental field drift during refactors.

## Protected fields

### project-profile
- `runtime`
- `language`
- `framework`
- `confidence`
- `validation[]` with `kind` and `command`

### quality-gate
- `root`
- `gate`
- `counts.pass|fail|warn|skip`
- `results[]` with `status`, `check`, `detail`

### release-check
- `decision`
- `counts.pass|fail|warn|skip`
- `checks[]` with `status`, `check`, `detail`
- `policy_override.applied` when present

### release-evidence / release-rehearsal
- decision-oriented summary fields stay stable
- nested `release_report.decision` stays stable when present

### test-stability
- `schema_name`
- `stable`
- `repeat_count|pass_count|fail_count`
- `iterations[]`

### observability-report
- `root_dir`
- `events.event_count`
- `benchmarks.run_count`

### platform-report
- `schema_name`
- `schema_version`
- `generated_at`
- `root_dir`

## Enforcement

The contracts are checked in two places:

1. Runtime assertions before JSON is emitted from the CLI
2. Automated tests in `tests/contracts-batch4.test.js` and `tests/batchA-technical-closure.test.js`

This gives the repository a practical guardrail without forcing a full TypeScript migration, while still raising the floor for future command additions.
