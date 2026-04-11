# Vue Bigscreen Command

Deliver high-end Vue bigscreen design and implementation for:
$ARGUMENTS

## Objective

Produce production-grade bigscreen UI output with strong visual direction, scalable architecture, and measurable runtime quality.

If the target project does not already contain bigscreen foundations, run:

```bash
/vue-bigscreen-init --name <screen-name>
```

## Required Workflow

1. Clarify scenario and data contracts (what decisions this screen enables).
2. Define visual concept (theme, hierarchy, interaction rhythm, motion language).
3. Produce component architecture (layout shell + chart modules + data adapters).
4. Implement in Vue 3 with composable patterns and tokenized styling.
5. Run quality checks and report measurable outcomes.

## Technical Baseline

- Framework: Vue 3 + Composition API + TypeScript preferred
- State: Pinia or composable state modules
- Charts: ECharts/AntV with clear data mapping boundaries
- Responsiveness: 1920x1080 first-class, adaptive for 1366+ and ultra-wide
- Performance target:
  - Initial render under 2.5s on dev baseline
  - Stable interaction 55+ FPS for key animated views
  - Avoid full re-render storms (fine-grained updates only)

## Quality Requirements

- No generic template-like layout; clear visual identity required
- No hardcoded secrets or unsafe HTML injection
- Provide loading/empty/error states for every critical card
- Include keyboard and focus behavior for core interactions
- Output verification checklist and any known tradeoffs

## Output Format

### 1. Design Direction
### 2. Information Architecture
### 3. Component/File Plan
### 4. Implementation
### 5. Validation Results
### 6. Remaining Risks
