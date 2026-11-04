<script setup>
// A status as a light tag (light background, deep text of the same hue): the map says which element tag type each status gets.
// Pass `kind` ('order', 'refund', 'enabled'…) and the raw `status`, or `type` and `text` directly.
import { computed } from 'vue'
const MAPS = {
  order: { UNPAID: ['warning', '待支付'], PAID: ['primary', '待履约'], FULFILLED: ['primary', '已出餐'], DONE: ['success', '已完成'], CANCELLED: ['info', '已取消'], REFUNDING: ['warning', '退款中'], REFUNDED: ['info', '已退款'] },
  enabled: { ENABLED: ['success', '启用'], DISABLED: ['info', '停用'] },
  onoff: { ON: ['success', '上架中'], OFF: ['info', '已下架'] },
  task: { DONE: ['success', '已完成'], RUNNING: ['primary', '进行中'], FAILED: ['danger', '失败'] },
}
const props = defineProps({ kind: String, status: String, type: String, text: String })
const view = computed(() => (props.kind ? MAPS[props.kind]?.[props.status] : null) || [props.type || 'info', props.text || props.status])
</script>

<template><el-tag :type="view[0]" effect="light" disable-transitions>{{ view[1] }}</el-tag></template>
