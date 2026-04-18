# Release Policy

This document is the readable policy layer for release readiness.

## Policy tiers

| Policy | Intent | Warns block release? | Benchmark baseline required? | Baseline approval required? |
| --- | --- | --- | --- | --- |
| `internal` | local or trial releases | no | no | no |
| `standard` | normal release candidate | no | no | no |
| `production` | production release | yes | yes | yes |

## Benchmark expectations by policy

| Policy | Minimum run count | Minimum confidence | Coverage requirement | Freshness target |
| --- | --- | --- | --- | --- |
| `internal` | 3 | 20 | partial | fresh within 21 days |
| `standard` | 5 | 30 | sufficient | fresh within 14 days |
| `production` | 8 | 40 | sufficient | fresh within 7 days |

## Override rules

### Overrideable checks

Overrides are intended for temporary release exceptions on specific checks.

### Never override

The following checks are structurally blocked from override by policy:

- `snapshot.readiness` for all policies
- `benchmark.data_freshness` for `standard` and `production`
- `benchmark.scope_coverage` for `production`
- `benchmark.baseline_approval` for `production`

## Baseline, approval, and freshness relationship

- Baseline answers: what stable run should the current release be compared against?
- Approval answers: has that chosen baseline been explicitly accepted as the release comparison anchor?
- Freshness answers: is the benchmark evidence recent enough to trust?

A production release is not considered ready unless all three are in acceptable state.

## Release readiness decision

The release pipeline resolves to one of these outcomes:

- `ready`: all required checks pass under the selected policy
- `caution`: only allowed for non-blocking warning policies such as `internal` and `standard`
- `blocked`: one or more required checks failed, or warnings are promoted to blocking by policy
- `ready_with_override`: a valid approved override covers every failing or warning check and does not touch disallowed checks

## Recommended operator flow

1. Run `npm run preflight:production`.
2. Review `npm run release:evidence:json -- --policy production`.
3. Confirm baseline exists, is approved, and benchmark data is fresh.
4. Treat overrides as short-lived exceptions, not a normal release path.
5. Export the audit bundle when you need a durable release snapshot.


## Audit export

Use `npm run release:audit-export -- --policy production --dir` to emit a stable read-only audit bundle directory containing `manifest.json`, `summary.json`, `README.md`, `evidence.json`, `release-check.json`, `rehearsal.json`, `baseline.json`, `approval.json`, `overrides.json`, and `observability-events.json`. The `manifest.json` homepage and `summary.json` are now the intended first-view entrypoints: they put the final release conclusion, main blocking reasons, baseline, override pressure, and rollback readiness at the top of the audit package.

## Override pressure

`release-evidence` now exposes `override_pressure` with 7-day and 30-day counts, repeated-check hotspots, per-policy frequency, and a coarse pressure status (`none`, `present`, `elevated`, `high`).

## Preflight topline

`npm run preflight:production -- --json` now surfaces a compact `topline` block intended for both humans and CI.

It includes:

- `release_decision` and `release_reason`
- `canonical_baseline_name` and `selected_baseline_name`
- `baseline_approved`
- `benchmark_fresh_enough`
- `rollback_ready`
- `override_pressure_status` and `override_pressure_last_30_days`

This is the shortest supported production-readiness view. It lets one command answer both:

- “Did the preflight pass?”
- “Why is release still blocked or under caution?”

## Unified release conclusion

`release-check`, `release-rehearsal`, `preflight:production`, `release-evidence`, and `release:audit-export` now share the same `release_conclusion` object so the human summary, JSON output, and audit manifest carry the same final decision fields.


## Stable release conclusion schema

The stable machine-readable contract is now `release_conclusion`.

Each of these commands emits that object as the primary final-decision field:

- `release-check`
- `release-rehearsal`
- `release-evidence`
- `preflight:production`
- `release:audit-export`

The object includes:

- `release_decision`
- `ready_state`
- `reason`
- `release_policy`
- `override_used`
- `baseline_approved`
- `benchmark_fresh_enough`
- `rollback_ready`
- `canonical_baseline_name`
- `selected_baseline_name`
- `override_pressure_status`
- `override_pressure_last_30_days`

Legacy flat summary fields are still emitted for compatibility, but they now live behind a compatibility layer:

- `release_conclusion_schema.primary_field = "release_conclusion"`
- `release_conclusion_schema.compatibility_mode = "legacy_flat_fields_supported"`
- `release_conclusion_schema.legacy_summary`

Consumers should migrate to `release_conclusion` as the long-term stable interface.


## Audit summary schema

The audit package homepage, the preflight topline, and `release-evidence.summary.audit_summary` now share the same `release_audit_summary` object. Treat this as the stable first-view summary schema for human review and CI-friendly JSON entrypoints.

It includes:
- `schema_name = "release_audit_summary"`
- `schema_version`
- `preflight_decision` when emitted from `preflight:production`
- `release_conclusion`
- `final_decision_summary`
- `why_blocked_or_caution`
- `benchmark_readiness` / `benchmark_freshness`
- `baseline_status` / `approval_status`
- `latest_rehearsal_decision`
- `rollback_ready`
- `override_pressure`
- `entrypoints` when emitted from `release:audit-export`


## Summary-only preflight output

Use `npm run preflight:production -- --summary-only --json` when you want only the stable `release_audit_summary` object and do not need the full per-step preflight report.

This is the recommended CI-friendly shortcut for:

- shell pipelines
- lightweight dashboards
- release bots that only need the final first-view summary

For the full execution matrix, keep using `npm run preflight:production -- --json`.

## Release audit summary schema reference

For the stable field list and example payload, see `docs/release-audit-summary-schema.md`.

## Optional test stability evidence

`preflight:production` can include `test_stability_summary` without making it a default release blocker.

Example:

```bash
npm run preflight:production:json -- --include-test-stability --test-stability-repeat 5 --test-stability-temp-copy
```
