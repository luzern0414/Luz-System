<script>
// 设置（二级页）：按“影响谁”分四条带——通知、协议与隐私、通用、账号。开关不做乐观更新，失败在原行写原因。
export const meta = {
  id: 'settings', label: '设置', title: '设置', group: '我的', order: 3,
  layout: '横带分层',
  reason: '设置按“影响谁”分四条带：通知（日常最常调）、协议与隐私（要留痕的）、通用（缓存与关于）、账号（注销与退出）；开关不做乐观更新，失败在原行写原因',
  scenes: [
    { id: 'guest', label: '未登录：只显示协议与通用' },
    { id: 'save-fail', label: '开关保存失败：网络异常' },
    { id: 'pending-doc', label: '协议有新版本待同意' },
  ],
}
</script>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { useNav } from '../nav.js'

const { go, replace } = useNav()
const scene = useScene('settings')
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

// 演示数据的补充：通知开关与缓存；协议版本与专项授权和“协议与隐私”页同一份（谁先打开谁补，另一页沿用）。
// 重置演示数据后（db.users 换了新数组）再补一次。
function seed(db) {
  const marks = (db.seedOf ??= {})
  if (marks.settings !== db.users) {
    marks.settings = db.users
    db.settings = { orderNotify: true, promoNotify: true, sysNotify: true, cacheKB: 24188 }
  }
  if (marks.legal === db.users) return
  const adopt = marks.legal === undefined && db.legal
  marks.legal = db.users
  if (adopt) return
  const upd = (k, fallback) => db.config.pages.find((p) => p.key === k)?.updated || fallback
  db.legal = {
    docs: {
      agreement: { name: '用户协议', version: '2.3', updated: upd('agreement', '2026-08-01') },
      privacy: { name: '隐私政策', version: '3.1', updated: upd('privacy', '2026-08-01'), changes: ['新增“个性化推荐”开关，可随时关闭', '说明订阅消息的数据用途', '补充账号注销后交易记录的保留方式'] },
    },
    consents: { agreement: { version: '2.3', at: '2026-08-02 10:15', channel: '微信小程序' }, privacy: { version: '3.0', at: '2026-07-20 10:15', channel: '微信小程序' } },
    special: [
      { key: 'prepaid', name: '预付卡与储值条款', desc: '购买会员卡、储值充值时使用', on: true, at: '2026-09-12 12:20', effect: '撤回后不能再购买会员卡和储值充值；已有的卡和余额仍可使用，退款按条款办理。' },
      { key: 'personal', name: '个性化推荐', desc: '根据点单偏好推荐菜品和优惠', on: true, at: '2026-08-02 10:15', effect: '撤回后首页和菜单不再按你的偏好推荐，只展示通用内容。' },
      { key: 'location', name: '位置信息', desc: '计算你与门店的距离', on: true, at: '2026-08-02 10:16', effect: '撤回后不再显示距离，需要自己选择门店。' },
    ],
  }
}
seed(state.db)

const guest = computed(() => scene.value === 'guest' || state.role === 'guest')
const logged = computed(() => !guest.value)
const st = computed(() => state.db.settings)
const lg = computed(() => state.db.legal)
const shown = (id) => !state.hidden[id]
const reasonOf = (e) => (e && e.name === 'NetError' ? (e.kind === 'offline' ? '当前没有网络，请连上网络后再试' : '网络不太稳定，请稍后再试') : (e && e.message) || '请稍后再试')
const say = (message) => showToast({ message, teleport: '#phone-overlay', duration: 1500 })

// 确认框：ask(...) 返回 Promise<boolean>
const dlg = reactive({ show: false, title: '', message: '', ok: '确定', cancel: '取消', danger: false })
let settle = null
function ask(o) { Object.assign(dlg, { ok: '确定', cancel: '取消', danger: false }, o, { show: true }); return new Promise((resolve) => { settle = resolve }) }
function answer(v) { if (settle) { settle(v); settle = null } }
watch(() => dlg.show, (v) => { if (!v) answer(false) })

// 通知开关：成功后才切换；关闭要写清影响
const NOTIFY = [
  { key: 'orderNotify', title: '订单通知', sub: '支付成功、出餐取餐、退款到账', off: '关闭后收不到取餐和退款到账提醒，需要自己进订单页查看进度。' },
  { key: 'promoNotify', title: '活动通知', sub: '优惠券到账与临期、活动开始', off: '关闭后不再收到优惠券到账、临期和活动开始的提醒，可能错过优惠；已领取的券照常可用，订单与系统通知不受影响。' },
  { key: 'sysNotify', title: '系统通知', sub: '服务时间调整、账号安全提醒', off: '关闭后可能错过服务时间调整和账号安全提醒。站内信仍会保留在“消息”里。' },
]
const busy = reactive({})
const errs = reactive({})
async function toggle(n, want) {
  errs[n.key] = ''
  if (!want && !(await ask({ title: '关闭' + n.title, message: n.off, ok: '关闭', cancel: '保持开启' }))) return
  busy[n.key] = true
  try {
    await request(600, { fail: scene.value === 'save-fail' ? new Error('网络不太稳定，请稍后再试') : undefined })
    st.value[n.key] = want
    say(want ? '已开启' + n.title : '已关闭' + n.title)
  } catch (e) { errs[n.key] = '没有保存成功：' + reasonOf(e) } finally { busy[n.key] = false }
}

// 协议与隐私：版本、同意留痕、专项授权
const consents = computed(() => ({ ...lg.value.consents, ...(scene.value === 'pending-doc' ? { agreement: { version: '2.2', at: '2026-05-10 09:00', channel: '微信小程序' } } : {}) }))
const pending = (k) => logged.value && (!consents.value[k] || consents.value[k].version !== lg.value.docs[k].version)
const pendingDocs = computed(() => ['agreement', 'privacy'].filter(pending))
const docRows = computed(() => ['agreement', 'privacy'].map((k) => {
  const d = lg.value.docs[k]
  return { key: k, name: d.name, label: '版本 ' + d.version + ' · 更新于 ' + d.updated + (logged.value && !pending(k) ? ' · 已同意' : ''), pend: pending(k) }
}))
const spBusy = reactive({})
const spErr = reactive({})
async function toggleSpecial(s) {
  spErr[s.key] = ''
  if (s.on && !(await ask({ title: '撤回“' + s.name + '”', message: s.effect, ok: '确认撤回', cancel: '保留授权', danger: true }))) return
  spBusy[s.key] = true
  try {
    await request(600)
    s.on = !s.on; s.at = B.fmt(B.NOW())
    say(s.on ? '已重新授权' : '已撤回，' + s.effect.split('；')[0])
  } catch (e) { spErr[s.key] = '没有成功：' + reasonOf(e) } finally { spBusy[s.key] = false }
}

// 通用：缓存、关于
const cacheText = (kb) => (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB')
const clearing = ref(false)
const cacheErr = ref('')
async function clearCache() {
  cacheErr.value = ''
  if (st.value.cacheKB < 200) return say('缓存已经很干净了')
  if (!(await ask({ title: '清除缓存', message: '清除 ' + cacheText(st.value.cacheKB) + ' 缓存？图片和菜单会在下次打开时重新加载，不影响账号、订单、会员卡和余额。', ok: '清除' }))) return
  clearing.value = true
  const old = st.value.cacheKB
  try { await request(900); st.value.cacheKB = 120; say('已清除 ' + cacheText(old - 120)) } catch (e) { cacheErr.value = '没有清除成功：' + reasonOf(e) } finally { clearing.value = false }
}
const aboutOpen = ref(false)
const ABOUT = computed(() => [['运营主体', B.shop.name], ['客服电话', B.shop.phone], ['服务时间', B.shop.hours], ['门店地址', B.shop.addr]])

// 账号
async function logout() {
  if (!(await ask({ title: '退出登录', message: '退出后需要重新登录，才能查看订单、会员卡和优惠券。', ok: '退出', danger: true }))) return
  state.role = 'guest'; state.signedIn = false; replace('login')
}
</script>

<template>
  <div class="mp-page settings">
    <MiniState :status="phase" :rows="8" @retry="load">
      <van-notice-bar v-if="pendingDocs.length" left-icon="info-o" :scrollable="false" wrapable class="tip-warn" :text="'协议已更新，请阅读并同意：' + pendingDocs.map((k) => lg.docs[k].name).join('、') + '有新版本，请点下方标有“有更新”的条目阅读'" />

      <!-- 通知 -->
      <div v-if="logged">
        <van-cell-group inset title="通知">
          <van-cell v-for="n in NOTIFY" :key="n.key" center :title="n.title">
            <template #label>{{ n.sub }}<div v-if="errs[n.key]" class="err" role="alert">{{ errs[n.key] }}</div></template>
            <template #right-icon><van-switch :model-value="st[n.key]" :loading="busy[n.key]" :disabled="busy[n.key]" size="24" :aria-label="n.title" @update:model-value="toggle(n, $event)" /></template>
          </van-cell>
        </van-cell-group>
      </div>

      <!-- 协议与隐私 -->
      <div>
        <van-cell-group inset title="协议与隐私">
          <van-cell v-for="d in docRows" :key="d.key" :label="d.label" is-link @click="go('legal', { doc: d.key })">
            <template #title>{{ d.name }}<van-tag v-if="d.pend" type="warning" plain round class="tag-new">有更新</van-tag></template>
          </van-cell>
        </van-cell-group>
      </div>
      <div v-if="logged">
        <van-cell-group inset title="专项授权">
          <van-cell v-for="s in lg.special" :key="s.key" center :title="s.name">
            <template #label>
              <div>{{ s.desc }}</div>
              <div :class="s.on ? 'on' : 'off'">{{ s.on ? '已授权' : '已撤回' }} · {{ s.at }}</div>
              <div v-if="!s.on">已生效：{{ s.effect }}</div>
              <div v-if="spErr[s.key]" class="err" role="alert">{{ spErr[s.key] }}</div>
            </template>
            <template #right-icon><van-button size="small" :plain="s.on" :type="s.on ? 'default' : 'primary'" round :loading="spBusy[s.key]" @click="toggleSpecial(s)">{{ s.on ? '撤回' : '重新授权' }}</van-button></template>
          </van-cell>
        </van-cell-group>
        <p class="note muted">用户协议和隐私政策不能单独撤回；如不再同意，可以申请注销账号。</p>
      </div>

      <!-- 通用 -->
      <div>
        <van-cell-group inset title="通用">
          <van-cell center title="清除缓存" :label="cacheErr" is-link @click="clearCache">
            <template #value><van-loading v-if="clearing" size="18" /><span v-else class="num">{{ cacheText(st.cacheKB) }}</span></template>
          </van-cell>
          <van-cell title="关于" :value="'版本 ' + state.version.front" is-link @click="aboutOpen = true" />
        </van-cell-group>
      </div>

      <!-- 账号 -->
      <template v-if="logged">
        <div>
          <van-cell-group inset title="账号">
            <van-cell v-if="shown('cancel-account')" title="账号注销" label="注销前需要先处理订单、会员卡和余额" is-link @click="go('cancel-account')" />
          </van-cell-group>
        </div>
        <van-button block round plain @click="logout">退出登录</van-button>
      </template>
      <van-button v-else type="primary" block round @click="go('login', { redirect: 'back', from: 'settings' })">登录</van-button>
    </MiniState>

    <!-- 关于 -->
    <van-popup v-model:show="aboutOpen" position="bottom" round closeable>
      <div class="sheet">
        <h3 class="sheet-title">关于</h3>
        <p class="about-name">{{ B.shop.name }}小程序</p>
        <van-cell-group>
          <van-cell v-for="[k, v] in ABOUT" :key="k" :title="k" :value="v" />
        </van-cell-group>
        <div class="sheet-actions"><van-button type="primary" round block @click="aboutOpen = false">我知道了</van-button></div>
      </div>
    </van-popup>

    <van-dialog v-model:show="dlg.show" :title="dlg.title" :message="dlg.message" show-cancel-button :confirm-button-text="dlg.ok" :cancel-button-text="dlg.cancel" :confirm-button-color="dlg.danger ? 'var(--luz-danger)' : undefined" @confirm="answer(true)" @cancel="answer(false)" />
  </div>
</template>

<style scoped>
.tip-warn { --van-notice-bar-background: var(--luz-warning-tint); --van-notice-bar-text-color: var(--luz-warning); }
.err { margin-top: 2px; color: var(--luz-danger); }
.on { color: var(--luz-success); }
.off { color: var(--luz-warning); }
.note { margin: 8px 4px 0; }
.tag-new { margin-left: 8px; vertical-align: 1px; }
.sheet { padding: 16px 0 24px; }
.sheet-title { margin: 0 0 8px; padding: 0 48px 0 16px; font-size: var(--t16); line-height: 24px; font-weight: 600; }
.about-name { margin: 0 16px 8px; font-size: var(--t18); line-height: 26px; font-weight: 600; }
.sheet-actions { padding: 16px 16px 0; }
</style>
