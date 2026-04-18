---
description: Generate a multi-file feature bundle matched to the current repository.
argument-hint: <feature-name>
allowed-tools: Bash(node scripts/generate-feature.js:*), Read, Write, Edit, Glob, Grep
agent: eoc_orchestrator
---

# Generate Feature

Generate a multi-file feature bundle for the current repository: $ARGUMENTS

## Default flow

```bash
node scripts/generate-feature.js "$ARGUMENTS" --json
```

## Operating rules

1. Detect project runtime, framework, structure, and persisted project memory before selecting a feature skill.
2. Primary tier1 feature generation is provider-backed and currently supports Node/TypeScript, Python/FastAPI, and Go service repositories.
3. Use `node scripts/generate-feature.js --providers --json` to inspect the current primary provider catalog.
4. Prefer `--json` or `--dry-run --json` before writing into an unfamiliar repo.
5. The generated bundle should include route, service, schema, integration note, and optional repository/test/docs depending on runtime and flags.
6. After generation, run the suggested verify commands and refine imports, registration, or wiring as needed.
7. If verify fails, enter the minimal debug/fix loop and summarize created files, updates, and remaining risks.
