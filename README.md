# Easy OpenCode

Production-ready OpenCode plugin with multi-agent workflows, reusable skills, slash commands, and hook automation.

## What You Get

- 14 specialized agents (3 primary + hidden specialists)
- 50+ skills
- 51 commands
- Hook plugin for formatting, checks, and guardrails
- Gate-controlled delivery flow via `/eoc-start`
- DAG concurrency orchestration via `/eoc-parallel`
- Run observability via `/eoc-metrics`
- OpenSpec-style spec-first commands (`/openspec-proposal`, `/openspec-apply`, `/openspec-archive`)
- Superpowers-style execution commands (`/superpowers-brainstorm`, `/superpowers-plan`, `/superpowers-execute`)

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

```bash
git clone https://github.com/jabing/easy_opencode.git
cd easy_opencode
node scripts/install.js
```

## Installation Modes

`eoc-install` supports both modes:

- Project mode: installs to `<project>/.opencode/easy-opencode`
- Global mode: installs to `~/.opencode/easy-opencode`

You can also run non-interactively:

```bash
eoc-install --project --yes
eoc-install --global --yes
```

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

## License

MIT
