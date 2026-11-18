<script setup>
// Login: account and password; the 超级管理员 gets a second step with a 6-digit code (demo: 123456); five wrong passwords lock the account (demo counter).
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { state } from '../../shared/state.js'
import { request, NetError } from '../../shared/request.js'
import { homeOf } from '../registry.js'

const router = useRouter()
const form = reactive({ user: '', pass: '' })
const errors = reactive({ user: '', pass: '' })
const loading = ref(false)
const fails = ref(0)
const mfa = reactive({ open: false, code: '', error: '', loading: false, role: 'A' })
import '../../../../demo-account.js'

async function submit() {
  errors.user = form.user.trim() ? '' : '请输入账号'
  errors.pass = form.pass ? '' : '请输入密码'
  if (errors.user || errors.pass) return
  loading.value = true
  try {
    await request(500)
  } catch (e) {
    loading.value = false
    if (e instanceof NetError) return ElMessage.error('网络不太稳定，请稍后再试')
    throw e
  }
  loading.value = false
  if (fails.value >= 5) { errors.pass = '连续输错 5 次，账号已锁定 10 分钟'; return }
  const role = globalThis.LuzDemoAccount.roleFor(form.user, form.pass)
  if (!role) {
    fails.value++
    errors.pass = '账号或密码错误' + (fails.value >= 3 ? `，还可再试 ${5 - fails.value} 次` : '')
    return
  }
  if (role === 'A') { Object.assign(mfa, { open: true, code: '', error: '', role }); return }
  enter(role)
}

async function verify() {
  if (!/^\d{6}$/.test(mfa.code)) { mfa.error = '请输入 6 位数字验证码'; return }
  mfa.loading = true
  try { await request(400) } catch { mfa.loading = false; mfa.error = '网络不太稳定，请重试'; return }
  mfa.loading = false
  if (mfa.code !== '123456') { mfa.error = '验证码不正确，请重新输入'; return }
  mfa.open = false
  enter(mfa.role)
}

function enter(role) {
  state.role = role
  state.signedIn = true
  ElMessage.success('欢迎回来，' + (role === 'A' ? '王海燕' : '陈晓燕'))
  router.replace('/' + homeOf(role))
}
</script>

<template>
  <main class="login">
    <el-card class="login-card" shadow="never">
      <div class="login-brand">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" /><g><path d="M7 13l2-5h14l2 5" /><path d="M8 13v11h16V13" /><path d="M13 24v-6h6v6" /></g></svg>
        <strong>示例门店管理后台</strong>
      </div>
      <el-form label-position="top" @submit.prevent="submit" novalidate>
        <el-form-item label="账号" :error="errors.user"><el-input v-model="form.user" autocomplete="username" placeholder="请输入账号" size="large" autofocus /></el-form-item>
        <el-form-item label="密码" :error="errors.pass"><el-input v-model="form.pass" type="password" show-password autocomplete="current-password" placeholder="请输入密码" size="large" /></el-form-item>
        <el-button type="primary" size="large" native-type="submit" :loading="loading" class="login-submit">登录</el-button>
      </el-form>
      <p class="muted small login-hint">演示账号：admin（超级管理员，需验证码 123456）、front1（前台），初始演示密码 Admin@2026</p>
    </el-card>

    <el-dialog v-model="mfa.open" title="输入验证码" width="380px" align-center :close-on-click-modal="false" :show-close="false">
      <p>请输入验证器应用里的 6 位验证码</p>
      <el-input v-model="mfa.code" maxlength="6" inputmode="numeric" size="large" class="mfa-code" @keyup.enter="verify" />
      <p v-if="mfa.error" class="mfa-error" role="alert">{{ mfa.error }}</p>
      <template #footer>
        <el-button @click="mfa.open = false">返回</el-button>
        <el-button type="primary" :loading="mfa.loading" @click="verify">验证并登录</el-button>
      </template>
    </el-dialog>
  </main>
</template>

<style scoped>
.login { min-height: 100dvh; display: grid; place-items: center; padding: 16px; }
.login-card { width: min(400px, calc(100vw - 32px)); }
.login-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; font-size: 18px; }
.brand-mark { width: 32px; height: 32px; }
.brand-mark rect { fill: var(--luz-action-tint); }
.brand-mark g { fill: none; stroke: var(--luz-action); stroke-width: 2.75; stroke-linecap: round; stroke-linejoin: round; }
.login-submit { width: 100%; margin-top: 4px; }
.login-hint { margin: 16px 0 0; }
.mfa-code :deep(input) { letter-spacing: .4em; text-align: center; font-size: 20px; }
.mfa-error { margin: 8px 0 0; color: var(--luz-danger); }
</style>
