# Easy OpenCode - Agent Instructions

Easy OpenCode is an OpenCode plugin with 16 specialized agents, 51 skills, 58 commands, and a slimmer product kernel centered on implementation, review, quality, release evidence, and project profiling workflows.

## Installation

```bash
git clone https://github.com/jabing/easy_opencode.git
cd easy_opencode
node scripts/install.js
```

Or via npm:

```bash
npm install -g easy-opencode
eoc-install
```

Supported installer flags:

- `--project --yes`
- `--global --yes`

## Product-Layer Defaults

The product layer should stay intentionally slim:

- Main commands: `eoc plan`, `eoc implement`, `eoc test`, `eoc review`, `eoc ship`, `eoc doctor`
- Operating modes: `solo`, `team`, `platform`
- Advanced slash commands and specialist flows remain available, but they are no longer the default surface for everyday work

Mode guidance:

- `solo`: fastest loop, least ceremony
- `team`: stronger review and quality defaults
- `platform`: full governance posture with stricter release defaults

## Core Principles

1. Agent-first orchestration for complex tasks
2. Test-driven workflow (RED -> GREEN -> REFACTOR)
3. Security-first reviews before commit
4. Prefer immutable data updates
5. Plan before implementation for large changes

## Entry Workflows

The entry layer is intentionally slimmed down to **2 visible entry agents + 1 hidden specialist planner**.

### eoc_orchestrator (Default Entry Agent)

This is now the default user entrypoint and should handle most requests.

1. Classify intent: implement, fix, refactor, test, plan-only, review-only, explain-only
2. For implementation work, prefer `/implement-task` as the default end-to-end path
3. Auto-detect runtime, match executable skill, prepare implementation context, and start coder loop
4. Call planner only for broad/high-risk/ambiguous work
5. Call review/security specialists when risk is medium/high
6. Return either green status or a concrete repair brief

### eoc_code_reviewer

Keep this as a dedicated visible entrypoint for review/audit work.

1. Collect diff and impacted scope
2. Review correctness, tests, interfaces, perf, style, security
3. Return explicit verdict and machine-readable repair handoff

### eoc_planner (Hidden Specialist)

This is no longer a default visible entrypoint. It is a specialist planning engine used when:

1. The user explicitly asks for a plan only
2. The task is cross-cutting or high-risk
3. A DAG execution packet is needed before coding
4. Scope is still too ambiguous for safe implementation

## Agent Set

Primary agents:

- `eoc_orchestrator`
- `eoc_code_reviewer`

Hidden entry specialist:

- `eoc_planner`

Hidden specialist agents:

- `tdd-guide`
- `security-reviewer`
- `build-error-resolver`
- `e2e-runner`
- `refactor-cleaner`
- `doc-updater`
- `go-reviewer`
- `go-build-resolver`
- `database-reviewer`
- `architect`
- `python-reviewer`

## Security Baseline

Before commit:

- No hardcoded secrets
- Validate external/user input
- Use parameterized database queries
- Prevent XSS/CSRF where relevant
- Ensure auth and authorization checks
- Avoid leaking sensitive internals in errors

## Testing Baseline

- Keep meaningful unit/integration/e2e coverage
- Add tests for behavioral changes
- Verify critical flows after major refactors

## Project Layout

```text
.opencode/   Plugin runtime assets and config templates
commands/    Slash command templates
prompts/     Agent prompts
skills/      Workflow skill library
scripts/     Install/uninstall and operational scripts
```
