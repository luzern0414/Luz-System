<script setup>
// A metric card: the label, the computed value, and the change against the period before (green up, red down). 112 px at most.
import { computed } from 'vue'
const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  suffix: { type: String, default: '' },
  delta: { type: Number, default: null },        // a ratio, 0.123 = +12.3 %
  note: { type: String, default: '较上周期' },
  inverse: { type: Boolean, default: false },    // a metric where down is good (refund rate)
})
const good = computed(() => (props.delta === null ? null : props.inverse ? props.delta <= 0 : props.delta >= 0))
const text = computed(() => (props.delta === null ? '' : (props.delta >= 0 ? '+' : '') + (props.delta * 100).toFixed(1) + '%'))
</script>

<template>
  <el-card shadow="never" class="lz-kpi lz-card">
    <el-statistic :title="props.label" :value="props.value"><template v-if="suffix" #suffix><span class="small muted">{{ suffix }}</span></template></el-statistic>
    <div v-if="delta !== null" class="lz-kpi-delta small">
      <span class="muted">{{ note }}</span>
      <el-tag :type="good ? 'success' : 'danger'" effect="light" size="small">{{ text }}</el-tag>
    </div>
  </el-card>
</template>

<style scoped>
.lz-kpi { height: 104px; }
.lz-kpi :deep(.el-card__body) { display: grid; gap: 6px; padding: 14px 16px; }
.lz-kpi :deep(.el-statistic__head) { font-size: 14px; color: var(--luz-ink-2); }
.lz-kpi :deep(.el-statistic__content) { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
.lz-kpi :deep(.el-statistic__suffix) .small { font-weight: 400; }   /* the suffix sits in the 700 number: 700 is for 22 px and up */
.lz-kpi-delta { display: flex; align-items: center; gap: 8px; }
</style>
