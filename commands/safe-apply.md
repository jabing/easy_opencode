---
agent: eoc_orchestrator
subtask: true
---

# Safe Apply

Create a git-backed safety snapshot before edits, inspect the latest snapshot, or roll back to it.

## Typical uses

- Before a risky refactor or broad codemod
- Before letting coder-loop iterate several rounds
- To preview rollback commands without applying them

## Commands

Create a snapshot:

```bash
node bin/eoc-script.js safe-apply snapshot --label "before auth refactor"
```

Preview snapshot creation:

```bash
node bin/eoc-script.js safe-apply snapshot --dry-run
```

Inspect current snapshot and repo state:

```bash
node bin/eoc-script.js safe-apply status
```

Preview rollback:

```bash
node bin/eoc-script.js safe-apply rollback --dry-run
```

Roll back to the latest snapshot:

```bash
node bin/eoc-script.js safe-apply rollback
```

Use `--root <path>` to operate on a different project root.
