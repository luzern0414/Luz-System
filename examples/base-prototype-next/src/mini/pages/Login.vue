<script>
export const meta = {
  id: 'login', label: '登录', title: '登录', group: '入口', order: 0,
  layout: '主次布局',
  reason: '品牌展示是主角，占上半屏；登录动作紧随其后只有一个主按钮，手机号登录和先逛逛退到次要位置',
  scenes: [
    { id: 'wx-net', label: '微信登录失败：网络异常' },
    { id: 'wx-cancel', label: '微信登录失败：用户取消授权' },
    { id: 'phone-bound', label: '手机号：该手机号已绑定其他账号' },
    { id: 'code-expired', label: '手机号：验证码已过期' },
  ],
}
</script>

<script setup>
// Login: WeChat one-tap login (the one primary action), phone number + code as the second way, the agreement before either, "先逛逛" for guests.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { B } from '../../shared/data.js'
import { maskPhone } from '../../shared/format.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { useNav } from '../nav.js'

const { back, toTab } = useNav()
const scene = useScene('login')
const teleport = '#phone-overlay'
const isRoot = !window.history.state?.back           // the first screen of a session: there is nothing to go back to

const AGREE = {
  agreement: ['《用户协议》', '欢迎使用本店小程序。点单、支付、储值和会员卡服务由本店提供；下单即表示你同意按页面所示价格和规则购买。', '会员卡、储值余额和优惠券按各自页面写明的有效期与使用范围使用，过期不能抵扣。', '你可以随时在“我的 - 设置”里注销账号，注销后个人信息按隐私政策处理。'],
  privacy: ['《隐私政策》', '我们只收集下单和会员服务必须的信息：微信昵称头像、手机号、订单记录。', '位置只用来显示附近门店的距离，你拒绝授权后其余功能照常可用。', '你可以在“我的 - 个人资料”里查看、更正信息，也可以撤回授权或注销账号。'],
}
const ERR = {
  net: ['网络不太稳定，没有登录成功', '请检查网络后重新登录'],
  cancel: ['你取消了微信授权，没有登录', '可以重新授权，也可以先逛逛，登录后再下单'],
  agree: ['请先阅读并同意用户协议和隐私政策', '勾选下面的同意后再登录'],
}

const slogan = computed(() => state.db.config.copy.find((c) => c.key === 'home.slogan')?.value || '')
const photos = computed(() => state.db.products.filter((p) => p.status === 'ON').slice(0, 3).map((p) => p.img))

const step = ref('entry')              // 'entry' | 'phone'
const agree = ref(false)
const busy = ref(false)
const alertKey = ref('')               // which of ERR is shown above the buttons
const alertBox = computed(() => ERR[alertKey.value])
const phone = ref('')
const code = ref('')
const pErr = ref('')
const cErr = ref('')
const sErr = ref('')
const sent = ref(false)
const sending = ref(false)
const cd = ref(0)
let timer = 0
onBeforeUnmount(() => clearInterval(timer))

// the demo panel can pick a scene while this page is open: the page follows it
watch(scene, (s) => { step.value = s === 'phone-bound' || s === 'code-expired' ? 'phone' : 'entry'; alertKey.value = ''; pErr.value = cErr.value = sErr.value = '' }, { immediate: true })

const codeText = computed(() => (cd.value > 0 ? '重新获取（' + cd.value + ' 秒）' : sent.value ? '重新获取' : '获取验证码'))
const docKey = ref('agreement')
const docOpen = ref(false)
const doc = computed(() => AGREE[docKey.value])
const docDate = computed(() => state.db.config.pages.find((x) => x.key === docKey.value)?.updated || '')
function readDoc(key) { docKey.value = key; docOpen.value = true }

function done() {
  state.signedIn = true; state.role = 'member'
  showToast({ message: '登录成功', teleport })
  if (isRoot) toTab('home'); else back()
}

async function wxLogin() {
  if (busy.value) return
  if (!agree.value) { alertKey.value = 'agree'; return }
  busy.value = true; alertKey.value = ''
  const fail = scene.value === 'wx-net' ? new Error('网络异常') : scene.value === 'wx-cancel' ? Object.assign(new Error('用户取消授权'), { cancel: true }) : undefined
  try { await request(900, { fail }) } catch (e) { busy.value = false; alertKey.value = e.cancel ? 'cancel' : 'net'; return }
  busy.value = false; done()
}

const validPhone = () => /^1[3-9]\d{9}$/.test(phone.value)
async function getCode() {
  if (cd.value > 0 || sending.value) return
  if (!validPhone()) { pErr.value = '请输入正确的 11 位手机号'; return }
  pErr.value = ''; sending.value = true
  try { await request(500) } catch { sending.value = false; sErr.value = '网络不太稳定，验证码没有发出，你输入的手机号还在，请重新获取'; return }
  sending.value = false; sErr.value = ''; sent.value = true; cd.value = 60
  showToast({ message: '验证码已发送至 ' + maskPhone(phone.value), teleport })
  timer = setInterval(() => { cd.value--; if (cd.value <= 0) clearInterval(timer) }, 1000)
}

async function submit() {
  pErr.value = cErr.value = sErr.value = ''
  if (!validPhone()) { pErr.value = '请输入正确的 11 位手机号'; return }
  if (!sent.value) { cErr.value = '请先获取验证码'; return }
  if (!/^\d{6}$/.test(code.value)) { cErr.value = '请输入 6 位验证码'; return }
  if (!agree.value) { sErr.value = ERR.agree[0] + '，' + ERR.agree[1]; return }
  busy.value = true
  try { await request(700) } catch { busy.value = false; sErr.value = '网络不太稳定，没有登录成功，你输入的内容还在，请重试'; return }
  busy.value = false
  const me = state.db.me
  if (scene.value === 'phone-bound' || state.db.users.some((u) => u.phone === phone.value && u.id !== me.id)) { pErr.value = '已绑定其他账号，请换号或用微信登录'; return }
  if (scene.value === 'code-expired' || code.value === '111111') { cErr.value = '验证码已过期，请重新获取'; cd.value = 0; clearInterval(timer); return }
  if (code.value !== '123456') { cErr.value = '验证码不对，请重新输入'; return }
  me.phone = phone.value; done()
}
</script>

<template>
  <div class="pg login">
    <section class="hero" aria-label="品牌">
      <h1 class="hero-name">{{ B.shop.name }}</h1>
      <p class="hero-slogan">{{ slogan }}</p>
      <div class="hero-photos"><van-image v-for="(src, i) in photos" :key="i" :src="src" fit="cover" width="100%" height="176" radius="12" alt="" /></div>
    </section>

    <section class="panel">
      <template v-if="step === 'entry'">
        <h2 class="h">欢迎光临</h2>
        <p class="muted hint">登录后可以点单、使用会员卡和优惠券</p>
        <van-notice-bar v-if="alertBox" left-icon="warning-o" wrapable :scrollable="false" color="var(--luz-ink)" background="var(--luz-danger-tint)" class="alert">
          <strong>{{ alertBox[0] }}</strong><br>{{ alertBox[1] }}
        </van-notice-bar>
        <van-button type="primary" block round icon="wechat" :loading="busy" loading-text="登录中" @click="wxLogin">{{ alertKey === 'net' || alertKey === 'cancel' ? '重新登录' : '微信一键登录' }}</van-button>
        <van-button type="primary" plain block round :disabled="busy" @click="step = 'phone'; alertKey = ''">使用手机号登录</van-button>
      </template>

      <template v-else>
        <h2 class="h">手机号登录</h2>
        <p class="muted hint">用于接收订单通知和找回账号，不会用于营销电话</p>
        <van-form class="form" @submit="submit">
          <van-cell-group inset class="fields">
            <van-field v-model.trim="phone" type="tel" name="phone" label="手机号" placeholder="请输入 11 位手机号" maxlength="11" autocomplete="tel" clearable :error-message="pErr" @update:model-value="pErr = ''" />
            <van-field v-model.trim="code" type="digit" name="code" label="验证码" placeholder="6 位验证码" maxlength="6" autocomplete="one-time-code" :error-message="cErr" @update:model-value="cErr = ''">
              <template #button><van-button size="small" type="primary" plain native-type="button" :disabled="cd > 0" :loading="sending" @click="getCode">{{ codeText }}</van-button></template>
            </van-field>
          </van-cell-group>
          <van-notice-bar v-if="sErr" left-icon="warning-o" wrapable :scrollable="false" color="var(--luz-ink)" background="var(--luz-danger-tint)" class="alert">{{ sErr }}</van-notice-bar>
          <van-button type="primary" block round native-type="submit" :loading="busy" loading-text="登录中">登录</van-button>
        </van-form>
        <p class="muted hint">演示验证码：123456 通过，111111 已过期</p>
        <van-button plain block round :disabled="busy" @click="step = 'entry'">返回微信登录</van-button>
      </template>

      <van-cell-group inset class="agree">
        <van-cell center><template #title><van-checkbox v-model="agree" shape="square" @update:model-value="alertKey === 'agree' && (alertKey = '')">我已阅读并同意用户协议和隐私政策</van-checkbox></template></van-cell>
        <van-cell title="《用户协议》" is-link @click="readDoc('agreement')" />
        <van-cell title="《隐私政策》" is-link @click="readDoc('privacy')" />
      </van-cell-group>

      <van-button v-if="isRoot" block round @click="toTab('home')">先逛逛</van-button>
    </section>

    <van-popup v-model:show="docOpen" position="bottom" round closeable class="pg-pop">
      <div class="doc">
        <h3 class="h">{{ doc[0] }}</h3>
        <p class="muted">更新于 {{ docDate }}</p>
        <p v-for="(t, i) in doc.slice(1)" :key="i">{{ t }}</p>
        <van-button type="primary" block round @click="docOpen = false">我知道了</van-button>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.pg, .pg-pop {
  --van-button-small-height: 40px; --van-button-small-font-size: var(--van-font-size-sm);
  --van-field-error-message-font-size: var(--van-font-size-sm);
  --van-notice-bar-line-height: 22px; --van-notice-bar-icon-size: 18px;
}
.fields { --van-cell-line-height: 40px; --van-field-label-width: 4em; }      /* the input itself is 40 px high, the touch target of the library's guidance */
.login { min-height: 100%; display: flex; flex-direction: column; }
.hero { padding: 32px 16px 28px; background: var(--luz-action); color: var(--luz-on-action); }
.hero-name { margin: 0; font-size: var(--t18); line-height: 26px; font-weight: 600; }
.hero-slogan { margin: 4px 0 16px; color: var(--luz-on-action); }
.hero-photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.panel { flex: 1 1 auto; display: grid; gap: 12px; align-content: start; padding: 16px 12px 24px; }
.h { margin: 0; font-size: var(--t16); line-height: 24px; font-weight: 600; }
.hint { margin: -8px 0 0; }
.alert { border-radius: var(--luz-radius-card); }
.form { display: grid; gap: 12px; }
.fields, .agree { border-radius: var(--luz-radius-card); overflow: hidden; }
.doc { display: grid; gap: 12px; padding: 24px 16px 16px; }
.doc p { margin: 0; }
</style>
