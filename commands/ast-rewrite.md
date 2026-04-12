---
description: AST-based codemod entrypoint for deterministic symbol rewrite across JS/TS files
agent: refactor-cleaner
subtask: true
---

# AST Rewrite Command

Run AST-based symbol rename refactors over JS/TS files.

## Usage

```bash
# Semantic rename from concrete symbol location (recommended)
node scripts/ast-rewrite.js rename-at --file src/app.ts --line 42 --col 13 --to newName --path src --dry-run

# Apply semantic rename
node scripts/ast-rewrite.js rename-at --file src/app.ts --line 42 --col 13 --to newName --path src

# Broad text-level fallback (less precise)
node scripts/ast-rewrite.js rename-symbol --from oldName --to newName --path src
```

## Notes

- `rename-at` uses TypeScript language service rename locations (symbol-aware).
- `rename-symbol` is a broad identifier-text fallback and may touch unrelated symbols.
- Scans: `.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts`
- Skips: `.git`, `node_modules`, `dist`, `build`, `coverage`, `.opencode`
