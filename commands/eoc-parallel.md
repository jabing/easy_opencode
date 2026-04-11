# EOC Parallel Command

Manage DAG-based concurrent execution for an existing `/eoc-start` run.

## Purpose

Adds high-concurrency orchestration with:
- Dependency graph scheduling
- Per-task timeout and retry policy
- Task-level context isolation (`.opencode/eoc-run/<run-id>/tasks/<task-id>/`)

## Usage

```bash
# Init scheduler
node scripts/eoc-scheduler.js init --run-id <run-id> --concurrency 3 --fast-fail false

# Add tasks
node scripts/eoc-scheduler.js add-task --run-id <run-id> --task-id build --cmd "npm.cmd run build" --timeout 600 --retries 1 --priority 120
node scripts/eoc-scheduler.js add-task --run-id <run-id> --task-id unit --cmd "npm.cmd test" --deps build --timeout 900 --retries 0 --priority 100
node scripts/eoc-scheduler.js add-task --run-id <run-id> --task-id lint --cmd "npm.cmd run lint" --deps build --timeout 600 --priority 110

# Execute scheduler
node scripts/eoc-scheduler.js run --run-id <run-id>

# Simulate scheduler (no subprocess execution; useful in restricted environments)
node scripts/eoc-scheduler.js run --run-id <run-id> --simulate

# Fail-fast execution (skip queued tasks after first failure)
node scripts/eoc-scheduler.js run --run-id <run-id> --fast-fail true

# Inspect status
node scripts/eoc-scheduler.js status --run-id <run-id>
```

## Guardrails

- Tasks with unmet dependencies remain blocked.
- Timeout and retry are enforced per task.
- Scheduler validates missing deps and dependency cycles before execution.
- Tasks downstream of failed/skipped deps are auto-marked `skipped` with explicit reason.
- Scheduler marks run `blocked` if no runnable tasks remain but queued tasks still exist.
