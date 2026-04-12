---
description: AST-based codemod entrypoint for deterministic symbol rewrite across JS/TS files
agent: refactor-cleaner
subtask: true
---

# AST Rewrite Command

Run AST-based symbol rename refactors over JS/TS files.

## Usage

```bash
# Dry-run impact
node scripts/ast-rewrite.js rename-symbol --from oldName --to newName --path src --dry-run

# Apply rewrite
node scripts/ast-rewrite.js rename-symbol --from oldName --to newName --path src
```

## Notes

- Uses TypeScript compiler AST for deterministic identifier updates.
- Scans: `.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts`
- Skips: `.git`, `node_modules`, `dist`, `build`, `coverage`, `.opencode`
