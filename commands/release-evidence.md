---
description: Summarize release evidence across release-check, baseline approval, rehearsal state, overrides, and observability.
argument-hint: [--policy standard|production] [--baseline-name release] [--json]
---

Generate a unified release evidence report for the current workspace.

Examples:

```bash
node scripts/release-evidence.js --json
node scripts/release-evidence.js --policy production --baseline-name release --json
```
