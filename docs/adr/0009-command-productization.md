# ADR 0009: command productization and scaffold-first governance

## Status
Accepted

## Context
The repository has grown into a large managed command surface. Even after core extraction and contract hardening, new commands could still bypass the common skeleton and command discovery remained implicit.

## Decision
- Introduce a command registry that classifies managed scripts by tier and surface.
- Expose the registry through a dedicated CLI and validate it in tests.
- Treat `eoc` main commands as a curated front door, while keeping broader public commands discoverable but governed.
- Add `scripts/create-command.js` so new commands start from a common scaffold instead of ad-hoc script copies.

## Consequences
- Public command discovery is easier and more stable.
- New commands are less likely to drift away from the shared structure.
- Internal and experimental commands remain available without crowding the primary user surface.
