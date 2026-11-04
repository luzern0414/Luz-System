<script>
// 个人资料（二级页）：头像是主角，下面是昵称、性别、生日、手机号；只有改动了才能保存，保存时才做昵称内容检测。
export const meta = {
  id: 'profile', label: '个人资料', title: '个人资料', group: '我的', order: 2,
  layout: '主次布局',
  reason: '资料页的主角是“我是谁”：头像放大居上，昵称、性别、生日、手机号是配角；保存固定在拇指区，只有改动了才可点',
  scenes: [
    { id: 'unbound', label: '手机号：还没有绑定' },
    { id: 'nick-risky', label: '昵称：检测不通过（含不合适内容）' },
    { id: 'nick-down', label: '昵称：检测服务异常，稍后再试' },
    { id: 'avatar-pending', label: '头像：新头像审核中' },
    { id: 'sms-fail', label: '短信：发送失败' },
    { id: 'sms-limit', label: '短信：今日次数已用完' },
  ],
}
</script>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, maskPhone } from '../../shared/format.js'
import { useNav } from '../nav.js'
import { avatar } from '../../shared/avatar.js'

const { go, back } = useNav()
const say = (message) => showToast({ message, teleport: '#phone-overlay', duration: 1500 })
const scene = useScene('profile')
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

const guest = computed(() => state.role === 'guest')
const me = computed(() => state.db.me)
const today = K.ymd(B.NOW())
const BAD_WORDS = ['傻', '赌博', '代充', '刷单', '加微信', '垃圾', 'http', 'www.']
// six faces to pick from (the same six as on the Me page); before a pick the member number gives one
const faceOf = (idx) => avatar('pick-' + idx)
const reasonOf = (e) => (e && e.name === 'NetError' ? (e.kind === 'offline' ? '当前没有网络，请连上网络后再试' : '网络不太稳定，请稍后再试') : (e && e.message) || '请稍后再试')

// 表单：改的是副本，保存时才写进 state.db
const f = reactive({ name: me.value.name, gender: me.value.gender || '', birthday: me.value.birthday || '', avatarIdx: me.value.avatarIdx ?? null, wx: false })
const errs = reactive({ name: '' })
const tip = ref(null)
const saving = ref(false)
const saved = ref(false)
const bound = ref(scene.value === 'unbound' ? false : me.value.phoneBound !== false)
const dirty = computed(() => f.name.trim() !== me.value.name || f.gender !== (me.value.gender || '') || f.birthday !== (me.value.birthday || '') || (f.avatarIdx ?? null) !== (me.value.avatarIdx ?? null) || f.wx)
const avatarNow = computed(() => (f.avatarIdx != null ? f.avatarIdx : me.value.id % 6))
const reviewing = computed(() => me.value.avatarPending || f.wx || scene.value === 'avatar-pending')
function onNick() { errs.name = ''; tip.value = null }

// 确认框：ask(...) 返回 Promise<boolean>
const dlg = reactive({ show: false, title: '', message: '', ok: '确定', cancel: '取消', danger: false })
let settle = null
function ask(o) { Object.assign(dlg, { ok: '确定', cancel: '取消', danger: false }, o, { show: true }); return new Promise((resolve) => { settle = resolve }) }
function answer(v) { if (settle) { settle(v); settle = null } }
watch(() => dlg.show, (v) => { if (!v) answer(false) })
onBeforeRouteLeave(() => (saved.value || !dirty.value ? true : ask({ title: '放弃修改', message: '当前的修改还没有保存，离开后会丢失。', ok: '放弃', cancel: '继续编辑', danger: true })))

// 头像：六个图标头像，或使用微信头像（要审核）
const avOpen = ref(false)
const pick = ref(0)
function openAvatar() { pick.value = f.wx ? 'wx' : avatarNow.value; avOpen.value = true }
function useAvatar() { if (pick.value === 'wx') f.wx = true; else { f.avatarIdx = pick.value; f.wx = false } avOpen.value = false }

// 生日
const bdOpen = ref(false)
const bdVal = ref(['2000', '01', '01'])
const MIN_DATE = new Date(1920, 0, 1)
const MAX_DATE = new Date(today + 'T00:00:00')
function openBirthday() { bdVal.value = f.birthday ? f.birthday.split('-') : ['2000', '01', '01']; bdOpen.value = true }
function onBirthday({ selectedValues }) { f.birthday = selectedValues.join('-'); bdOpen.value = false }

// 手机号：微信快速验证，或短信验证
function bindOk(phone) { me.value.phone = phone; me.value.phoneBound = true; bound.value = true; smsOpen.value = false; say('手机号已绑定') }
async function wxBind() {
  if (!(await ask({ title: '微信快速验证', message: '“' + B.shop.name + '”申请获取你微信绑定的手机号\n' + maskPhone('13800000000') + '\n仅用于接收订单与会员通知，不会对外展示', ok: '允许', cancel: '拒绝' }))) return
  try { await request(500) } catch (e) { return say('没有绑定成功：' + reasonOf(e)) }
  bindOk('13800000000')
}
const smsOpen = ref(false)
const sms = reactive({ phone: '', code: '', phoneErr: '', codeErr: '', cd: 0, sent: false, sentTo: '', tries: 0, locked: false, sending: false, verifying: false })
let timer = 0
onBeforeUnmount(() => clearInterval(timer))
const codeText = computed(() => (sms.cd > 0 ? '重新获取（' + sms.cd + ' 秒）' : sms.sent ? '重新获取' : '获取验证码'))
function openSms() { Object.assign(sms, { phone: '', code: '', phoneErr: '', codeErr: '', cd: 0, sent: false, sentTo: '', tries: 0, locked: false }); clearInterval(timer); smsOpen.value = true }
async function sendCode() {
  sms.phoneErr = ''
  const p = sms.phone.trim()
  if (!/^1[3-9]\d{9}$/.test(p)) { sms.phoneErr = '请输入正确的 11 位手机号'; return }
  if (state.db.users.some((u) => u.phone === p && u.id !== me.value.id)) { sms.phoneErr = '该手机号已绑定其他账号，请更换手机号或联系客服'; return }
  sms.sending = true
  const fail = scene.value === 'sms-limit' ? new Error('今天获取验证码的次数已达上限，请明天再试或使用微信快速验证') : scene.value === 'sms-fail' ? new Error('短信发送失败，请稍后重试') : undefined
  try { await request(500, { fail }) } catch (e) { sms.phoneErr = e.name === 'NetError' ? (e.kind === 'offline' ? '没有网络，验证码没有发出，请连上网络后重试' : '网络不太稳定，验证码没有发出，请重试') : e.message; return } finally { sms.sending = false }
  Object.assign(sms, { sentTo: p, sent: true, locked: false, tries: 0, cd: 60, codeErr: '' })
  say('验证码已发送至 ' + maskPhone(p))
  clearInterval(timer); timer = setInterval(() => { sms.cd = Math.max(0, sms.cd - 1); if (!sms.cd) clearInterval(timer) }, 1000)
}
async function verifyCode() {
  sms.phoneErr = ''; sms.codeErr = ''
  if (!sms.sent) { sms.codeErr = '请先获取验证码'; return }
  if (sms.locked) { sms.codeErr = '验证码错误次数过多，请重新获取验证码'; return }
  if (sms.phone.trim() !== sms.sentTo) { sms.phoneErr = '手机号和获取验证码时不一致，请重新获取'; return }
  if (!/^\d{6}$/.test(sms.code.trim())) { sms.codeErr = '请输入 6 位验证码'; return }
  sms.verifying = true
  try { await request(600) } catch (e) { sms.codeErr = reasonOf(e); return } finally { sms.verifying = false }
  if (sms.code.trim() !== '123456') {
    sms.tries++
    if (sms.tries >= 5) { sms.locked = true; sms.sent = false; sms.cd = 0; clearInterval(timer); sms.codeErr = '验证码错误次数过多，请重新获取验证码' } else sms.codeErr = '验证码不对，还可以再试 ' + (5 - sms.tries) + ' 次'
    return
  }
  bindOk(sms.sentTo)
}

// 保存：昵称内容检测在保存时做，违规在原位提示，检测服务异常不保存；失败时保留用户填的内容
async function save() {
  tip.value = null
  const name = f.name.trim()
  if (!name) { errs.name = '请输入昵称'; return }
  if (name.length > 20) { errs.name = '昵称最多 20 个字'; return }
  saving.value = true
  try {
    await request(800, { fail: scene.value === 'nick-down' ? new Error('昵称检测服务暂时不可用，资料没有保存，请稍后再试') : undefined })
  } catch (e) {
    tip.value = e.name === 'NetError' ? { kind: 'bad', text: '没有保存成功：' + reasonOf(e) } : { kind: 'warn', text: e.message, retry: true }
    return
  } finally { saving.value = false }
  if (scene.value === 'nick-risky' || BAD_WORDS.some((w) => name.toLowerCase().includes(w))) { errs.name = '昵称包含不合适的内容，请修改'; return }
  const u = me.value
  Object.assign(u, { name, gender: f.gender, birthday: f.birthday })
  if (f.wx) u.avatarPending = true; else if (f.avatarIdx != null) { u.avatarIdx = f.avatarIdx; u.avatarPending = false }
  // 昵称同步到各处冗余的姓名，后台与其他页读到的是同一个名字
  const db = state.db
  db.cards.forEach((c) => { if (c.userId === u.id) c.userName = name })
  db.orders.forEach((o) => { if (o.userId === u.id) o.userName = name })
  db.walletLogs.forEach((l) => { if (l.userId === u.id) l.userName = name })
  const nos = new Set(db.orders.filter((o) => o.userId === u.id).map((o) => o.no)); db.refunds.forEach((r) => { if (nos.has(r.orderNo)) r.userName = name })
  const cardNos = new Set(db.cards.filter((c) => c.userId === u.id).map((c) => c.no)); db.cardLogs.forEach((l) => { if (cardNos.has(l.cardNo)) l.userName = name })
  saved.value = true
  say('资料已保存')
  back()
}
</script>

<template>
  <div class="mp-page profile">
    <MiniState v-if="guest" status="forbidden">
      <template #forbidden-action><van-button type="primary" round @click="go('login')">去登录</van-button></template>
    </MiniState>
    <MiniState v-else :status="phase" :rows="6" @retry="load">
      <!-- 头像：本页的主角 -->
      <div class="hero">
        <van-button round class="hero-av" aria-label="更换头像" @click="openAvatar"><img class="face" :src="faceOf(avatarNow)" alt="" /></van-button>
        <span class="muted">{{ reviewing ? '新头像审核中，通过前继续显示当前头像' : '点头像更换' }}</span>
      </div>

      <van-cell-group inset>
        <van-field v-model="f.name" label="昵称" placeholder="1 到 20 个字" maxlength="20" show-word-limit clearable autocomplete="nickname" :error-message="errs.name" class="field" @update:model-value="onNick" />
        <van-field label="性别" readonly class="field">
          <template #input>
            <van-radio-group v-model="f.gender" direction="horizontal" aria-label="性别">
              <van-radio name="">保密</van-radio>
              <van-radio name="男">男</van-radio>
              <van-radio name="女">女</van-radio>
            </van-radio-group>
          </template>
        </van-field>
        <van-field :model-value="f.birthday" label="生日" readonly is-link placeholder="选择日期，只用于计算会员权益" class="field" @click="openBirthday" />
      </van-cell-group>

      <!-- 手机号 -->
      <van-cell-group inset>
        <van-cell v-if="bound" center title="手机号" label="已验证，用于接收订单通知和找回账号">
          <template #value><span class="num tel">{{ maskPhone(me.phone) }}</span><van-button size="small" plain round @click="openSms">更换</van-button></template>
        </van-cell>
        <template v-else>
          <van-cell title="手机号" value="未绑定" />
          <div class="bind-box">
            <p class="muted bind-hint">还没有绑定手机号，部分功能（购卡、储值）需要先绑定</p>
            <div class="bind-actions">
              <van-button type="primary" round icon="wechat" @click="wxBind">微信快速验证</van-button>
              <van-button round icon="phone-o" @click="openSms">短信验证</van-button>
            </div>
          </div>
        </template>
      </van-cell-group>

      <van-notice-bar v-if="tip" :left-icon="tip.kind === 'warn' ? 'warning-o' : 'info-o'" :scrollable="false" wrapable :text="tip.text" class="tip" :class="'tip-' + tip.kind">
        <template v-if="tip.retry" #right-icon><van-button size="small" type="primary" plain :loading="saving" @click="save">再试一次</van-button></template>
      </van-notice-bar>

      <van-action-bar placeholder>
        <van-action-bar-button type="primary" :text="saving ? '保存中' : dirty ? '保存' : '没有修改'" :disabled="!dirty" :loading="saving" @click="save" />
      </van-action-bar>
    </MiniState>

    <!-- 更换头像 -->
    <van-popup v-model:show="avOpen" position="bottom" round closeable>
      <div class="sheet">
        <h3 class="sheet-title">更换头像</h3>
        <div class="av-pick">
          <van-button v-for="i in 6" :key="i" round class="pick-av" :class="{ on: pick === i - 1 }" :aria-label="'头像 ' + i" :aria-pressed="pick === i - 1" @click="pick = i - 1"><img class="face" :src="faceOf(i - 1)" alt="" /></van-button>
        </div>
        <div class="sheet-body">
          <van-radio-group v-model="pick">
            <van-cell-group inset>
              <van-cell title="使用微信头像" label="需要审核，审核期间继续显示当前头像" clickable @click="pick = 'wx'"><template #right-icon><van-radio name="wx" aria-label="使用微信头像" /></template></van-cell>
            </van-cell-group>
          </van-radio-group>
        </div>
        <div class="sheet-actions"><van-button type="primary" round block @click="useAvatar">使用</van-button></div>
      </div>
    </van-popup>

    <!-- 生日 -->
    <van-popup v-model:show="bdOpen" position="bottom" round>
      <van-date-picker v-model="bdVal" title="选择生日" :min-date="MIN_DATE" :max-date="MAX_DATE" @confirm="onBirthday" @cancel="bdOpen = false" />
    </van-popup>

    <!-- 短信验证 -->
    <van-popup v-model:show="smsOpen" position="bottom" round closeable>
      <div class="sheet">
        <h3 class="sheet-title">短信验证</h3>
        <div class="sheet-body">
        <van-cell-group inset>
          <van-field v-model="sms.phone" type="tel" label="手机号" placeholder="请输入手机号" maxlength="11" :error-message="sms.phoneErr" class="field" />
          <van-field v-model="sms.code" type="digit" label="验证码" placeholder="6 位验证码" maxlength="6" :error-message="sms.codeErr" class="field">
            <template #button><van-button size="small" type="primary" plain :disabled="sms.cd > 0" :loading="sms.sending" @click="sendCode">{{ codeText }}</van-button></template>
          </van-field>
        </van-cell-group>
        </div>
        <p class="muted hint">演示验证码：123456；连续输错 5 次需要重新获取</p>
        <div class="sheet-actions"><van-button type="primary" round block :loading="sms.verifying" loading-text="验证中" @click="verifyCode">验证并绑定</van-button></div>
      </div>
    </van-popup>

    <van-dialog v-model:show="dlg.show" :title="dlg.title" :message="dlg.message" show-cancel-button :confirm-button-text="dlg.ok" :cancel-button-text="dlg.cancel" :confirm-button-color="dlg.danger ? 'var(--luz-danger)' : undefined" @confirm="answer(true)" @cancel="answer(false)" />
  </div>
</template>

<style scoped>
.field { --van-cell-line-height: 40px; --van-cell-vertical-padding: 4px; }
.hero { display: grid; justify-items: center; gap: 8px; padding: 12px 0 4px; }
.hero-av { --van-button-default-height: 88px; --van-button-radius: 50%; --van-button-border-width: 0; width: 88px; padding: 0; }
.pick-av { --van-button-default-height: 64px; --van-button-radius: 50%; --van-button-border-width: 0; width: 64px; padding: 0; }
.pick-av.on { outline: 2px solid var(--luz-action); outline-offset: 3px; }
.face { display: block; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.tel { margin-right: 12px; color: var(--luz-ink); font-weight: 600; }
.bind-box { padding: 0 16px 16px; }
.bind-hint { margin: 0 0 12px; }
.bind-actions { display: flex; gap: 12px; }
.bind-actions > * { flex: 1 1 0; }
.tip-bad { --van-notice-bar-background: var(--luz-danger-tint); --van-notice-bar-text-color: var(--luz-danger); }
.tip-warn { --van-notice-bar-background: var(--luz-warning-tint); --van-notice-bar-text-color: var(--luz-warning); }
.sheet { padding: 16px 0 24px; }
.sheet-title { margin: 0 0 12px; padding: 0 48px 0 16px; font-size: var(--t16); line-height: 24px; font-weight: 600; }
.sheet-body { padding: 0 16px; }
.av-pick { display: grid; grid-template-columns: repeat(3, 1fr); justify-items: center; gap: 16px; padding: 4px 16px 16px; }
.hint { margin: 8px 16px 12px; }
.sheet-actions { padding: 12px 16px 0; }
</style>
