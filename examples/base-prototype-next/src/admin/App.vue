<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { state } from '../shared/state.js'
import { homeOf } from './registry.js'

const router = useRouter()

// On a phone-sized window every control takes the library's large size (40 px), the library's own way to reach the touch target size.
const phone = window.matchMedia('(max-width: 700px)')
const size = ref(phone.matches ? 'large' : 'default')
const onPhone = (e) => { size.value = e.matches ? 'large' : 'default' }
phone.addEventListener('change', onPhone)
onUnmounted(() => phone.removeEventListener('change', onPhone))

// ?skip-login enters at once (?role=F as 前台); inside an iframe the prototype also skips the login unless ?login is given.
onMounted(() => {
  const q = new URLSearchParams(location.search)
  if (q.get('skip-login') !== null || (window.self !== window.top && q.get('login') === null)) {
    state.role = q.get('role') === 'F' ? 'F' : 'A'
    state.signedIn = true
    if (!location.hash || location.hash === '#/') router.replace('/' + homeOf(state.role))
  }
})
watch(() => state.reducedMotion, (v) => document.documentElement.classList.toggle('reduce-motion', v), { immediate: true })
</script>

<template>
  <el-config-provider :locale="zhCn" :size="size">
    <AdminLogin v-if="!state.signedIn" />
    <AdminShell v-else />
    <DemoPanel />
  </el-config-provider>
</template>
