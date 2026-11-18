<script>
export const meta = { id: 'personal-settings', label: '设置', icon: 'gear', group: '系统', roles: ['A', 'F'], accountMenu: true }
</script>
<script setup>
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { state } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import '../../../../demo-account.js'

const router = useRouter()
const pwd = reactive({ open: false, old: '', next: '', again: '', error: '', loading: false })
function openPwd() { Object.assign(pwd, { open: true, old: '', next: '', again: '', error: '', loading: false }) }
async function savePwd() {
  if (pwd.loading) return
  if (!pwd.old || !pwd.next) { pwd.error = '请填写原密码和新密码'; return }
  if (pwd.next !== pwd.again) { pwd.error = '两次输入的新密码不一致'; return }
  const role = state.role
  pwd.loading = true
  try {
    await request(500)
    if (!pwd.open || !state.signedIn || state.role !== role || router.currentRoute.value.name !== meta.id) return
    pwd.error = globalThis.LuzDemoAccount.change(role, pwd.old, pwd.next)
    if (!pwd.error) { pwd.open = false; ElMessage.success('本次演示的密码已修改') }
  } catch { pwd.error = '网络不太稳定，请重试' } finally { pwd.loading = false }
}
function leaveAccount() { state.signedIn = false; router.replace('/') }
</script>
<template>
  <section class="page">
    <h1>设置</h1>
    <el-card shadow="never">
      <template #header><h2>账号与安全</h2></template>
      <el-space wrap>
        <el-button @click="openPwd">修改密码</el-button>
        <el-button @click="leaveAccount">切换账号</el-button>
        <el-button @click="leaveAccount">退出登录</el-button>
      </el-space>
    </el-card>
  </section>
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
