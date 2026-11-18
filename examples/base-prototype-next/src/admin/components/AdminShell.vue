<script setup>
// The admin shell: sidebar menu by role and group, header with the environment tag and the account menu, the page area.
// Everything on screen is an Element Plus component; the pages register themselves (registry.js).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, Expand, Fold } from '@element-plus/icons-vue'
import { state } from '../../shared/state.js'
import { avatar } from '../../shared/avatar.js'
import { GROUPS, ICONS, PAGES, ROLES } from '../registry.js'

const route = useRoute()
const router = useRouter()
const collapsed = ref(false)
const navOpen = ref(false)
const narrow = ref(false)
const versionOpen = ref(false)

const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 900px)') : null
const sync = () => { narrow.value = !!mq?.matches }
onMounted(() => { sync(); mq?.addEventListener('change', sync) })
onBeforeUnmount(() => mq?.removeEventListener('change', sync))

const menu = computed(() => GROUPS
  .map((title) => ({ title, items: PAGES.filter((p) => !p.accountMenu && p.group === title && p.roles.includes(state.role) && !state.hidden[p.id]) }))
  .filter((g) => g.items.length))
const me = computed(() => (state.role === 'A' ? '王海燕' : '陈晓燕'))
const roleLabel = computed(() => ROLES.find((r) => r.id === state.role)?.label)
const active = computed(() => '/' + (route.name || ''))

function go(path) { router.push(path); navOpen.value = false }
const UPDATES = [
  ['2.0.0', '管理后台全部改用组件库的真实组件，主题随主题库切换'],
  ['1.9.2', '订单列表默认显示待处理的订单，导出带当前筛选范围'],
  ['1.9.0', '新增履约看板与会员卡扣次'],
]
</script>

<template>
  <el-container class="shell">
    <el-aside v-if="!narrow" :width="collapsed ? '64px' : '224px'" class="shell-aside">
      <div class="shell-brand">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" /><g><path d="M7 13l2-5h14l2 5" /><path d="M8 13v11h16V13" /><path d="M13 24v-6h6v6" /></g></svg>
        <span v-if="!collapsed" class="shell-brand-name">示例门店管理后台</span>
      </div>
      <el-scrollbar class="shell-menu-scroll">
        <el-menu :default-active="active" :collapse="collapsed" router class="shell-menu">
          <el-menu-item-group v-for="g in menu" :key="g.title">
            <template #title>{{ g.title }}</template>
            <el-menu-item v-for="p in g.items" :key="p.id" :index="'/' + p.id">
              <el-icon><component :is="ICONS[p.icon] || ICONS.app" /></el-icon>
              <template #title>{{ p.label }}</template>
            </el-menu-item>
          </el-menu-item-group>
        </el-menu>
      </el-scrollbar>
      <div class="shell-foot"><el-button text class="version-link" aria-label="查看版本信息" @click="versionOpen = true">{{ collapsed ? 'v' + state.version.front.split('.')[0] : '版本 v' + state.version.front }}</el-button></div>
    </el-aside>

    <el-container class="shell-body">
      <el-header class="shell-header">
        <el-button v-if="narrow" text :icon="Expand" aria-label="打开菜单" @click="navOpen = true" />
        <el-button v-else text :icon="collapsed ? Expand : Fold" aria-label="收起或展开菜单" @click="collapsed = !collapsed" />
        <span class="grow" />
        <el-tag type="warning" effect="light" class="env-tag">测试环境</el-tag>
        <el-dropdown trigger="click">
          <el-button text class="account-btn" aria-label="账号菜单">
            <el-avatar :size="28" :src="avatar('account-' + state.role)" class="account-avatar" />
            <span class="account-name">{{ me }}</span>
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>{{ roleLabel }}</el-dropdown-item>
              <el-dropdown-item divided @click="go('/personal-settings')">设置</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main class="shell-main">
        <router-view v-slot="{ Component }"><transition name="page" mode="out-in"><component :is="Component" :key="route.path" /></transition></router-view>
      </el-main>
    </el-container>
  </el-container>

  <!-- narrow screens: the menu is a navigation drawer from the left (details and edits are never drawers) -->
  <el-drawer v-model="navOpen" direction="ltr" size="260px" :with-header="false" class="nav-drawer">
    <el-menu :default-active="active" class="shell-menu" @select="go">
      <el-menu-item-group v-for="g in menu" :key="g.title">
        <template #title>{{ g.title }}</template>
        <el-menu-item v-for="p in g.items" :key="p.id" :index="'/' + p.id"><el-icon><component :is="ICONS[p.icon] || ICONS.app" /></el-icon>{{ p.label }}</el-menu-item>
      </el-menu-item-group>
    </el-menu>
  </el-drawer>

  <el-dialog v-model="versionOpen" title="版本信息" width="480px" align-center>
    <el-descriptions :column="1" border class="version-info">
      <el-descriptions-item label="前端版本">v{{ state.version.front }}</el-descriptions-item>
      <el-descriptions-item label="后端版本">v{{ state.version.back }}</el-descriptions-item>
      <el-descriptions-item label="上线日期">2026-11-03</el-descriptions-item>
      <el-descriptions-item label="运行环境">测试环境</el-descriptions-item>
    </el-descriptions>
    <el-timeline class="version-notes">
      <el-timeline-item v-for="[v, text] in UPDATES" :key="v" :timestamp="'v' + v">{{ text }}</el-timeline-item>
    </el-timeline>
  </el-dialog>

</template>
