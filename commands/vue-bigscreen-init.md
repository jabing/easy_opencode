# Vue Bigscreen Init Command

Generate a production-oriented Vue 3 bigscreen scaffold in the current project.

## Usage

```bash
# default scaffold in current project
node scripts/vue-bigscreen-init.js

# custom screen name
node scripts/vue-bigscreen-init.js --name city-ops

# write into another directory
node scripts/vue-bigscreen-init.js --dir ./apps/admin

# overwrite existing scaffold files
node scripts/vue-bigscreen-init.js --name city-ops --force
```

## Generated Structure

- `src/views/bigscreen/*Screen.vue`
- `src/components/bigscreen/layout/BigscreenShell.vue`
- `src/components/bigscreen/modules/KpiCard.vue`
- `src/components/bigscreen/modules/TrendChart.vue`
- `src/composables/bigscreen/*`
- `src/services/bigscreen/dashboard.adapter.ts`
- `src/styles/tokens/bigscreen.css`
- `src/views/bigscreen/README.md`

## Next Steps

1. Install chart dependency: `npm i echarts`
2. Import style tokens in app entry: `import "@/styles/tokens/bigscreen.css"`
3. Register route to generated screen component
4. Replace mock adapter with real backend payload mapping
