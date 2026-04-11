#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i += 1;
    }
  }
  return opts;
}

function toPascal(raw) {
  return String(raw || 'command-center')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())
    .join('');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFileSafe(filePath, content, force, result) {
  if (fs.existsSync(filePath) && !force) {
    result.skipped.push(filePath);
    return;
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
  result.created.push(filePath);
}

function usage() {
  console.log('Usage:');
  console.log('  node scripts/vue-bigscreen-init.js [--name command-center] [--dir .] [--force]');
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help || opts.h || opts['--help']) {
    usage();
    process.exit(0);
  }

  const force = opts.force === true;
  const baseDir = path.resolve(process.cwd(), String(opts.dir || '.'));
  const screenBase = toPascal(opts.name || 'command-center');
  const screenName = `${screenBase}Screen`;

  const result = { created: [], skipped: [] };

  const files = [
    {
      rel: `src/views/bigscreen/${screenName}.vue`,
      content: `<template>
  <BigscreenShell title="${screenBase} Dashboard">
    <template #left>
      <section class="stack">
        <KpiCard title="Throughput" :value="kpis.throughput" unit="req/s" trend="+3.2%" />
        <KpiCard title="Latency P95" :value="kpis.latencyP95" unit="ms" trend="-5.1%" />
      </section>
    </template>

    <template #center>
      <section class="panel panel--main">
        <h3>Core Trend</h3>
        <TrendChart :series-data="trendData" />
      </section>
    </template>

    <template #right>
      <section class="stack">
        <KpiCard title="Availability" :value="kpis.availability" unit="%" trend="+0.2%" />
        <KpiCard title="Active Alerts" :value="kpis.alerts" unit="" trend="-1" />
      </section>
    </template>
  </BigscreenShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BigscreenShell from '@/components/bigscreen/layout/BigscreenShell.vue'
import KpiCard from '@/components/bigscreen/modules/KpiCard.vue'
import TrendChart from '@/components/bigscreen/modules/TrendChart.vue'
import { useKpiStream } from '@/composables/bigscreen/useKpiStream'
import { useBigscreenScale } from '@/composables/bigscreen/useBigscreenScale'

useBigscreenScale()

const { data } = useKpiStream()

const kpis = computed(() => data.value.kpis)
const trendData = computed(() => data.value.trend)
</script>

<style scoped>
.stack {
  display: grid;
  gap: 14px;
}

.panel {
  border: 1px solid var(--bs-border);
  background: var(--bs-surface);
  border-radius: 12px;
  padding: 16px;
}

.panel--main {
  min-height: 420px;
}
</style>
`,
    },
    {
      rel: 'src/components/bigscreen/layout/BigscreenShell.vue',
      content: `<template>
  <main class="bigscreen-shell" :style="scaleStyle">
    <header class="shell-header">
      <h1>{{ title }}</h1>
      <div class="shell-time">{{ now }}</div>
    </header>
    <section class="shell-body">
      <aside class="col left"><slot name="left" /></aside>
      <section class="col center"><slot name="center" /></section>
      <aside class="col right"><slot name="right" /></aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNowClock } from '@/composables/bigscreen/useNowClock'
import { useBigscreenScaleState } from '@/composables/bigscreen/useBigscreenScale'

defineProps<{ title: string }>()
const { now } = useNowClock()
const { scale } = useBigscreenScaleState()
const scaleStyle = computed(() => ({ transform: \`scale(\${scale.value})\` }))
</script>

<style scoped>
.bigscreen-shell {
  width: 1920px;
  height: 1080px;
  transform-origin: top left;
  color: var(--bs-text);
  background:
    radial-gradient(1200px 700px at 50% 10%, rgba(0, 220, 255, 0.15), rgba(0, 0, 0, 0)),
    linear-gradient(180deg, #05131f 0%, #02070f 100%);
  padding: 16px 20px;
  box-sizing: border-box;
}

.shell-header {
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--bs-border);
}

.shell-header h1 {
  font-size: 28px;
  letter-spacing: 0.04em;
}

.shell-time {
  color: var(--bs-muted);
}

.shell-body {
  height: calc(100% - 90px);
  display: grid;
  grid-template-columns: 420px 1fr 420px;
  gap: 16px;
  margin-top: 14px;
}

.col {
  min-height: 0;
}
</style>
`,
    },
    {
      rel: 'src/components/bigscreen/modules/KpiCard.vue',
      content: `<template>
  <article class="kpi-card">
    <header>{{ title }}</header>
    <div class="value">
      <strong>{{ value }}</strong>
      <span>{{ unit }}</span>
    </div>
    <footer>{{ trend }}</footer>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  value: number | string
  unit: string
  trend: string
}>()
</script>

<style scoped>
.kpi-card {
  border: 1px solid var(--bs-border);
  background: var(--bs-surface);
  border-radius: 12px;
  padding: 14px;
}

header {
  font-size: 13px;
  color: var(--bs-muted);
}

.value {
  margin-top: 8px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

strong {
  font-size: 34px;
  color: var(--bs-accent);
}

footer {
  margin-top: 8px;
  font-size: 12px;
}
</style>
`,
    },
    {
      rel: 'src/components/bigscreen/modules/TrendChart.vue',
      content: `<template>
  <div ref="host" class="trend-chart" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{ seriesData: number[] }>()
const host = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

function render() {
  if (!chart) return
  chart.setOption({
    backgroundColor: 'transparent',
    grid: { top: 20, left: 20, right: 20, bottom: 20 },
    xAxis: { type: 'category', data: props.seriesData.map((_, i) => i + 1), boundaryGap: false },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(120,160,190,0.2)' } } },
    series: [
      {
        type: 'line',
        smooth: 0.3,
        data: props.seriesData,
        symbol: 'none',
        lineStyle: { width: 3, color: '#26d9ff' },
        areaStyle: { color: 'rgba(38,217,255,0.18)' },
      },
    ],
  })
}

onMounted(() => {
  if (!host.value) return
  chart = echarts.init(host.value)
  render()
  window.addEventListener('resize', resize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
  chart = null
})

watch(() => props.seriesData, render, { deep: false })

function resize() {
  chart?.resize()
}
</script>

<style scoped>
.trend-chart {
  width: 100%;
  height: 360px;
}
</style>
`,
    },
    {
      rel: 'src/composables/bigscreen/useBigscreenScale.ts',
      content: `import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const BASE_W = 1920
const BASE_H = 1080
const scale = ref(1)

function updateScale() {
  const w = window.innerWidth / BASE_W
  const h = window.innerHeight / BASE_H
  scale.value = Math.min(w, h)
}

export function useBigscreenScale() {
  onMounted(() => {
    updateScale()
    window.addEventListener('resize', updateScale)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateScale)
  })

  return { scale: computed(() => scale.value) }
}

export function useBigscreenScaleState() {
  return { scale: computed(() => scale.value) }
}
`,
    },
    {
      rel: 'src/composables/bigscreen/useKpiStream.ts',
      content: `import { onMounted, ref } from 'vue'
import { fetchDashboardPayload, toDashboardViewModel } from '@/services/bigscreen/dashboard.adapter'

type DashboardVm = ReturnType<typeof toDashboardViewModel>

export function useKpiStream() {
  const loading = ref(false)
  const error = ref<string>('')
  const data = ref<DashboardVm>(toDashboardViewModel({}))

  async function refresh() {
    loading.value = true
    error.value = ''
    try {
      const payload = await fetchDashboardPayload()
      data.value = toDashboardViewModel(payload)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'unknown error'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    refresh()
    setInterval(refresh, 30000)
  })

  return { loading, error, data, refresh }
}
`,
    },
    {
      rel: 'src/composables/bigscreen/useNowClock.ts',
      content: `import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useNowClock() {
  const now = ref(formatNow())
  let timer: NodeJS.Timeout | null = null

  onMounted(() => {
    timer = setInterval(() => {
      now.value = formatNow()
    }, 1000)
  })

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    timer = null
  })

  return { now }
}

function formatNow() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return \`\${d.getFullYear()}-\${pad(d.getMonth() + 1)}-\${pad(d.getDate())} \${pad(d.getHours())}:\${pad(d.getMinutes())}:\${pad(d.getSeconds())}\`
}
`,
    },
    {
      rel: 'src/services/bigscreen/dashboard.adapter.ts',
      content: `type RawPayload = {
  throughput?: number
  latencyP95?: number
  availability?: number
  alerts?: number
  trend?: number[]
}

export async function fetchDashboardPayload(): Promise<RawPayload> {
  // Replace with your real API call.
  return Promise.resolve({
    throughput: 12840,
    latencyP95: 86,
    availability: 99.96,
    alerts: 3,
    trend: [72, 86, 78, 93, 105, 98, 110, 118, 121, 116, 130, 136],
  })
}

export function toDashboardViewModel(raw: RawPayload) {
  return {
    kpis: {
      throughput: Number(raw.throughput || 0),
      latencyP95: Number(raw.latencyP95 || 0),
      availability: Number(raw.availability || 0),
      alerts: Number(raw.alerts || 0),
    },
    trend: Array.isArray(raw.trend) ? raw.trend.map((x) => Number(x || 0)) : [],
  }
}
`,
    },
    {
      rel: 'src/styles/tokens/bigscreen.css',
      content: `:root {
  --bs-text: #e8f2ff;
  --bs-muted: #8fb3cf;
  --bs-accent: #26d9ff;
  --bs-border: rgba(72, 136, 172, 0.35);
  --bs-surface: linear-gradient(180deg, rgba(7, 33, 54, 0.78), rgba(6, 21, 35, 0.92));
}
`,
    },
    {
      rel: 'src/views/bigscreen/README.md',
      content: `# Bigscreen Integration Guide

1. Import style tokens in your app entry:
   - \`import "@/styles/tokens/bigscreen.css"\`
2. Register route to this screen component:
   - \`src/views/bigscreen/${screenName}.vue\`
3. Ensure dependency installed:
   - \`npm i echarts\`
4. Replace mock payload adapter:
   - \`src/services/bigscreen/dashboard.adapter.ts\`
`,
    },
  ];

  for (const f of files) {
    writeFileSafe(path.join(baseDir, f.rel), f.content, force, result);
  }

  console.log('Vue bigscreen scaffold complete.');
  console.log(`Base dir: ${baseDir}`);
  console.log(`Screen: ${screenName}`);
  console.log(`Created: ${result.created.length}`);
  console.log(`Skipped: ${result.skipped.length}`);
  if (result.created.length > 0) {
    console.log('Created files:');
    result.created.forEach((p) => console.log(`- ${path.relative(baseDir, p).replace(/\\\\/g, '/')}`));
  }
  if (result.skipped.length > 0) {
    console.log('Skipped files (use --force to overwrite):');
    result.skipped.forEach((p) => console.log(`- ${path.relative(baseDir, p).replace(/\\\\/g, '/')}`));
  }
}

main();
