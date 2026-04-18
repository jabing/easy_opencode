# Automation Orchestration And Ecosystem Defaults Design

Date: 2026-04-18
Status: Proposed
Scope: Product-layer redesign for stronger default automation and default ecosystem capability management

## Summary

Easy OpenCode already contains the technical building blocks for richer automation:

- a stable six-command product kernel
- an orchestrator and scheduler
- installable hooks and plugin assets
- project/runtime profiling
- structured quality, review, and release gates

What it lacks is productization. The current system exposes these capabilities as expert tools instead of making them the default execution path for normal users.

This design keeps the six main commands stable and adds a small explicit ecosystem layer:

- `eoc bootstrap`
- `eoc ecosystem`

The result is a three-layer product model:

- Main workflow layer: `plan`, `implement`, `test`, `review`, `ship`, `doctor`
- Ecosystem assembly layer: `bootstrap`, `ecosystem`
- Internal execution layer: scheduler, bridge, hooks, profile, capability registry

## Problem

The current product is strong in engineering governance but weaker in perceived automation and default ecosystem power.

Observed gaps:

- `implement` does not consistently feel like a full automatic pipeline
- scheduler and DAG orchestration exist, but they are not the default path
- hook automation exists, but is configured as a low-level capability instead of an ecosystem policy
- install flows copy assets, but do not strongly bootstrap a project into a recommended operating posture
- runtime, LSP, MCP, and tool discovery are not unified behind a visible ecosystem model

This creates a capability gap versus products that feel more batteries-included by default.

## Goals

- Keep the six-command slim kernel intact
- Make automation orchestration the default behavior behind main commands
- Introduce a clear and explainable ecosystem capability model
- Make first-time project setup much stronger through guided bootstrap
- Keep all automatic behavior auditable, reversible, and understandable

## Non-Goals

- No large expansion of the top-level command surface
- No remote marketplace or dynamic plugin download system in the first phase
- No breaking redesign of existing scheduler or bridge internals if wrapping is sufficient
- No hidden black-box automation that users cannot inspect or explain

## Design Choice

Three implementation shapes were considered:

1. Hide everything behind the six commands
2. Add a bootstrap-only entrypoint
3. Add both `bootstrap` and `ecosystem`

Recommended choice: option 3.

Reasoning:

- Hiding everything preserves simplicity but weakens explainability
- Bootstrap alone improves first-run experience but does not provide ongoing management
- A dual-surface model preserves the slim kernel while giving explicit, bounded control over ecosystem behavior

## Target Product Model

### Main Workflow Layer

Stable public commands:

- `eoc plan`
- `eoc implement`
- `eoc test`
- `eoc review`
- `eoc ship`
- `eoc doctor`

These remain the day-to-day surface. Users should not need to learn scheduler or bridge commands.

### Ecosystem Assembly Layer

New public commands:

- `eoc bootstrap`
- `eoc ecosystem`

Responsibilities:

- detect current workspace capabilities
- recommend bundles and defaults
- apply and explain hooks, profile, and automation policy
- manage ecosystem capabilities after installation

### Internal Execution Layer

Existing internals continue to exist:

- scheduler
- bridge
- hooks
- capability registry
- support-tier and project-profile systems

These become implementation details behind the main workflow and ecosystem commands.

## Core Objects

### Workspace Profile

`workspace profile` is the normalized current-state model for a repository.

Minimum fields:

- project root
- detected runtimes
- primary package manager
- operating mode (`solo`, `team`, `platform`)
- CI markers
- LSP availability by language
- MCP/tooling availability
- recommended bundles
- applied bundles

This is an ephemeral fact model, not the persisted source of truth.

It should be recomputed from:

- repository facts
- existing managed config
- user overrides

It may be cached for one command invocation, but it should not become the canonical persisted control plane state.

### Ecosystem State

`ecosystem state` is the canonical persisted control plane record for ecosystem behavior.

Proposed managed file:

- `.opencode/ecosystem.json`

Minimum fields:

- schema version
- applied bundles
- explicit user-enabled bundles
- explicit user-disabled bundles
- mode overrides
- automation policy overrides
- bootstrap metadata

This file is the source of truth for persisted ecosystem intent.

### Source Of Truth Rules

Automation and ecosystem decisions must follow one precedence chain:

1. explicit user override
2. persisted ecosystem state
3. derived workspace profile facts
4. built-in bundle defaults

This prevents commands, hooks, and installers from deriving different answers from the same repository.

### Capability Bundle

`capability bundle` is a named set of behaviors and assets applied together.

Examples:

- `node-service`
- `python-api`
- `go-backend`
- `release-governance`
- `lsp-refactor`
- `mcp-devtools`

Each bundle may contribute:

- recommended commands or workflow defaults
- hook policies
- verification defaults
- runtime/tooling requirements
- optional supporting skills

### Automation Policy

`automation policy` defines what the six main commands do by default.

Example policy decisions:

- whether `implement` automatically builds an execution packet
- whether scheduler execution is parallel or sequential
- whether review and test gates are auto-run
- whether `ship` requires release evidence or rehearsal

Automation policy is derived from:

- operating mode
- persisted ecosystem state
- workspace profile facts
- applied bundles

It must always be explainable through the source-of-truth rules above.

### Bootstrap Report

`bootstrap report` is a machine-readable and human-readable summary of:

- what was detected
- what is missing
- what was recommended
- what was applied
- what requires user action

## Default Command Behavior

### `eoc implement`

Default path:

1. load workspace profile
2. resolve automation policy
3. resolve recommended bundles
4. build execution packet
5. run scheduler automatically
6. run verification and review gates as policy requires
7. return either green status or a concrete repair brief

The user should not need to call `eoc-parallel`, `eoc-bridge`, or `eoc-scheduler` directly.

### `eoc doctor`

Default path:

- validate installation and workflow health
- show missing capabilities and degraded areas

Extended path:

- `eoc doctor --bootstrap`
- runs the same detection logic as `bootstrap`, but stays in diagnostics-first mode
- may preview recommended changes and hand off to `eoc bootstrap`
- should not silently become a second independent bootstrap implementation

### `eoc bootstrap`

First-run and remediation command.

Default path:

1. detect workspace profile
2. recommend bundles
3. preview changes
4. apply selected changes
5. verify resulting setup
6. emit bootstrap report

This is the only command that should own detect -> recommend -> apply -> verify as a full managed flow.

### `eoc ecosystem`

Ongoing management command.

Subcommands:

- `status`
- `list`
- `recommend`
- `enable node-service`
- `disable node-service`
- `apply`

The key requirement is explanation. Users must be able to answer:

- which bundles are active
- why they were chosen
- which hooks and policies came from them

## Mode Boundaries

The default automation surface must differ by mode. Without this, `implement` becomes too expensive for `solo` and too weak for `platform`.

### `solo`

Default posture:

- shortest path
- low ceremony
- automatic scheduler allowed
- only lightweight verification by default

Default `implement` behavior:

- build execution packet
- run scheduler
- run fast local verification only
- do not auto-run heavyweight review or release evidence steps unless explicitly requested

### `team`

Default posture:

- balanced throughput and quality
- stronger default review posture

Default `implement` behavior:

- build execution packet
- run scheduler
- run standard verification
- run review gate when change scope or risk crosses threshold

### `platform`

Default posture:

- governance-first
- strongest release and audit defaults

Default `implement` behavior:

- build execution packet
- run scheduler
- run standard verification
- run review gate by default
- require stronger downstream release evidence for `ship`

### Automation Cost Guardrails

Regardless of mode:

- commands must support degraded execution when tools are unavailable
- expensive steps must be skippable through explicit override
- explanation output must state why a heavier path was chosen
- low-level failures in optional ecosystem tooling must not prevent core workflows unless policy explicitly requires them

## Architecture

### Decision Flow

Main workflow commands should follow one common decision path:

1. load persisted ecosystem state
2. derive workspace profile facts
3. resolve applied bundles
4. derive automation policy
5. execute command-specific pipeline
6. record observability and explanation output

This replaces scattered feature-specific defaults with one product-level decision model.

### Bundle Application Model

Bundles should not directly mutate arbitrary project state from multiple places.

Instead:

1. detectors produce normalized facts
2. bundle resolution produces a desired capability set
3. bundle application writes a bounded set of managed assets
4. commands and hooks read from those managed assets

This keeps mutation centralized and testable.

### Explainability Requirement

Every automatic behavior should be attributable to one of:

- workspace profile fact
- operating mode
- applied bundle
- explicit user override

If behavior cannot be traced to one of these, it is too implicit.

### Command Ownership

Responsibility boundaries must remain explicit:

- `bootstrap` owns detect -> recommend -> apply -> verify
- `doctor` owns diagnose -> explain -> optionally hand off to bootstrap
- `ecosystem` owns inspect -> enable -> disable -> apply existing ecosystem intents
- main workflow commands own execution, not ecosystem mutation

This prevents command overlap and duplicated control logic.

## File-Level Plan

## P0

Goal: productize default automation orchestration behind the six main commands.

New files:

- `src/core/automation/default-pipeline.js`
  - Define the default execution pipelines for `implement`, `test`, `review`, `ship`, and `doctor`
  - Centralize sequencing and scheduler handoff
- `src/core/ecosystem/workspace-profile.js`
  - Aggregate runtime/profile/tooling facts into a single normalized record
- `src/core/ecosystem/bundle-registry.js`
  - Define built-in bundle metadata and matching rules used for recommendation only in P0
- `src/core/ecosystem/state.js`
  - Load and validate persisted ecosystem state from managed config
- `src/core/ecosystem/bootstrap-report.js`
  - Render structured bootstrap and ecosystem explanation output

Changed files:

- `src/control-plane/workflows/implement-task.js`
  - Move from single-workflow execution to policy-driven automatic orchestration
- `src/control-plane/product/main-commands.js`
  - Attach automation policy metadata to the stable six-command surface
- `src/cli/eoc-start-cli.js`
  - Provide reusable internal start semantics for automatic packet execution
- `src/cli/eoc-scheduler-cli.js`
  - Expose a stronger programmatic interface for orchestrator use
- `src/shared/opencode-config.js`
  - Register new `bootstrap` and `ecosystem` commands
- `src/cli/command-registry.js`
  - Promote new ecosystem-facing commands while keeping scheduler internals hidden
- `README.md`
  - Document the default automation model

Out of scope for P0:

- explicit MCP detector modules
- explicit LSP detector modules
- bundle application and mutation engine
- preset support

P0 dependency rule:

- P0 may use existing runtime, profile, and capability signals already present in the codebase
- P0 must not require the full P1 detector stack to function
- P0 bundle handling is recommendation-only and read-only
- P0 persistence is limited to reading canonical ecosystem state if present

Acceptance:

- `eoc implement` can drive scheduler-backed orchestration without explicit low-level commands
- automation output explains which policy and bundles produced the run behavior
- mode-specific automation boundaries are documented and reflected in orchestration decisions

## P1

Goal: introduce explicit ecosystem capability management.

New files:

- `src/cli/ecosystem-cli.js`
  - Provide `status`, `list`, `recommend`, `enable`, `disable`, and `apply`
- `src/core/ecosystem/apply-bundles.js`
  - Apply bundle decisions to managed config, hooks, and profiles
- `src/core/ecosystem/state-schema.js`
  - Define and validate canonical persisted ecosystem state
- `src/core/ecosystem/detectors/mcp.js`
  - Detect MCP-related capabilities and available integration facts
- `src/core/ecosystem/detectors/lsp.js`
  - Detect LSP availability and language support quality
- `src/core/ecosystem/detectors/tooling.js`
  - Detect package manager, CI, and toolchain readiness

Changed files:

- `src/cli/install-cli.js`
  - Support `--bootstrap`, `--bundle`, and stronger ecosystem-aware initialization
- `scripts/install.js`
  - Route installation through bootstrap-aware setup when requested
- `.opencode/plugins/eoc-hooks.ts`
  - Read bundle-derived hook policy instead of static low-level toggles only
- `commands/hook-config.md`
  - Reposition hooks as ecosystem-managed policy, not only manual toggles
- `src/shared/product-scope.js`
  - Include new ecosystem assets in managed product scope

Acceptance:

- installation can bootstrap a workspace into a recommended starting posture
- `eoc ecosystem status` can explain applied bundles, hook origins, and capability gaps
- bundle application writes one canonical managed ecosystem state instead of duplicating state across commands

## P2

Goal: add preset-based ecosystem onboarding and maturity reporting.

New files:

- `src/cli/bootstrap-cli.js`
  - Provide first-run detect -> recommend -> apply -> verify flow
- `src/core/ecosystem/presets.js`
  - Define higher-level preset combinations such as `node-team` and `python-platform`
- `docs/ecosystem-bundles.md`
  - Document bundle semantics and bundle composition rules
- `docs/bootstrap-flow.md`
  - Document bootstrap UX and lifecycle

Changed files:

- `src/core/capabilities/registry.js`
  - Expose bundles and presets as managed product capabilities
- `src/core/support-tiers/report.js`
  - Report automation coverage and ecosystem maturity
- `scripts/package-hygiene.js`
  - Validate bundle and preset assets for packaging consistency
- `README.md`
  - Add bootstrap and ecosystem preset usage examples

Acceptance:

- users can run `eoc bootstrap --preset node-team`
- support-tier reporting can show ecosystem and automation readiness, not only command capability

## Risks

### Risk: product surface drift

If `bootstrap` and `ecosystem` grow unchecked, the product loses its slim-kernel advantage.

Mitigation:

- keep these as the only new public commands
- keep scheduler and bridge internal

### Risk: hidden automation becomes hard to debug

Mitigation:

- require explanation output for every policy decision
- ensure `ecosystem status` can trace behavior back to bundles, mode, or user override

### Risk: config mutation becomes fragmented

Mitigation:

- centralize mutation in bundle application logic
- keep hooks, profile, and ecosystem config under one managed path

## Rollout Order

Recommended order:

1. implement P0 orchestration model
2. implement P1 ecosystem management and install/bootstrap integration
3. implement P2 presets and maturity reporting

This order keeps the product usable after each phase and avoids building a bundle system that has no default execution path.

## Decision

Proceed with:

- stable six-command main workflow
- new explicit `bootstrap` and `ecosystem` commands
- default orchestration behind `implement`
- bundle-driven ecosystem defaults
- explainable and auditable automation policy
