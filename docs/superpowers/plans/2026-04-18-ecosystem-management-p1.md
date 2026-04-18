# Ecosystem Management P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute this plan task-by-task. Keep write ownership disjoint, do not revert unrelated edits, and verify each task before handoff.

**Goal:** Add the first public ecosystem-management layer for Easy OpenCode: persisted bundle intent, explainable workspace detection, `eoc ecosystem` management commands, and installer/bootstrap integration that applies managed defaults without expanding the main day-to-day kernel.

**Architecture:** P1 builds on the P0 automation foundation. It adds bundle and detector infrastructure, a single explicit `ecosystem` management surface, and installer/bootstrap application flow. It does **not** add the standalone `eoc bootstrap` CLI or preset packs; those remain P2.

**Tech Stack:** Node.js, CommonJS modules, `node:test`, existing install/runtime asset pipeline, managed `.opencode` assets

---

## Scope

Included in P1:

- persisted ecosystem intent via `.opencode/ecosystem.json`
- built-in bundle registry with explainable contributions
- workspace detectors for tooling, LSP, and MCP signals
- `eoc ecosystem` CLI for `status`, `list`, `recommend`, `enable`, `disable`, and `apply`
- installer/bootstrap path that can detect and apply recommended bundles
- hook behavior derived from ecosystem state instead of static assumptions

Explicitly deferred to follow-on work:

- standalone `eoc bootstrap` CLI
- preset packs such as `node-team` / `python-platform`
- remote marketplace or dynamic bundle downloads
- support-tier reporting for ecosystem maturity

## File Structure

### New Files

- `src/core/ecosystem/bundle-registry.js`
  - Declare built-in bundles, their requirements, and their contributions
- `src/core/ecosystem/apply-bundles.js`
  - Resolve effective bundle set and write managed ecosystem assets
- `src/core/ecosystem/detectors/tooling.js`
  - Detect package manager, CI, runtime tools, and common project markers
- `src/core/ecosystem/detectors/lsp.js`
  - Detect LSP-related capabilities from repository and installed assets
- `src/core/ecosystem/detectors/mcp.js`
  - Detect MCP-related configuration and reachable local capability signals
- `src/core/ecosystem/workspace-profile.js`
  - Build an explainable workspace profile from detectors + persisted state
- `src/cli/ecosystem-cli.js`
  - Public CLI surface for ecosystem inspection and mutation
- `tests/ecosystem-bundle-registry-batch1.test.js`
  - Verify bundle definitions and contribution shape
- `tests/ecosystem-workspace-profile-batch1.test.js`
  - Verify detector aggregation, recommendations, and explanation output
- `tests/ecosystem-cli-batch1.test.js`
  - Verify `status/list/recommend/enable/disable/apply` behaviors
- `tests/install-bootstrap-batch1.test.js`
  - Verify installer bootstrap applies managed ecosystem state safely

### Modified Files

- `src/core/ecosystem/state.js`
  - Add persist/write helpers and stricter schema normalization for managed state
- `src/cli/install-cli.js`
  - Add `--bootstrap` and `--bundle` flow with ecosystem state persistence
- `scripts/install.js`
  - Preserve installer entrypoint while exposing new bootstrap flags
- `.opencode/plugins/eoc-hooks.ts`
  - Read ecosystem state and adjust hook behavior based on applied bundles/mode
- `src/shared/opencode-config.js`
  - Register `ecosystem` command only after implementation exists
- `src/cli/command-registry.js`
  - Expose `ecosystem` as a public managed surface and keep `bootstrap` hidden
- `src/shared/product-scope.js`
  - Include `.opencode/ecosystem.json` and ecosystem assets in the managed kernel
- `README.md`
  - Document ecosystem management and installer bootstrap usage

## Execution Order

### Task 1: Bundle Registry And Managed State Mutation

**Files:**
- Create: `src/core/ecosystem/bundle-registry.js`
- Create: `src/core/ecosystem/apply-bundles.js`
- Modify: `src/core/ecosystem/state.js`
- Test: `tests/ecosystem-bundle-registry-batch1.test.js`

- [ ] Add failing tests for:
  - stable bundle definitions with `id`, `summary`, `requires`, and `contributes`
  - effective bundle resolution from `enabled_bundles`, `disabled_bundles`, and recommendations
  - persisted ecosystem state write/update semantics
- [ ] Implement minimal bundle registry with built-in bundles:
  - `node-service`
  - `release-governance`
  - `lsp-refactor`
  - `mcp-devtools`
- [ ] Implement `apply-bundles` to:
  - compute effective bundles
  - write `.opencode/ecosystem.json`
  - return explanation payload for CLI and install flows
- [ ] Verify with `node --test tests/ecosystem-bundle-registry-batch1.test.js`
- [ ] Commit:

```bash
git add src/core/ecosystem/state.js src/core/ecosystem/bundle-registry.js src/core/ecosystem/apply-bundles.js tests/ecosystem-bundle-registry-batch1.test.js
git commit -m "feat: add ecosystem bundle registry"
```

### Task 2: Workspace Detectors And Explainable Profile

**Files:**
- Create: `src/core/ecosystem/detectors/tooling.js`
- Create: `src/core/ecosystem/detectors/lsp.js`
- Create: `src/core/ecosystem/detectors/mcp.js`
- Create: `src/core/ecosystem/workspace-profile.js`
- Test: `tests/ecosystem-workspace-profile-batch1.test.js`

- [ ] Add failing tests for:
  - package-manager and CI detection
  - LSP/MCP signal aggregation
  - recommendation generation and explanation ordering
- [ ] Implement detector modules with purely local, deterministic signals
- [ ] Implement `buildWorkspaceProfile()` that merges:
  - repository facts
  - persisted ecosystem state
  - bundle registry defaults
- [ ] Ensure recommendations are explainable and mode-aware without mutating state
- [ ] Verify with `node --test tests/ecosystem-workspace-profile-batch1.test.js`
- [ ] Commit:

```bash
git add src/core/ecosystem/detectors/tooling.js src/core/ecosystem/detectors/lsp.js src/core/ecosystem/detectors/mcp.js src/core/ecosystem/workspace-profile.js tests/ecosystem-workspace-profile-batch1.test.js
git commit -m "feat: add ecosystem workspace profile detectors"
```

### Task 3: Public `eoc ecosystem` CLI Surface

**Files:**
- Create: `src/cli/ecosystem-cli.js`
- Modify: `src/shared/opencode-config.js`
- Modify: `src/cli/command-registry.js`
- Test: `tests/ecosystem-cli-batch1.test.js`

- [ ] Add failing tests for:
  - `status` returns persisted state + derived recommendations
  - `list` shows built-in bundles
  - `recommend` returns explainable recommendations without mutation
  - `enable` / `disable` / `apply` update managed state safely
- [ ] Implement CLI surface with JSON-friendly output and stable error messages
- [ ] Register `ecosystem` as public surface only after implementation exists
- [ ] Keep `bootstrap` hidden and unregistered in P1
- [ ] Verify with `node --test tests/ecosystem-cli-batch1.test.js`
- [ ] Commit:

```bash
git add src/cli/ecosystem-cli.js src/shared/opencode-config.js src/cli/command-registry.js tests/ecosystem-cli-batch1.test.js
git commit -m "feat: add ecosystem management cli"
```

### Task 4: Installer Bootstrap And Hook Derivation

**Files:**
- Modify: `src/cli/install-cli.js`
- Modify: `scripts/install.js`
- Modify: `.opencode/plugins/eoc-hooks.ts`
- Modify: `src/shared/product-scope.js`
- Modify: `README.md`
- Test: `tests/install-bootstrap-batch1.test.js`

- [ ] Add failing tests for:
  - `eoc-install --bootstrap` applies recommended bundles
  - `--bundle <id>` persists explicit bundle enablement
  - hooks read ecosystem state and log bundle-derived behavior
- [ ] Extend install flow with `--bootstrap` and `--bundle`
- [ ] Make hooks derive behavior from persisted ecosystem state instead of hard-coded assumptions
- [ ] Update product scope and docs so managed assets include `.opencode/ecosystem.json`
- [ ] Verify with:
  - `node --test tests/install-bootstrap-batch1.test.js`
  - focused existing install/hook suites affected by the change
- [ ] Commit:

```bash
git add src/cli/install-cli.js scripts/install.js .opencode/plugins/eoc-hooks.ts src/shared/product-scope.js README.md tests/install-bootstrap-batch1.test.js
git commit -m "feat: bootstrap ecosystem defaults during install"
```

## Parallelization Plan

Use parallel workers after the baseline is green:

- Worker A owns Task 1 files only
- Worker B owns Task 2 files only
- Main thread owns Task 3 and Task 4, integrating outputs from A and B

Write ownership must stay disjoint until integration:

- Worker A: `src/core/ecosystem/state.js`, `src/core/ecosystem/bundle-registry.js`, `src/core/ecosystem/apply-bundles.js`, `tests/ecosystem-bundle-registry-batch1.test.js`
- Worker B: `src/core/ecosystem/detectors/*`, `src/core/ecosystem/workspace-profile.js`, `tests/ecosystem-workspace-profile-batch1.test.js`
- Main thread: `src/cli/ecosystem-cli.js`, `src/cli/install-cli.js`, `scripts/install.js`, `.opencode/plugins/eoc-hooks.ts`, `src/shared/opencode-config.js`, `src/cli/command-registry.js`, `src/shared/product-scope.js`, `README.md`, `tests/ecosystem-cli-batch1.test.js`, `tests/install-bootstrap-batch1.test.js`

## Verification

After all tasks:

- `node --test tests/ecosystem-bundle-registry-batch1.test.js tests/ecosystem-workspace-profile-batch1.test.js tests/ecosystem-cli-batch1.test.js tests/install-bootstrap-batch1.test.js`
- focused regressions:
  - `node --test tests/automation-surface-batch1.test.js tests/ecosystem-state-batch1.test.js tests/build-pipeline-batch6.test.js`
- installer and registry validation:
  - `node scripts/command-registry.js validate --json`
- full suite:
  - `npm test`

## Exit Criteria

- `eoc ecosystem status` explains effective bundles, recommendations, and state source
- `eoc ecosystem enable/disable/apply` safely mutates `.opencode/ecosystem.json`
- install flow supports `--bootstrap` and `--bundle`
- hooks can read ecosystem state without breaking existing quality behavior
- all new behavior is covered by deterministic tests
- full repository suite passes in the isolated worktree
