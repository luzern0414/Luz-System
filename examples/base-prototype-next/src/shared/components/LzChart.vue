<script setup>
// Charts: ECharts, drawn in the theme's palette. One main series in the brand colour, the others lighter hues, "other" in grey;
// area fill at most 12 % of the series colour (no gradient), a white tooltip, hairline grid. Pass the data, not an option object.
import { computed } from 'vue'
import { use } from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { PALETTE, PALETTE_DARK, TOKENS, TOKENS_DARK } from './../theme.generated.js'
import { state } from '../state.js'

use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = defineProps({
  kind: { type: String, default: 'line' },            // 'line' | 'bar' | 'pie'
  categories: { type: Array, default: () => [] },     // x axis labels (line, bar)
  series: { type: Array, default: () => [] },         // [{ name, data }]; pie: [{ name, value }]
  height: { type: Number, default: 260 },
  unit: { type: String, default: '' },
  label: { type: String, default: '图表' },           // the accessible name
})

const colors = computed(() => (state.dark ? PALETTE_DARK : PALETTE))
const T = computed(() => (state.dark ? TOKENS_DARK : TOKENS))
const base = computed(() => ({ color: colors.value, textStyle: { fontFamily: 'inherit', fontSize: 14, color: T.value.ink2 }, animation: !state.reducedMotion }))
const tooltip = computed(() => ({ trigger: props.kind === 'pie' ? 'item' : 'axis', backgroundColor: T.value.surface, borderColor: T.value.line, textStyle: { color: T.value.ink, fontSize: 14 }, extraCssText: 'box-shadow: var(--luz-level-3);' }))

const option = computed(() => {
  if (props.kind === 'pie') {
    return { ...base.value, tooltip: tooltip.value, legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: T.value.ink2, fontSize: 14 } },
      series: [{ type: 'pie', radius: ['52%', '72%'], center: ['50%', '44%'], label: { show: false }, itemStyle: { borderColor: T.value.surface, borderWidth: 2 }, data: props.series }] }
  }
  return {
    ...base.value, tooltip: tooltip.value,
    legend: props.series.length > 1 ? { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: T.value.ink2, fontSize: 14 } } : undefined,
    grid: { left: 8, right: 12, top: props.series.length > 1 ? 32 : 12, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: props.categories, axisLine: { lineStyle: { color: T.value.line } }, axisTick: { show: false }, axisLabel: { color: T.value.ink2, fontSize: 14 } },
    yAxis: { type: 'value', axisLabel: { color: T.value.ink2, fontSize: 14, formatter: (v) => v + props.unit }, splitLine: { lineStyle: { color: T.value.line } } },
    series: props.series.map((s, i) => props.kind === 'bar'
      ? { type: 'bar', name: s.name, data: s.data, barMaxWidth: 28, itemStyle: { borderRadius: [4, 4, 0, 0] } }
      : { type: 'line', name: s.name, data: s.data, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2 }, areaStyle: i === 0 ? { opacity: 0.12 } : undefined }),
  }
})
</script>

<template>
  <v-chart class="lz-chart" :option="option" :style="{ height: height + 'px' }" autoresize role="img" :aria-label="label" />
</template>

<style scoped>
.lz-chart { width: 100%; }
</style>
