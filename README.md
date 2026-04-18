# Easy OpenCode

Production-ready OpenCode plugin focused on a slimmer product kernel: stable entry commands, governed delivery checks, reusable implementation skills, and auditable release/reporting workflows.

## Entry Agent Workflow

- `eoc_orchestrator` is the default entry for implement/fix/refactor/test work and should prefer `/implement-task`.
- `eoc_code_reviewer` stays as the dedicated review/audit entry.
- `eoc_planner` is now a hidden specialist used for plan-only, ambiguous, or high-risk multi-step changes.


## What You Get

- 16 specialized agents (2 visible entry agents + hidden specialists)
- 51 skills
- 59 commands after pruning experimental or low-signal surfaces
- Stable main entry commands for plan / implement / test / review / ship / doctor
- Quality guardrails with fast/full modes via `/quality-gate`
- Executable skill manifests with discovery/scaffolding via `/skill-runner`
- End-to-end implementation packets and repair briefs via `/implement-task`
- Deep project profiling and runtime detection for Node, Python, Go, and Java
- Structured review, release evidence, observability, and preflight reporting
- Hook automation and installable OpenCode integration assets

## Main Entry Commands

For day-to-day use, prefer the slim main entrypoint instead of memorizing dozens of lower-level commands:

- `eoc plan`
- `eoc implement`
- `eoc test`
- `eoc review`
- `eoc ship`
- `eoc doctor`

These map onto the existing kernel and keep advanced commands available without making them the default user path.

Command discovery:

- `eoc commands` shows only the six main commands
- `eoc commands --recommended` shows the recommended managed command surface
- `eoc commands --public` shows the full public managed surface
- `eoc commands --all` shows every managed command

## Operating Modes

Easy OpenCode now supports three operating modes:

- `solo`: shortest path for one developer
- `team`: stronger review and release defaults
- `platform`: full governance posture

Examples:

```bash
eoc mode
eoc mode set solo
eoc mode set team
eoc doctor
```

## Default Automation

Easy OpenCode now treats `eoc implement` as a mode-aware automation entrypoint.

- In `solo`, implement runs the scheduler with lightweight verification by default.
- In `team`, implement keeps the scheduler on and enables stronger verification plus review-gate defaults.
- In `platform`, implement keeps the strongest governance posture with review-gate behavior enabled by default.

This mode-aware automation stays inside the six-command kernel. Low-level orchestration scripts and future `bootstrap` / `ecosystem` surfaces remain internal until their dedicated implementations are added.

## Ecosystem Management

P1 adds an explicit ecosystem surface without expanding the six-command daily kernel:

- `eoc ecosystem status`
- `eoc ecosystem list`
- `eoc ecosystem recommend`
- `eoc ecosystem enable --bundle <id>`
- `eoc ecosystem disable --bundle <id>`

Built-in bundles currently include:

- `node-service`
- `release-governance`
- `lsp-refactor`
- `mcp-devtools`

Managed ecosystem intent is written to `.opencode/ecosystem.json`. CLI status, install bootstrap, and hook policy derive behavior from this file so automation stays explainable and reversible.

## Install

### Prerequisites

Install OpenCode first:

```bash
brew install opencode
# or
npm install -g opencode
```

### Option 1: npm (recommended)

```bash
npm install -g easy-opencode
```

Then in your target project:

```bash
eoc-install
```

### Option 2: from source

Clone the repository, then run the installer **from your target project** or pass an explicit target directory:

```bash
git clone https://github.com/jabing/easy_opencode.git

# from your target project
cd /path/to/your-project
node /path/to/easy_opencode/scripts/install.js --project --yes

# or from anywhere with an explicit target
node /path/to/easy_opencode/scripts/install.js --project --yes --target /path/to/your-project
```

## Installation Modes

`eoc-install` supports both modes:

- Project mode: installs to `<project>/.opencode/easy-opencode`
- Global mode: installs to `~/.opencode/easy-opencode`

You can also run non-interactively:

```bash
eoc-install --project --yes
eoc-install --global --yes
eoc-install --project --yes --bootstrap
eoc-install --project --yes --bootstrap --bundle release-governance
```

Source installs also support an explicit target:

```bash
node /path/to/easy_opencode/scripts/install.js --project --yes --target /path/to/your-project
```

## Development vs Installed Mode

This repository contains a **development-mode** `opencode.json` for running Easy OpenCode from the plugin source tree itself.

The installer writes a separate **installed-mode** configuration for the target project or global OpenCode directory:

- Development mode uses repository-relative paths such as `./commands/...` and `./prompts/...`
- Installed mode uses isolated asset paths such as `./.opencode/easy-opencode/...` or `./easy-opencode/...`

Do not run project-mode install from inside the plugin source repository unless you intentionally want to test installed mode there. Use `--target` to install into another project.

## Repository Validation Scripts

For repository maintenance, prefer the explicit check commands:

- `npm run check:metadata` for plugin metadata/config synchronization
- `npm run syntax-check` for source parse validation
- `npm run check:repo` for repository asset/config consistency
- `npm run lint` as a compatibility bridge (`check:metadata` + `syntax-check`)
- `npm run build` as a compatibility bridge (`check:repo` + `npm pack --dry-run`)

The legacy direct checks are still available as `npm run lint:legacy` and `npm run build:legacy` while downstream scripts migrate.

## Verify

Inside OpenCode:

- `/agents`
- `/help`

## Uninstall

```bash
node scripts/uninstall.js
```

This removes only Easy OpenCode assets (`easy-opencode/`) and related config entries.

## Repository Structure

```text
bin/        CLI entrypoint
commands/   Slash command templates
prompts/    Agent prompts
skills/     Reusable workflow skills
scripts/    Installer, uninstaller, diagnostics
.opencode/  Plugin code and OpenCode integration assets
```

## Notes

- The installer isolates assets under `easy-opencode` to avoid clobbering user-owned OpenCode files.
- Command/agent registration is generated from repository assets to reduce drift.
- External tooling parity is implemented from public/official sources only.
- `/eoc-parallel` supports priority scheduling, cycle detection, dependency-failure propagation, and fast-fail mode.

## License

MIT

## Test stability

- `npm run test:stability` validates the unified `npm test` entry repeatedly.
- `npm run test:stability:json` emits `test_stability_summary`.
