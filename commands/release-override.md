---
description: Request, approve, revoke, and inspect audited release policy overrides.
argument-hint: <request|approve|revoke|status|list> [options]
---

Manage release policy overrides with explicit reason, expiry, and allowed check coverage.

Examples:

```bash
node scripts/release-override.js request --policy production --reason "temporary benchmark regression" --checks benchmark.latest_comparison --expires-at 2026-04-30T00:00:00.000Z --json
node scripts/release-override.js approve --id <override-id> --by release-manager --json
node scripts/release-override.js status --id <override-id> --policy production --json
```


Single-author safeguards:

- `expires-at` is required and capped by release policy
- `checks` cannot be empty
- some checks are never overridable (for example snapshot readiness, stale/expired benchmark freshness, or missing production baseline approval)
- overrides have limited reuse counts, so they cannot silently become a standing release bypass
