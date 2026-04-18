# Easy OpenCode Instructions

This file provides the baseline instructions bundled with the Easy OpenCode plugin.

## Core rules

- Use only public, authorized sources when referencing external tools or third-party behavior.
- Never hardcode secrets, tokens, passwords, or API keys.
- Validate user input, prefer parameterized queries, and sanitize untrusted HTML.
- Prefer immutable update patterns and small focused files.
- Run tests and verification before declaring work complete.
- Remove `console.log` and temporary debugging traces from production code.

## Default workflow

1. Plan non-trivial work first.
2. Implement in small verifiable increments.
3. Run quality and security checks.
4. Use specialized reviewer prompts for code, security, testing, and docs.
5. Keep documentation aligned with commands, agents, and skills.

## OpenCode notes

- Commands, agents, and skills are installed under `easy-opencode` so user-owned files are not overwritten.
- Hooks are configurable via `.opencode/hooks-config.json`.
- The bundled plugin is intentionally lightweight and cross-platform.
