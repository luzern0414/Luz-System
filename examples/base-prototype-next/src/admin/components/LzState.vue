<script setup>
// The four non-data states of a page area, in one place so that every page treats them the same way:
// loading (skeleton), empty (with the next step), error (with the reason, the effect and a retry), forbidden (no permission).
defineProps({
  status: { type: String, default: 'ok' },                 // 'loading' | 'empty' | 'error' | 'forbidden' | 'ok'
  rows: { type: Number, default: 6 },
  emptyTitle: { type: String, default: '没有符合条件的数据' },
  errorTitle: { type: String, default: '加载失败' },
  errorHint: { type: String, default: '请检查网络后重试' },
  forbiddenHint: { type: String, default: '当前角色没有这个页面的权限，请联系超级管理员' },
})
defineEmits(['retry'])
</script>

<template>
  <el-skeleton v-if="status === 'loading'" :rows="rows" animated class="lz-state" />
  <el-empty v-else-if="status === 'empty'" :description="emptyTitle" class="lz-state"><slot name="empty-action" /></el-empty>
  <el-result v-else-if="status === 'error'" icon="error" :title="errorTitle" :sub-title="errorHint" class="lz-state">
    <template #extra><el-button type="primary" @click="$emit('retry')">重试</el-button></template>
  </el-result>
  <el-result v-else-if="status === 'forbidden'" icon="warning" title="没有权限" :sub-title="forbiddenHint" class="lz-state" />
  <slot v-else />
</template>

<style scoped>
.lz-state { padding: 24px 0; }
</style>
