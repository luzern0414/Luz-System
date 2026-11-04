<script setup>
// The admin shell: sidebar menu by role and group, header with the environment tag and the account menu, the page area.
// Everything on screen is an Element Plus component; the pages register themselves (registry.js).
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, Expand, Fold, User } from '@element-plus/icons-vue'
import { state } from '../../shared/state.js'
import { avatar } from '../../shared/avatar.js'
import { request } from '../../shared/request.js'
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
  .map((title) => ({ title, items: PAGES.filter((p) => p.group === title && p.roles.includes(state.role) && !state.hidden[p.id]) }))
  .filter((g) => g.items.length))
const me = computed(() => (state.role === 'A' ? '王海燕' : '陈晓燕'))
const roleLabel = computed(() => ROLES.find((r) => r.id === state.role)?.label)
const active = computed(() => '/' + (route.name || ''))

function go(path) { router.push(path); navOpen.value = false }
function logout() { state.signedIn = false; router.replace('/'); ElMessage.success('已退出登录') }

// 修改密码
const pwd = reactive({ open: false, old: '', next: '', again: '', error: '', loading: false })
function openPwd() { Object.assign(pwd, { open: true, old: '', next: '', again: '', error: '', loading: false }) }
async function savePwd() {
  if (!pwd.old) return (pwd.error = '请输入原密码')
  if (pwd.next.length < 10) return (pwd.error = '新密码至少 10 位，含大小写字母、数字和符号')
  if (pwd.next !== pwd.again) return (pwd.error = '两次输入的新密码不一致')
  pwd.loading = true; pwd.error = ''
  try { await request(500) } catch { pwd.loading = false; pwd.error = '网络不太稳定，请重试'; return }
  pwd.loading = false; pwd.open = false
  ElMessage.success('密码已修改，请用新密码登录')
}

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
              <el-dropdown-item divided @click="openPwd">修改密码</el-dropdown-item>
              <el-dropdown-item @click="logout">退出登录</el-dropdown-item>
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

  <el-dialog v-model="pwd.open" title="修改密码" width="420px" align-center>
    <el-form label-position="top" @submit.prevent="savePwd">
      <el-form-item label="原密码"><el-input v-model="pwd.old" type="password" show-password autocomplete="current-password" /></el-form-item>
      <el-form-item label="新密码"><el-input v-model="pwd.next" type="password" show-password autocomplete="new-password" /></el-form-item>
      <el-form-item label="确认新密码"><el-input v-model="pwd.again" type="password" show-password autocomplete="new-password" /></el-form-item>
    </el-form>
    <el-alert v-if="pwd.error" :title="pwd.error" type="error" show-icon :closable="false" />
    <template #footer>
      <el-button @click="pwd.open = false">取消</el-button>
      <el-button type="primary" :loading="pwd.loading" @click="savePwd">保存</el-button>
    </template>
  </el-dialog>
</template>
