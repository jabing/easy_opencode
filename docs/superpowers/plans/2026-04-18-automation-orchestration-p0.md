# Automation Orchestration P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `eoc implement` and the main command layer use a canonical ecosystem state and a mode-aware default automation pipeline without exposing low-level scheduler commands to normal users.

**Architecture:** P0 only implements the orchestration foundation: canonical ecosystem state loading, mode-aware automation policy, and `implement-task` integration. It deliberately does not implement bundle mutation, dedicated bootstrap CLI flows, or preset management; those remain follow-on work after this foundation is stable and tested.

**Tech Stack:** Node.js, CommonJS modules, `node:test`, existing workflow engine, existing scheduler/command registry infrastructure

---

## Scope

This plan executes only the P0 portion of the approved design.

Included in P0:

- canonical persisted ecosystem state loading
- mode-aware default automation policy
- `implement-task` orchestration through a shared default pipeline
- explainability output for policy and bundle decisions
- documentation updates for the default automation behavior

Explicitly deferred to follow-on plans:

- `eoc ecosystem` management CLI
- `eoc bootstrap` full detect -> recommend -> apply -> verify flow
- bundle mutation engine
- preset support
- dedicated MCP/LSP detector modules

## File Structure

### New Files

- `src/core/ecosystem/state.js`
  - Read `.opencode/ecosystem.json`
  - Validate minimal persisted state shape
  - Return normalized defaults when the file is absent
- `src/core/automation/default-pipeline.js`
  - Build mode-aware automation policy
  - Produce explainable pipeline steps for main commands
- `tests/ecosystem-state-batch1.test.js`
  - Verify state defaults, override normalization, and invalid input handling
- `tests/default-pipeline-batch1.test.js`
  - Verify mode-aware automation policy and explainability output
- `tests/implement-task-automation-batch1.test.js`
  - Verify `implement-task` uses the default pipeline and emits policy context

### Modified Files

- `src/control-plane/product/main-commands.js`
  - Route `implement` and `doctor` through policy-aware planning
- `src/control-plane/workflows/implement-task.js`
  - Replace fixed steps with a shared default automation pipeline contract
- `src/cli/command-registry.js`
  - Preserve current stable surface and expose automation metadata only for implemented scripts
- `src/shared/opencode-config.js`
  - Keep command routing aligned with implemented surfaces only
- `README.md`
  - Document the new default orchestration behavior and mode boundaries

## Task 1: Canonical Ecosystem State Loader

**Files:**
- Create: `src/core/ecosystem/state.js`
- Test: `tests/ecosystem-state-batch1.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { withTempDir, writeFiles } = require('./test-helpers.js');

test('loadEcosystemState returns normalized defaults when no managed file exists', async () => {
  const { loadEcosystemState } = require('../src/core/ecosystem/state.js');
  await withTempDir(async (dir) => {
    const state = loadEcosystemState(dir);
    assert.deepEqual(state, {
      schema_version: 1,
      applied_bundles: [],
      enabled_bundles: [],
      disabled_bundles: [],
      mode_overrides: {},
      automation_policy_overrides: {},
      bootstrap: null,
      source: 'default',
      file_path: path.join(dir, '.opencode', 'ecosystem.json'),
    });
  });
});

test('loadEcosystemState normalizes persisted arrays and ignores duplicate bundle entries', async () => {
  const { loadEcosystemState } = require('../src/core/ecosystem/state.js');
  await withTempDir(async (dir) => {
    writeFiles(dir, {
      '.opencode/ecosystem.json': JSON.stringify({
        schema_version: 1,
        applied_bundles: ['node-service', 'node-service'],
        enabled_bundles: ['release-governance', 'release-governance'],
        disabled_bundles: ['legacy-hooks'],
        mode_overrides: { implement_review_gate: true },
        automation_policy_overrides: { verify: 'fast' },
        bootstrap: { applied_at: '2026-04-18T00:00:00.000Z' },
      }, null, 2),
    });
    const state = loadEcosystemState(dir);
    assert.deepEqual(state.applied_bundles, ['node-service']);
    assert.deepEqual(state.enabled_bundles, ['release-governance']);
    assert.deepEqual(state.disabled_bundles, ['legacy-hooks']);
    assert.equal(state.source, 'managed');
  });
});

test('loadEcosystemState rejects invalid object shapes with a stable error', async () => {
  const { loadEcosystemState } = require('../src/core/ecosystem/state.js');
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, '.opencode'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.opencode', 'ecosystem.json'), '{"applied_bundles":"node-service"}');
    assert.throws(() => loadEcosystemState(dir), /invalid ecosystem state/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ecosystem-state-batch1.test.js`  
Expected: FAIL with `Cannot find module '../src/core/ecosystem/state.js'`

- [ ] **Step 3: Write minimal implementation**

```js
const fs = require('fs');
const path = require('path');

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((item) => String(item).trim()).filter(Boolean))).sort();
}

function validateRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid ecosystem state: ${label}`);
  }
}

function normalizeState(rootDir, raw, source) {
  validateRecord(raw, 'root');
  if (raw.mode_overrides !== undefined) validateRecord(raw.mode_overrides || {}, 'mode_overrides');
  if (raw.automation_policy_overrides !== undefined) validateRecord(raw.automation_policy_overrides || {}, 'automation_policy_overrides');
  return {
    schema_version: Number(raw.schema_version || 1),
    applied_bundles: uniqueStrings(raw.applied_bundles),
    enabled_bundles: uniqueStrings(raw.enabled_bundles),
    disabled_bundles: uniqueStrings(raw.disabled_bundles),
    mode_overrides: raw.mode_overrides || {},
    automation_policy_overrides: raw.automation_policy_overrides || {},
    bootstrap: raw.bootstrap || null,
    source,
    file_path: path.join(rootDir, '.opencode', 'ecosystem.json'),
  };
}

function loadEcosystemState(rootDir = process.cwd()) {
  const filePath = path.join(path.resolve(rootDir), '.opencode', 'ecosystem.json');
  if (!fs.existsSync(filePath)) {
    return normalizeState(rootDir, {}, 'default');
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return normalizeState(rootDir, raw, 'managed');
}

module.exports = {
  loadEcosystemState,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ecosystem-state-batch1.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ecosystem-state-batch1.test.js src/core/ecosystem/state.js
git commit -m "feat: add canonical ecosystem state loader"
```

## Task 2: Mode-Aware Default Automation Pipeline

**Files:**
- Create: `src/core/automation/default-pipeline.js`
- Modify: `src/control-plane/product/main-commands.js`
- Test: `tests/default-pipeline-batch1.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

test('buildAutomationPolicy returns lightweight implement behavior in solo mode', async () => {
  const { buildAutomationPolicy } = require('../src/core/automation/default-pipeline.js');
  const policy = buildAutomationPolicy({
    command: 'implement',
    mode: { id: 'solo' },
    ecosystemState: { enabled_bundles: [], automation_policy_overrides: {} },
    workspaceProfile: { recommended_bundles: ['node-service'] },
  });
  assert.equal(policy.command, 'implement');
  assert.equal(policy.scheduler.enabled, true);
  assert.equal(policy.verification.level, 'fast');
  assert.equal(policy.review_gate.enabled, false);
  assert.match(policy.explanation.join(' | '), /mode=solo/);
});

test('buildAutomationPolicy enables review gate by default in platform mode', async () => {
  const { buildAutomationPolicy } = require('../src/core/automation/default-pipeline.js');
  const policy = buildAutomationPolicy({
    command: 'implement',
    mode: { id: 'platform' },
    ecosystemState: { enabled_bundles: ['release-governance'], automation_policy_overrides: {} },
    workspaceProfile: { recommended_bundles: ['release-governance'] },
  });
  assert.equal(policy.review_gate.enabled, true);
  assert.equal(policy.verification.level, 'standard');
  assert.ok(policy.explanation.some((item) => item.includes('bundle=release-governance')));
});

test('buildMainCommandPlan includes automation policy for implement runs', async () => {
  const { buildMainCommandPlan } = require('../src/control-plane/product/main-commands.js');
  const plan = buildMainCommandPlan('implement', [], {
    rootDir: process.cwd(),
    mode: 'team',
    ecosystemState: {
      schema_version: 1,
      enabled_bundles: [],
      disabled_bundles: [],
      applied_bundles: [],
      automation_policy_overrides: {},
      mode_overrides: {},
      bootstrap: null,
      source: 'default',
      file_path: '',
    },
  });
  assert.equal(plan.command, 'implement');
  assert.equal(plan.automation_policy.review_gate.enabled, true);
  assert.equal(plan.runs[0].script, 'implement-task');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/default-pipeline-batch1.test.js`  
Expected: FAIL with missing module or missing `automation_policy`

- [ ] **Step 3: Write minimal implementation**

```js
// src/core/automation/default-pipeline.js
function buildAutomationPolicy({ command, mode, ecosystemState, workspaceProfile }) {
  const modeId = String(mode && mode.id || 'solo');
  const bundles = [
    ...new Set([
      ...((workspaceProfile && workspaceProfile.recommended_bundles) || []),
      ...((ecosystemState && ecosystemState.enabled_bundles) || []),
    ]),
  ];
  const policy = {
    command,
    scheduler: { enabled: command === 'implement' },
    verification: { level: modeId === 'solo' ? 'fast' : 'standard' },
    review_gate: { enabled: modeId === 'platform' || modeId === 'team' },
    explanation: [`mode=${modeId}`, ...bundles.map((bundle) => `bundle=${bundle}`)],
  };
  if (ecosystemState && ecosystemState.automation_policy_overrides && ecosystemState.automation_policy_overrides.review_gate !== undefined) {
    policy.review_gate.enabled = Boolean(ecosystemState.automation_policy_overrides.review_gate);
    policy.explanation.push('override=review_gate');
  }
  return policy;
}

module.exports = {
  buildAutomationPolicy,
};
```

```js
// src/control-plane/product/main-commands.js
const { getMode } = require('./modes.js');
const { buildAutomationPolicy } = require('../../core/automation/default-pipeline.js');

function buildMainCommandPlan(command, argv = [], options = {}) {
  const mode = getMode(options.rootDir || process.cwd(), options.mode || null);
  const ecosystemState = options.ecosystemState || {
    schema_version: 1,
    applied_bundles: [],
    enabled_bundles: [],
    disabled_bundles: [],
    mode_overrides: {},
    automation_policy_overrides: {},
    bootstrap: null,
    source: 'default',
    file_path: '',
  };
  if (String(command) === 'implement') {
    const automation_policy = buildAutomationPolicy({
      command: 'implement',
      mode,
      ecosystemState,
      workspaceProfile: { recommended_bundles: ecosystemState.applied_bundles || [] },
    });
    return {
      command: 'implement',
      mode,
      automation_policy,
      runs: [{ script: 'implement-task', args: ['run', ...argv] }],
    };
  }
  // keep existing switch branches unchanged
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/default-pipeline-batch1.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/default-pipeline-batch1.test.js src/core/automation/default-pipeline.js src/control-plane/product/main-commands.js
git commit -m "feat: add mode-aware automation policy foundation"
```

## Task 3: Wire Implement Workflow To Default Pipeline

**Files:**
- Modify: `src/control-plane/workflows/implement-task.js`
- Test: `tests/implement-task-automation-batch1.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

test('implement workflow uses automation policy to record orchestration context', async () => {
  const { executeImplementTaskWorkflow } = require('../src/control-plane/workflows/implement-task.js');
  const result = await executeImplementTaskWorkflow({
    rootDir: process.cwd(),
    traceId: 'implement-test',
    profile: { runtime: 'node' },
    benchmarkFeedback: { risk_level: 'low' },
    snapshot: { status: 'ok' },
    opts: {},
    selectedSkill: null,
    selection: null,
    automationPolicy: {
      scheduler: { enabled: true },
      verification: { level: 'fast' },
      review_gate: { enabled: false },
      explanation: ['mode=solo'],
    },
    runScaffold() { return { status: 'skipped', created: false }; },
    createCoderRun() { return { run_id: 'run-1' }; },
    executeCoderRound() { return { checks: [{ id: 'fast-test' }] }; },
    loadCoderRun() { return { checks: [{ id: 'fast-test' }] }; },
    writePlanArtifacts() { return { plan: { plan_id: 'plan-1' }, promptText: 'hello' }; },
  });
  const steps = result.steps.map((item) => item.id);
  assert.ok(steps.includes('resolve-automation-policy'));
  assert.ok(steps.includes('execute-validation-round'));
  const policyStep = result.steps.find((item) => item.id === 'resolve-automation-policy');
  assert.match(policyStep.summary, /mode=solo/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/implement-task-automation-batch1.test.js`  
Expected: FAIL because the workflow does not contain `resolve-automation-policy`

- [ ] **Step 3: Write minimal implementation**

```js
/** @typedef {{ scheduler?: { enabled?: boolean }, verification?: { level?: string }, review_gate?: { enabled?: boolean }, explanation?: string[] }} AutomationPolicy */
/** @typedef {{ automationPolicy?: AutomationPolicy } & ImplementTaskWorkflowContext} ImplementTaskWorkflowContextWithPolicy */

async function resolveAutomationPolicyStep(ctx) {
  const policy = ctx.automationPolicy || {
    scheduler: { enabled: true },
    verification: { level: 'fast' },
    review_gate: { enabled: false },
    explanation: ['mode=solo'],
  };
  ctx.automationPolicy = policy;
  return {
    summary: [
      `scheduler=${policy.scheduler && policy.scheduler.enabled === true ? 'on' : 'off'}`,
      `verify=${policy.verification && policy.verification.level || 'fast'}`,
      ...((policy.explanation || []).slice(0, 3)),
    ].join(' | '),
  };
}

function shouldExecuteValidationRound(ctx) {
  if (ctx.opts['no-validate']) return false;
  const policy = ctx.automationPolicy || {};
  return policy.verification ? policy.verification.level !== 'off' : true;
}

const implementTaskWorkflow = defineWorkflow({
  id: 'implement-task',
  title: 'Implementation Planning Workflow',
  version: '5.0',
  steps: [
    { id: 'detect-project-profile', title: 'Detect project profile', run: (context) => detectProjectProfileStep(context) },
    { id: 'resolve-automation-policy', title: 'Resolve automation policy', run: (context) => resolveAutomationPolicyStep(context) },
    { id: 'select-skill', title: 'Select skill', run: (context) => selectSkillStep(context) },
    // keep remaining steps, reusing shouldExecuteValidationRound
  ],
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/implement-task-automation-batch1.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/implement-task-automation-batch1.test.js src/control-plane/workflows/implement-task.js
git commit -m "feat: wire implement workflow to automation policy"
```

## Task 4: Document And Lock The P0 Surface

**Files:**
- Modify: `src/cli/command-registry.js`
- Modify: `src/shared/opencode-config.js`
- Modify: `README.md`
- Test: `tests/automation-surface-batch1.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCommandRegistry } = require('../src/cli/command-registry.js');

test('P0 does not publish bootstrap or ecosystem commands before their CLI implementations exist', async () => {
  const entries = buildCommandRegistry(process.cwd());
  const scripts = entries.map((entry) => entry.script);
  assert.equal(scripts.includes('bootstrap'), false);
  assert.equal(scripts.includes('ecosystem'), false);
});

test('README documents mode-aware implement automation', async () => {
  const fs = require('fs');
  const path = require('path');
  const body = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');
  assert.match(body, /mode-aware automation/i);
  assert.match(body, /implement.*scheduler/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/automation-surface-batch1.test.js`  
Expected: FAIL because README does not yet document the new behavior

- [ ] **Step 3: Write minimal implementation**

```md
<!-- README.md -->
## Default Automation

Easy OpenCode now treats `eoc implement` as a mode-aware orchestration entrypoint.

- In `solo`, implementation runs the scheduler and lightweight verification by default.
- In `team`, implementation adds stronger verification and conditional review behavior.
- In `platform`, implementation keeps the strongest governance defaults.

This automation remains inside the main six-command kernel. Low-level orchestration commands stay internal.
```

```js
// src/cli/command-registry.js
const EXPERIMENTAL_SCRIPTS = new Set(['claw', 'eoc-ultrawork', 'eoc-bridge', 'eoc-start', 'eoc-scheduler']);
// P0 intentionally does not add bootstrap/ecosystem script registration until their implementations exist.
```

```js
// src/shared/opencode-config.js
// Keep current command routing stable in P0.
// Do not register bootstrap/ecosystem command templates until the command implementations are present.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/automation-surface-batch1.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/automation-surface-batch1.test.js src/cli/command-registry.js src/shared/opencode-config.js README.md
git commit -m "docs: lock p0 automation surface"
```

## Task 5: Full P0 Verification

**Files:**
- Test: `tests/ecosystem-state-batch1.test.js`
- Test: `tests/default-pipeline-batch1.test.js`
- Test: `tests/implement-task-automation-batch1.test.js`
- Test: `tests/automation-surface-batch1.test.js`

- [ ] **Step 1: Run the focused P0 suite**

Run:

```bash
node --test tests/ecosystem-state-batch1.test.js tests/default-pipeline-batch1.test.js tests/implement-task-automation-batch1.test.js tests/automation-surface-batch1.test.js
```

Expected: all four test files PASS

- [ ] **Step 2: Run existing regression checks for touched core files**

Run:

```bash
node --test tests/cli-refactor-boundary-batch1.test.js tests/command-productization-batchB.test.js tests/installed-mode-blackbox-batch4.test.js
```

Expected: PASS

- [ ] **Step 3: Run full repository suite**

Run:

```bash
npm test
```

Expected: repository test suite PASS with zero failures

- [ ] **Step 4: Review changed files against P0 scope**

Checklist:

- no bundle mutation engine added
- no bootstrap public command registered
- no ecosystem public command registered
- no preset logic added
- `implement-task` uses automation policy
- README reflects the new P0 default behavior

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add p0 automation orchestration foundation"
```

## Spec Coverage Check

- Canonical persisted ecosystem state: covered by Task 1
- Mode-aware automation policy: covered by Task 2
- `implement-task` orchestration integration: covered by Task 3
- P0 surface and docs alignment: covered by Task 4
- P0 verification and regression control: covered by Task 5

No P0 gaps remain in this plan.

## Placeholder Scan

Checked for:

- `TODO`
- `TBD`
- undefined file paths
- undefined commands
- missing test commands

No placeholders intentionally remain.

## Type Consistency Check

- `loadEcosystemState` is introduced once in Task 1 and reused consistently
- `buildAutomationPolicy` is introduced once in Task 2 and reused consistently
- `automationPolicy` field name is used consistently in Task 3
- `bootstrap` and `ecosystem` command implementations are intentionally deferred and not referenced as implemented P0 code

## Follow-On Plans

After this P0 plan lands:

- P1 plan should implement ecosystem state mutation, detectors, install bootstrap integration, and `ecosystem` CLI
- P2 plan should implement `bootstrap` CLI, presets, and maturity reporting

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-automation-orchestration-p0.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
