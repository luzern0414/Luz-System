<script setup>
// The mini-program shell: a phone frame with the status bar, the navigation bar (title, back, the capsule area kept clear), the page area
// and the tab bar. Pages are routes (registry.js). Everything interactive is a Vant component; popups stay inside the frame.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { state } from '../shared/state.js'
import { PAGES, TABS, pageOf } from './registry.js'
import { direction, useNav } from './nav.js'
import { factorOf } from './font-levels.js'

const route = useRoute()
const router = useRouter()
const { back, toTab } = useNav()
const page = computed(() => pageOf(route.name))
const onTab = computed(() => TABS.some((t) => t.id === route.name))
const title = computed(() => page.value?.title || page.value?.label || '')
const tabs = computed(() => TABS.filter((t) => !state.hidden[t.id]))

// ?skip-login enters as a member, ?guest as a guest; inside an iframe the prototype skips the login unless ?login is given.
onMounted(() => {
  const q = new URLSearchParams(location.search)
  const embedded = window.self !== window.top && q.get('login') === null
  if (q.get('guest') !== null) { state.signedIn = false; state.role = 'guest' }
  else if (q.get('skip-login') !== null || embedded) { state.signedIn = true; state.role = 'member' }
  else if (pageOf('login') && !location.hash.replace('#', '')) router.replace('/login')
  sync(); mq?.addEventListener('change', sync)
})
const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 910px)') : null
const wide = ref(true)
const scale = ref(1)
// The frame and the demo panel are laid out at the phone's own size (390 wide) and scaled to the window: as large as the window's height allows (1 to 1.5 times, aiming at a 390 x 760 screen: the size of common Android phones),
// and no larger than the width allows, so text stays readable on a big screen. On a phone-sized window the frame is the window and nothing is scaled.
const fit = () => {
  wide.value = !mq?.matches
  const h = (window.innerHeight - 48) / 760
  const w = (window.innerWidth - 48 - 32) / (390 + 440)
  const s = Math.min(1.5, Math.min(h, w))
  scale.value = wide.value && s >= 1.05 ? Math.round(s * 100) / 100 : 1       // under 5 % is not worth a blurred frame
}
const sync = fit
onMounted(() => window.addEventListener('resize', fit))
onBeforeUnmount(() => { mq?.removeEventListener('change', sync); window.removeEventListener('resize', fit) })
watch(() => state.reducedMotion, (v) => document.documentElement.classList.toggle('reduce-motion', v), { immediate: true })
const panelOpen = ref(false)
const bubble = ref({ x: typeof window !== 'undefined' ? window.innerWidth - 72 : 300, y: typeof window !== 'undefined' ? window.innerHeight - 150 : 600 })
</script>

<template>
  <div class="stage" :style="{ '--phone-scale': scale }">
    <div id="phone" class="phone" :style="{ '--mp-fs': factorOf(state.fontLevel) }">
      <van-config-provider teleport="#phone-overlay" :theme="state.dark ? 'dark' : 'light'" class="phone-inner">
        <div class="status-bar" aria-hidden="true"><span class="clock">10:30</span><span class="battery" /></div>
        <van-nav-bar :title="title" :left-arrow="!onTab && !!page" :border="false" @click-left="back">
          <template #right><span class="capsule" aria-hidden="true"><i /><i /></span></template>
        </van-nav-bar>
        <main class="screen" id="screen">
          <router-view v-slot="{ Component, route: r }">
            <transition :name="direction === 'forward' ? 'push' : 'pop'" mode="out-in"><component :is="Component" :key="r.fullPath" /></transition>
          </router-view>
        </main>
        <van-tabbar v-if="onTab" :model-value="route.name" :fixed="false" :border="true" @change="toTab">
          <van-tabbar-item v-for="t in tabs" :key="t.id" :name="t.id" :icon="t.icon">{{ t.label }}</van-tabbar-item>
        </van-tabbar>
        <div id="phone-overlay" class="overlay-root" />
      </van-config-provider>
    </div>
    <aside v-if="wide" class="side" data-luz-demo-panel><MiniDemo /></aside>
    <template v-else>
      <van-floating-bubble v-model:offset="bubble" icon="setting-o" axis="xy" magnetic="x" aria-label="打开演示控制" @click="panelOpen = true" />
      <van-popup v-model:show="panelOpen" position="bottom" round closeable :style="{ height: '82%' }" data-luz-demo-panel><MiniDemo /></van-popup>
    </template>
  </div>
</template>
