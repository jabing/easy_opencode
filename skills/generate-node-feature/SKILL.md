---
name: generate-node-feature
description: Generate a repo-friendly Node/TypeScript backend feature bundle with route, service, repository, schema, test, docs, and integration notes.
---

# Generate Node Feature

Use this skill when you need a repo-aware backend feature bundle instead of a single-file snippet.

## Produces

- feature controller
- optional repository when `with_repository=true`
- feature service
- feature schema/types
- route registration module
- optional test when `with_test=true`
- optional docs entry when `with_docs=true`
- integration note under `.opencode/feature-bundles/`

## Current behavior

- Targets Node and TypeScript repositories selected by `scripts/generate-feature.js`.
- Runs through `feature_bundle` execution in `scripts/skill-runner.js`.
- Uses analyzed project structure and persisted project memory to derive output paths, naming, and conventions.
- Participates in verify suggestions and the debug/fix loop when post-generation checks fail.
- Keeps templates conservative and repo-friendly, preferring existing conventions over introducing new folders.

## Typical invocation

```bash
node scripts/generate-feature.js user-auth --json
```

Or via skill runner directly:

```bash
node scripts/skill-runner.js scaffold generate-node-feature --root . --var name=user-auth --var subject=UserAuth --var with_repository=true --json
```
