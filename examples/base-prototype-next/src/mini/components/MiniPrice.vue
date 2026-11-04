<script setup>
// A price: the currency sign and the cents smaller than the yuan, the struck-through original price beside it when there is one.
import { computed } from 'vue'
const props = defineProps({ cents: { type: Number, required: true }, old: { type: Number, default: 0 }, size: { type: Number, default: 16 } })
const parts = computed(() => (props.cents / 100).toFixed(2).split('.'))
</script>

<template>
  <span class="price" :style="{ fontSize: `calc(${size}px * var(--mp-fs, 1))` }"><small>¥</small>{{ parts[0] }}<small>.{{ parts[1] }}</small><span v-if="old > cents" class="price-old">¥{{ (old / 100).toFixed(2) }}</span></span>
</template>
