<script setup>
// The non-data states of a mini-program page area: loading (skeleton), empty (with the next step), error (reason and a retry), forbidden.
defineProps({
  status: { type: String, default: 'ok' },                 // 'loading' | 'empty' | 'error' | 'forbidden' | 'ok'
  rows: { type: Number, default: 5 },
  emptyText: { type: String, default: '这里还没有内容' },
  errorText: { type: String, default: '加载失败' },
  errorHint: { type: String, default: '请检查网络后重试' },
})
defineEmits(['retry'])
</script>

<template>
  <van-skeleton v-if="status === 'loading'" :row="rows" title class="mp-state" />
  <van-empty v-else-if="status === 'empty'" :description="emptyText" class="mp-state"><slot name="empty-action" /></van-empty>
  <van-empty v-else-if="status === 'error'" image="error" :description="errorText + '：' + errorHint" class="mp-state">
    <van-button round type="primary" size="small" @click="$emit('retry')">重试</van-button>
  </van-empty>
  <van-empty v-else-if="status === 'forbidden'" image="network" description="需要先登录才能查看" class="mp-state"><slot name="forbidden-action" /></van-empty>
  <slot v-else />
</template>

<style scoped>
.mp-state { padding: 24px 16px; }
</style>
