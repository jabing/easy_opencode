# Release Audit Summary Schema

`release_audit_summary` is the stable first-view summary for production readiness.

Use it when you want the shortest supported answer to these questions:

- Can this release ship?
- Why is it blocked or under caution?
- Which baseline and policy were used?
- Is rollback ready?
- Is override pressure accumulating?

## Where it appears

The same schema now appears in these entrypoints:

- `npm run preflight:production -- --json --summary-only`
- `npm run release:evidence:json -- --policy production`
  - at `summary.audit_summary`
- `npm run release:audit-export -- --policy production --dir`
  - at `summary.json`
  - and at `manifest.json > homepage`

## Stable fields

Top-level fields:

- `schema_name`
- `schema_version`
- `generated_at`
- `title`
- `policy`
- `baseline_name`
- `preflight_decision` when emitted from preflight
- `release_conclusion`
- `final_decision_summary`
- `why_blocked_or_caution`
- `benchmark_readiness`
- `benchmark_freshness`
- `baseline_status`
- `approval_status`
- `latest_rehearsal_decision`
- `rollback_ready`
- `override_pressure`
- `entrypoints` when emitted from audit export

Nested objects:

### `release_conclusion`

The stable final decision object.

Expected fields:

- `schema_version`
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

### `override_pressure`

A compact self-governance signal.

Expected fields:

- `status`
- `last_30_days_count`

## Example

```json
{
  "schema_name": "release_audit_summary",
  "schema_version": "1.0",
  "generated_at": "2026-04-13T12:00:00.000Z",
  "policy": "production",
  "baseline_name": "release.node-api.production",
  "preflight_decision": "blocked",
  "release_conclusion": {
    "schema_version": "1.1",
    "release_decision": "blocked",
    "ready_state": "blocked",
    "reason": "baseline approval required by policy=production",
    "release_policy": "production",
    "override_used": false,
    "baseline_approved": false,
    "benchmark_fresh_enough": true,
    "rollback_ready": true,
    "canonical_baseline_name": "release.node-api.production",
    "selected_baseline_name": "release.node-api.production",
    "override_pressure_status": "present",
    "override_pressure_last_30_days": 1
  },
  "final_decision_summary": "baseline approval required by policy=production",
  "why_blocked_or_caution": [
    "benchmark.baseline_approval: baseline approval required by policy=production"
  ],
  "benchmark_readiness": "ready",
  "benchmark_freshness": "fresh",
  "baseline_status": "present",
  "approval_status": "missing",
  "latest_rehearsal_decision": "ready",
  "rollback_ready": true,
  "override_pressure": {
    "status": "present",
    "last_30_days_count": 1
  }
}
```

## Intended usage

For machine consumers:

- Prefer `release_audit_summary` for first-pass routing and dashboards.
- Prefer nested `release_conclusion` for long-term final decision logic.

For humans:

- Use `final_decision_summary` and `why_blocked_or_caution` first.
- Then inspect `baseline_name`, `approval_status`, `rollback_ready`, and `override_pressure`.

## CLI shortcut

For the shortest supported preflight output:

```bash
npm run preflight:production -- --summary-only --json
```

This returns only the `release_audit_summary` object instead of the full step-by-step preflight report.
