---
description: One-command end-to-end delivery (plan packet -> execution -> quality -> review -> release gate)
agent: eoc_build
subtask: true
---

# EOC Ultrawork Command

Run the full gated flow automatically with minimal manual intervention.

## Usage

```bash
# Execute from packet
node scripts/eoc-ultrawork.js --packet packet.json --code-review reviews/code-review.json --security-review reviews/security-review.json --docs-evidence reviews/docs-evidence.json --archive-evidence reviews/archive-evidence.json --plan-id PLAN-2026-0412

# Execute from planner markdown/json piped to stdin
cat plan-output.md | node scripts/eoc-ultrawork.js --stdin --code-review reviews/code-review.json --security-review reviews/security-review.json --docs-evidence reviews/docs-evidence.json --archive-evidence reviews/archive-evidence.json

# Simulate scheduler execution
node scripts/eoc-ultrawork.js --packet packet.json --simulate --code-review reviews/code-review.json --security-review reviews/security-review.json --docs-evidence reviews/docs-evidence.json --archive-evidence reviews/archive-evidence.json
```

## What It Does

1. Imports packet via `eoc-bridge` and executes scheduler
2. Advances all gates with required evidence fields
3. Runs quality gate (inline full gate) unconditionally
4. Verifies real code coverage from `coverage/coverage-summary.json` (`scripts/coverage-check.js`)
5. Validates external code/security review evidence files (`scripts/review-gate.js`)
6. Stops on any failed stage with explicit error output

## Guardrails

- Requires valid Execution Packet with `command` and `validation` per task
- Blocks commands containing unsafe shell operators (`|`, `;`, redirection, etc.)
- Requires scheduler status `completed` before moving to quality gate
- Requires coverage check and review gate to pass before release gate
- Requires external review evidence files with `source: external`
- Requires docs/archive evidence files with matching `run_id`
- Blocks release gate unless all prior gates are satisfied
