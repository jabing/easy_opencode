# Command Execution Policy

`eoc-scheduler` executes task commands using a strict executable allowlist.

## Default Allowlist

- `node`, `node.exe`
- `npm`, `npm.cmd`
- `npx`, `npx.cmd`
- `pnpm`, `pnpm.cmd`
- `yarn`, `yarn.cmd`
- `git`, `git.exe`
- `python`, `python.exe`, `python3`
- `pwsh`, `pwsh.exe`
- `powershell`, `powershell.exe`

## Custom Policy

Create:

```text
.opencode/eoc-run/command-policy.json
```

Example:

```json
{
  "allowed_executables": [
    "node",
    "npm.cmd",
    "git"
  ]
}
```

If a task uses an executable not in this list, scheduler blocks the task before execution.
