# EOC Start Command

Start and control the gated end-to-end development workflow.

## Purpose

`/eoc-start` is the total-control workflow command used after planning is confirmed.
It enforces phase gates and blocks progression when gate requirements are not met.
Use `/eoc-parallel` to orchestrate concurrent DAG tasks inside a run.

## Gates

1. `GATE_0_PLAN_READY`
2. `GATE_1_SCOPE_LOCK`
3. `GATE_2_IMPLEMENTATION`
4. `GATE_3_QUALITY`
5. `GATE_4_REVIEW`
6. `GATE_5_DOCS_ARCHIVE`
7. `GATE_6_RELEASE_READY`

## Usage

```bash
# Start a run
node scripts/eoc-start.js start "implement auth refresh flow" --plan-id PLAN-2026-0411

# Inspect current gate status
node scripts/eoc-start.js status

# Mark gate evidence
node scripts/eoc-start.js mark plan_confirmed true
node scripts/eoc-start.js mark scope_locked true
node scripts/eoc-start.js mark acceptance_criteria_locked true

# Advance to next gate (blocked until requirements are met)
node scripts/eoc-start.js advance

# Resume / list runs
node scripts/eoc-start.js list
node scripts/eoc-start.js resume <run-id>

# Import planner Execution Packet directly into run + scheduler
node scripts/eoc-bridge.js --packet packet.json
```

## State Storage

- Run files: `.opencode/eoc-run/<run-id>.json`
- Active pointer: `.opencode/eoc-run/active.json`

## Guardrail

If a gate is not satisfied, `advance` is blocked and reports unmet requirements.
