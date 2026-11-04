<script setup>
// The one dialog for details, edits and confirmations: centred, with a confirm button that waits for the request, a failure shown in the dialog
// with the reason and the next step (the dialog stays open and the input is kept), and a danger variant for destructive actions.
// `onConfirm` is async: throw an Error to show its message, return to close.
import { ref } from 'vue'
const open = defineModel({ type: Boolean, default: false })
const props = defineProps({
  title: { type: String, required: true },
  width: { type: String, default: '520px' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  danger: { type: Boolean, default: false },
  noFooter: { type: Boolean, default: false },
  confirmDisabled: { type: Boolean, default: false },
  onConfirm: { type: Function, default: null },
})
const loading = ref(false)
const error = ref('')

async function confirm() {
  if (!props.onConfirm) { open.value = false; return }
  loading.value = true; error.value = ''
  try { await props.onConfirm(); open.value = false } catch (e) { error.value = e?.message || '操作失败，请重试' } finally { loading.value = false }
}
function onOpen() { error.value = '' }
</script>

<template>
  <el-dialog v-model="open" :title="title" :width="width" align-center append-to-body @open="onOpen">
    <slot />
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="lz-dialog-error" />
    <template v-if="!noFooter" #footer>
      <slot name="footer-extra" />
      <el-button @click="open = false">{{ cancelText }}</el-button>
      <el-button :type="danger ? 'danger' : 'primary'" :loading="loading" :disabled="confirmDisabled" @click="confirm">{{ confirmText }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.lz-dialog-error { margin-top: 12px; }
</style>
