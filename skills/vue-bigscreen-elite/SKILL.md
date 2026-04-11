---
name: vue-bigscreen-elite
description: Elite Vue 3 bigscreen design and engineering workflow for high-impact command-center dashboards with measurable quality.
origin: EOC
---

# Vue Bigscreen Elite

High-performance, high-fidelity Vue bigscreen delivery skill.

## When to Activate

- Building command-center dashboards in Vue
- Reworking existing large-screen data visualization UIs
- Designing dense real-time monitoring pages
- Improving visual identity, chart storytelling, and module hierarchy
- Fixing bigscreen runtime performance and animation quality issues

## Design Targets

- Strong visual direction with clear brand/system language
- Information hierarchy optimized for fast scanning and decision-making
- Smooth and restrained motion design with meaningful transitions
- Production-grade engineering quality, not demo-grade mock UIs

## Reference Benchmarks (Open Source)

- [vuejs/core](https://github.com/vuejs/core): Vue Composition API and rendering model best practices
- [vitejs/vite](https://github.com/vitejs/vite): fast feedback loop and build ergonomics
- [apache/echarts](https://github.com/apache/echarts): advanced charting and data storytelling patterns
- [antvis/G2Plot](https://github.com/antvis/G2Plot): grammar-based chart design patterns
- [ElemeFE/vue-dataV](https://github.com/ElemeFE/vue-dataV): large-screen visualization module inspirations

## Bigscreen Delivery Blueprint

### 1) Scenario + Data Contract First

- Define who uses the screen and what decision each module supports
- For each module, declare:
  - source endpoint
  - refresh cadence
  - transformation rules
  - failure fallback behavior

Before manual implementation, bootstrap structure with:

```bash
node scripts/vue-bigscreen-init.js --name command-center
```

### 2) Layout and Hierarchy

- Use a clear region model: `header / left / center / right / footer`
- Keep primary KPI and alert signal in central visual focus path
- Avoid uniform card-size repetition; mix scale and density intentionally

### 3) Visual System

- Create tokenized theme:
  - color ramps
  - typography scale
  - spacing scale
  - glow/shadow rules
- Keep chart palettes consistent with semantic meanings (normal/warn/critical)
- Use background atmosphere layers (gradient/noise/grid) subtly

### 4) Vue Engineering Structure

- Recommended structure:
  - `src/views/bigscreen/`
  - `src/components/bigscreen/`
  - `src/composables/bigscreen/`
  - `src/services/bigscreen/`
  - `src/styles/tokens/`
- Business/data logic in composables/services only
- View components focus on composition and rendering

### 5) Motion and Interaction

- Define motion categories:
  - scene entry
  - state transition
  - emphasis/alert
- Avoid perpetual noisy animation loops
- Provide reduced-motion path for accessibility

### 6) Performance Budget

- Initial meaningful render: target < 2.5s (dev baseline)
- Interaction smoothness: target >= 55 FPS for core animations
- Large charts:
  - lazy init when off-screen
  - update by patching data, not full re-create
- Polling/stream updates:
  - throttle or batch updates
  - avoid broad reactive object replacement

## Implementation Pattern (Vue 3)

```ts
// composables/bigscreen/useKpiStream.ts
import { computed, ref } from 'vue'

export function useKpiStream(fetcher: () => Promise<any>) {
  const loading = ref(false)
  const error = ref<Error | null>(null)
  const raw = ref<any>(null)

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      raw.value = await fetcher()
    } catch (e) {
      error.value = e as Error
    } finally {
      loading.value = false
    }
  }

  const cards = computed(() => {
    const data = raw.value || {}
    return {
      throughput: Number(data.throughput || 0),
      latencyP95: Number(data.latencyP95 || 0),
      availability: Number(data.availability || 0),
    }
  })

  return { loading, error, cards, refresh }
}
```

## Quality Checklist

- [ ] Visual language and hierarchy are explicit, not implicit
- [ ] Every key module has loading/empty/error states
- [ ] No hardcoded secrets or unsafe HTML injection
- [ ] Component boundaries and data adapters are clear
- [ ] Critical updates are incremental, not full-page redraw
- [ ] At least one deterministic validation command executed

## Acceptance Criteria

- Inputs: clear scenario, data sources, screen resolution targets, visual constraints
- Outputs: working Vue implementation with module architecture and measurable quality checks
- Validation: lint/build/test (if available) plus manual UX/perf sanity checks
- Done: dashboard is actionable, stable, and visually distinct from generic templates

## Skill Metadata

- Owner: `easy-opencode-team`
- Version: `1.0.0`
- Last Reviewed: `2026-04-11`
- Stability: `stable`
- Overlap Domain: `frontend`, `vue`, `dashboard`, `visualization`
