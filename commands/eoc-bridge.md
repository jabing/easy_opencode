# EOC Bridge Command

Convert planner Execution Packet into a runnable EOC run and scheduler task graph.

## Usage

```bash
# from json file
node scripts/eoc-bridge.js --packet .opencode/eoc-run/plan-packet.json --plan-id PLAN-2026-0411

# from markdown/planner output piped via stdin
cat plan-output.md | node scripts/eoc-bridge.js --stdin

# import and execute immediately
node scripts/eoc-bridge.js --packet packet.json --execute

# simulate execution
node scripts/eoc-bridge.js --packet packet.json --execute --simulate
```

## Packet Requirements

- `objective`
- `recommended_concurrency`
- `fast_fail`
- `tasks[]` where each task provides:
  - `id`
  - `command` (or `cmd`)
  - `validation` (deterministic executable check, required)
  - optional `owner_hint` (`backend|frontend|fullstack|qa|docs`)
  - optional `deps`, `priority(1-200)`, `timeout_sec`, `retries`, `workdir`

## Outcome

- Creates run file: `.opencode/eoc-run/<run-id>.json`
- Sets active run pointer
- Initializes scheduler tasks directly from packet
- Optional immediate scheduler execution with `--execute`
