---
description: Provider-backed codemod entrypoint for deterministic semantic rewrite across JS/TS, Python, and Go files
agent: refactor-cleaner
subtask: true
---

# AST Rewrite Command

Run provider-backed refactors with semantic JS/TS, Python, and Go edits first, then cross-language text fallback when semantic providers are unavailable.

## Usage

```bash
# Semantic rename from concrete symbol location (recommended)
node scripts/ast-rewrite.js rename-at --file src/app.ts --line 42 --col 13 --to newName --path src --dry-run

# Apply semantic rename
node scripts/ast-rewrite.js rename-at --file src/app.ts --line 42 --col 13 --to newName --path src

# Broad text-level fallback (less precise)
node scripts/ast-rewrite.js rename-symbol --from oldName --to newName --path src --provider text-fallback --edit-policy surgical

# Inspect available refactor providers
node scripts/ast-rewrite.js providers

# Add a missing import
node scripts/ast-rewrite.js add-import --file src/app.ts --from ./auth --import ensureSession --dry-run

# Remove a stale named import
node scripts/ast-rewrite.js remove-import --file src/app.ts --from ./auth --import legacyAuth --dry-run

# Ensure an exported stub exists before TDD implementation
node scripts/ast-rewrite.js ensure-export --file src/app.ts --name refreshSession --kind function --dry-run
```

## Notes

- The refactor layer now normalizes operations onto canonical primitives such as `rename_symbol`, `add_import`, and `ensure_export`, so future language providers can share one substrate even when CLI commands remain hyphenated.
- `rename-at` uses the `typescript-semantic` provider and TypeScript language-service rename locations.
- `rename-symbol` now resolves a provider first: semantic JS/TS, semantic Python, or semantic Go when available, otherwise `text-fallback` for broader cross-language identifier rewrites. Use `--provider` to pin a provider explicitly.
- `python-semantic` supports tokenize-aware `rename-symbol`, plus semantic `add-import`, `remove-import`, and `ensure-export` operations for `.py` files.
- `go-semantic / java-semantic` supports token-aware `rename-symbol`, plus Go-aware `add-import`, `remove-import`, and `ensure-export` operations for `.go` files.
- `text-fallback` currently supports `.py`, `.go`, `.java`, plus the JS/TS family when you need a broad fallback.
- Use `--edit-policy surgical|balanced|broad` to cap edit footprint; non-dry runs that exceed the current policy must be forced with `--force-broad-edit`.
- Scans still skip `.git`, `node_modules`, `dist`, `build`, `coverage`, `.opencode`.

## Deterministic Edit Helpers

- `add-import` inserts or merges JS/TS imports, Python `from ... import ...` statements, and Go imports without broad text replacement.
- `remove-import` removes a named import or the whole declaration.
- `ensure-export` appends an exported stub for JS/TS and maintains Python `__all__` exports when possible, and can promote Go package symbols to exported names.
