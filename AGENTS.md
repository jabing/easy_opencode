# Easy OpenCode - Agent Instructions

Easy OpenCode is an OpenCode plugin with 14 specialized agents, 50+ skills, 44 commands, and optional hook automation.

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

## Core Principles

1. Agent-first orchestration for complex tasks
2. Test-driven workflow (RED -> GREEN -> REFACTOR)
3. Security-first reviews before commit
4. Prefer immutable data updates
5. Plan before implementation for large changes

## Agent Set

Primary agents:

- `eoc_build`
- `eoc_planner`
- `eoc_code_reviewer`

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
