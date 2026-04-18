# Bootstrap Presets P2 Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` when executing this plan. Keep write ownership disjoint, do not revert unrelated edits, and verify each task before handoff.

**Goal:** Add the P2 ecosystem product layer for Easy OpenCode: a dedicated `eoc bootstrap` flow, preset packs layered on top of bundle management, recommendation/reporting improvements, and documentation that makes the new automation surface explainable and testable.

**Architecture:** P2 builds on the shipped P1 ecosystem foundation. It reuses the existing bundle registry, state persistence, detector-backed workspace profile, and install bootstrap logic. It adds a public bootstrap surface and preset abstraction without expanding the day-to-day main kernel beyond the intended slim command set.

**Tech Stack:** Node.js, CommonJS modules, `node:test`, existing managed `.opencode` asset pipeline, command registry validation, package hygiene checks

---

## Scope

Included in P2:

- public `eoc bootstrap` CLI for detect -> recommend -> apply -> verify
- preset registry layered over built-in bundles
- `ecosystem recommend` output that can surface preset recommendations, not only bundle IDs
- support-tier reporting for ecosystem maturity and automation coverage
- capability-registry exposure for bundles and presets
- docs for bootstrap flow and bundle/preset model

Explicitly deferred:

- remote preset marketplace or downloaded bundles
- dynamic preset authoring in user projects
- automatic mutation inside `doctor --bootstrap` beyond delegation/handoff

## Command Responsibility

- `eoc bootstrap`
  - owns environment detection, recommendation, apply, and verification
  - may persist `.opencode/ecosystem.json`
  - may output bundle and preset explanations
- `eoc ecosystem`
  - owns inspect/manage/status/list/recommend semantics
  - does not replace the bootstrap execution flow
- `eoc doctor --bootstrap`
  - remains diagnostics-first
  - may preview or delegate to bootstrap logic
  - must not duplicate a second bootstrap implementation path

## File Structure

### New Files

- `src/cli/bootstrap-cli.js`
  - Public CLI surface for `bootstrap` with preview/apply/verify semantics
- `src/core/ecosystem/presets.js`
  - Built-in preset registry and preset-to-bundle resolution
- `scripts/bootstrap.js`
  - Managed script entrypoint for the public bootstrap surface
- `commands/bootstrap.md`
  - User-facing slash command help for bootstrap
- `docs/ecosystem-bundles.md`
  - Explain bundle and preset model, default presets, and managed state behavior
- `docs/bootstrap-flow.md`
  - Explain bootstrap stages, dry-run/output shape, and doctor handoff semantics
- `tests/ecosystem-presets-batch1.test.js`
  - Verify preset definitions and preset-to-bundle resolution
- `tests/bootstrap-cli-batch1.test.js`
  - Verify bootstrap preview/apply output and stable error semantics
- `tests/ecosystem-recommend-batch2.test.js`
  - Verify preset-aware recommendation output
- `tests/ecosystem-reporting-batch1.test.js`
  - Verify capability/report output for presets, maturity, and automation coverage

### Modified Files

- `src/core/ecosystem/bundle-registry.js`
  - Expose preset-friendly metadata needed for recommendation and reporting
- `src/core/ecosystem/workspace-profile.js`
  - Add preset recommendations alongside bundle recommendations
- `src/core/ecosystem/install-bootstrap.js`
  - Reuse preset-aware bootstrap resolution for install and CLI flows
- `src/cli/ecosystem-cli.js`
  - Extend `recommend` and `status` payloads with preset information
- `src/cli/install-cli.js`
  - Accept preset-driven bootstrap during install flows
- `src/control-plane/product/main-commands.js`
  - Route `doctor --bootstrap` through diagnostic handoff metadata only
- `src/cli/command-registry.js`
  - Register `bootstrap` as public only after implementation exists
- `src/shared/opencode-config.js`
  - Add managed routing for bootstrap
- `src/core/capabilities/registry.js`
  - Include ecosystem bundles and presets in exported capability metadata
- `src/core/support-tiers/report.js`
  - Include ecosystem maturity and automation coverage in reports
- `src/core/package-hygiene.js`
  - Include new docs/static assets in package hygiene validation when required
- `README.md`
  - Document bootstrap and preset usage

## Execution Order

### Task 1: Preset Registry And Resolution

**Files:**
- Create: `src/core/ecosystem/presets.js`
- Modify: `src/core/ecosystem/bundle-registry.js`
- Modify: `src/core/ecosystem/workspace-profile.js`
- Test: `tests/ecosystem-presets-batch1.test.js`
- Test: `tests/ecosystem-recommend-batch2.test.js`

- [ ] Add failing tests for:
  - stable preset definitions with `id`, `summary`, `mode`, `bundles`, and explanation metadata
  - preset-to-bundle resolution with deduplication and unknown preset handling
  - workspace profile returning preset recommendations that are mode-aware and explainable
- [ ] Implement built-in presets:
  - `node-solo`
  - `node-team`
  - `node-platform`
  - `release-governance`
- [ ] Extend workspace-profile output with:
  - `recommended_presets`
  - `preset_recommendations`
  - explanation entries that point to preset rationale
- [ ] Verify with:
  - `node --test tests/ecosystem-presets-batch1.test.js`
  - `node --test tests/ecosystem-recommend-batch2.test.js`

### Task 2: Public Bootstrap CLI

**Files:**
- Create: `src/cli/bootstrap-cli.js`
- Create: `scripts/bootstrap.js`
- Create: `commands/bootstrap.md`
- Modify: `src/core/ecosystem/install-bootstrap.js`
- Modify: `src/cli/install-cli.js`
- Modify: `src/cli/command-registry.js`
- Modify: `src/shared/opencode-config.js`
- Test: `tests/bootstrap-cli-batch1.test.js`

- [ ] Add failing tests for:
  - `bootstrap --json` preview returns detected profile, preset/bundle recommendation, and no mutation by default
  - `bootstrap --apply --preset node-team --json` persists state and returns verification summary
  - invalid preset and invalid bundle combinations fail with stable errors
  - install bootstrap path can reuse preset-aware resolution without code duplication
- [ ] Implement bootstrap CLI with:
  - preview mode as default
  - `--apply`
  - `--preset <id>`
  - `--bundle <id>`
  - optional `--mode <solo|team|platform>`
- [ ] Register `bootstrap` as a public managed surface only after tests pass
- [ ] Keep `doctor --bootstrap` as a handoff to shared bootstrap helpers, not a separate implementation
- [ ] Verify with:
  - `node --test tests/bootstrap-cli-batch1.test.js`
  - `node scripts/command-registry.js validate --json`

### Task 3: Recommendation, Capability, And Reporting Surface

**Files:**
- Modify: `src/cli/ecosystem-cli.js`
- Modify: `src/core/capabilities/registry.js`
- Modify: `src/core/support-tiers/report.js`
- Test: `tests/ecosystem-reporting-batch1.test.js`

- [ ] Add failing tests for:
  - `ecosystem recommend --json` surfaces preset recommendations and effective bundle plan
  - capability registry includes `bundles` and `presets` metadata
  - support-tier report surfaces ecosystem maturity and automation coverage deterministically
- [ ] Extend `ecosystem status` and `ecosystem recommend` payloads with:
  - preset recommendations
  - resolved bundle plan
  - bootstrap/apply hints
- [ ] Extend capability and support-tier reporting with ecosystem maturity semantics
- [ ] Verify with:
  - `node --test tests/ecosystem-reporting-batch1.test.js`
  - focused existing suites impacted by reporting changes

### Task 4: Docs And Package Hygiene

**Files:**
- Create: `docs/ecosystem-bundles.md`
- Create: `docs/bootstrap-flow.md`
- Modify: `src/core/package-hygiene.js`
- Modify: `README.md`

- [ ] Add or update tests if package hygiene requires new static-asset assertions
- [ ] Document:
  - bundle vs preset responsibilities
  - bootstrap preview/apply flow
  - `doctor --bootstrap` diagnostic handoff semantics
  - install/bootstrap examples
- [ ] Ensure package hygiene accepts the new docs and bootstrap command assets
- [ ] Verify with:
  - focused package hygiene tests if affected
  - `node scripts/command-registry.js validate --json`

## Verification

After all tasks:

- focused new suites:
  - `node --test tests/ecosystem-presets-batch1.test.js tests/bootstrap-cli-batch1.test.js tests/ecosystem-recommend-batch2.test.js tests/ecosystem-reporting-batch1.test.js`
- focused regressions:
  - `node --test tests/ecosystem-cli-batch1.test.js tests/install-bootstrap-batch1.test.js tests/ecosystem-workspace-profile-batch1.test.js`
- registry and packaging:
  - `node scripts/command-registry.js validate --json`
  - targeted package hygiene verification if assets changed
- full suite:
  - `npm test`

## Exit Criteria

- `eoc bootstrap --json` supports a no-mutation preview flow
- `eoc bootstrap --apply --preset node-team` persists managed state and returns verification output
- `eoc ecosystem recommend` returns preset-aware recommendations
- `doctor --bootstrap` stays diagnostics-first and does not introduce a duplicated bootstrap code path
- capability and support-tier reports include ecosystem maturity / automation coverage
- docs explain the bundle/preset/bootstrap model clearly
- full repository suite passes in the isolated worktree
