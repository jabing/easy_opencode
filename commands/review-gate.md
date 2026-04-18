---
description: Run a structured merge-readiness gate with verdicts and repair handoff
agent: eoc_code_reviewer
subtask: true
---

# Review Gate Command

Run the repository merge gate for the current workspace or latest implementation state: $ARGUMENTS

## What it does

1. Loads the latest implementation plan and coder-loop run when available
2. Inspects staged/unstaged diff scope and risky file categories
3. Reads benchmark-aware risk feedback for the current runtime / framework / task family
4. Chooses a policy-aware diff sampling depth based on benchmark risk and review posture
5. Optionally runs the fast/full quality gate
6. Produces a delivery verdict:
   - `ACCEPT`
   - `ACCEPT_WITH_FOLLOWUPS`
   - `BLOCK`
5. Writes a machine-readable report to `.opencode/reviews/merge-gate/latest.json`

## Recommended usage

Fast merge gate:

```bash
node bin/eoc-script.js review-gate report --json
```

Full merge gate with stricter checks:

```bash
node bin/eoc-script.js review-gate report --with-quality-gate --quality-mode full --json
```

## Output expectations

Return:

- scope summary
- risky areas
- explicit verdict
- blocker findings
- follow-up findings
- benchmark risk, review posture, and diff sampling depth
- recommended next steps / repair handoff

Prefer focused, high-confidence findings tied to actual validation state and changed files.
