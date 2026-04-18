# test_stability_summary schema

`npm run test:stability:json` emits a stable `test_stability_summary` object.

## Top-level fields

- `schema_name`
- `schema_version`
- `generated_at`
- `stable`
- `repeat_count`
- `pass_count`
- `fail_count`
- `workspace_mode`
- `ci_mode`
- `iteration_timeout_ms`
- `first_failure`
- `iterations`

## Example

```json
{
  "schema_name": "test_stability_summary",
  "schema_version": "1.0",
  "generated_at": "2026-04-13T00:00:00.000Z",
  "stable": true,
  "repeat_count": 5,
  "pass_count": 5,
  "fail_count": 0,
  "workspace_mode": "temp_copy",
  "ci_mode": "ci",
  "iteration_timeout_ms": 600000,
  "first_failure": null,
  "iterations": [
    {
      "iteration": 1,
      "started_at": "2026-04-13T00:00:00.000Z",
      "duration_ms": 1234,
      "code": 0,
      "signal": null,
      "timed_out": false,
      "summary": "ok"
    }
  ]
}
```
