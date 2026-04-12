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
node scripts/eoc-ultrawork.js --packet packet.json --plan-id PLAN-2026-0412

# Execute from planner markdown/json piped to stdin
cat plan-output.md | node scripts/eoc-ultrawork.js --stdin

# Simulate scheduler execution
node scripts/eoc-ultrawork.js --packet packet.json --simulate
```

## What It Does

1. Imports packet via `eoc-bridge` and executes scheduler
2. Advances all gates with required evidence fields
3. Runs quality gate (inline full gate) unless `--skip-quality`
4. Computes coverage evidence from run tasks (`scripts/coverage-check.js`)
5. Derives code/security review verdicts from quality evidence (`scripts/review-gate.js`)
5. Stops on any failed stage with explicit error output

## Guardrails

- Requires valid Execution Packet with `command` and `validation` per task
- Blocks commands containing unsafe shell operators (`|`, `;`, redirection, etc.)
- Requires scheduler status `completed` before moving to quality gate
- Requires coverage check and review gate to pass before release gate
- Blocks release gate unless all prior gates are satisfied
