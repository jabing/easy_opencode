# Command authoring guide

This repository now treats commands as a governed product surface rather than a loose script collection.

## Rules

1. Public commands must appear in the command registry with a stable tier and summary.
2. New commands should be scaffolded through `node scripts/create-command.js <name>`.
3. Commands that support `--json` should return a stable object shape and add a contract entry when the output is intended for automation.
4. Main entrypoint commands (`eoc plan`, `eoc ship`, etc.) remain curated separately from the broader managed-command surface.
5. `node scripts/command-registry.js validate` must pass.

## Tiers

- `core`: end-user commands that are part of the primary workflow.
- `governance`: reporting, policy, release, or audit commands.
- `internal`: maintenance, bootstrap, or experimental commands.

## Recommended flow

1. Scaffold the command.
2. Implement the core module under `src/core`.
3. Decide whether the command is public or internal and update `PUBLIC_METADATA` in `src/cli/command-registry.js` when needed.
4. Add or extend JSON contracts for automation-facing commands.
5. Add tests for CLI output and registry validity.
