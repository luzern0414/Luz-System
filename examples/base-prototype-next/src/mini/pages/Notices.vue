<script>
// 消息（二级页）：订阅额度 → 分组页签与全部已读 → 按今天、昨天、更早分带的站内信；点开读详情并跳到对应页面。读写 state.db.notices。
export const meta = {
  id: 'notices', label: '消息', title: '消息', group: '门店与消息', order: 2,
  layout: '横带分层',
  reason: '消息先回答“有没有要处理的”：顶部一条订阅额度（额度不够时给“去授权”），中间分组页签带未读数和全部已读，下面按今天、昨天、更早分带；未读用红点，点开读详情并跳到对应页面',
  scenes: [
    { id: 'quota-low', label: '订阅额度全部用完：提示去授权' },
    { id: 'sub-ban', label: '授权失败：微信里关闭了订阅消息' },
    { id: 'jump-gone', label: '点开消息：目标页面已不存在' },
  ],
}
</script>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K } from '../../shared/format.js'
import { useNav } from '../nav.js'
import { pageOf } from '../registry.js'

const { go, replace, toTab, isTab } = useNav()
const scene = useScene('notices')
const toast = (message, type) => showToast({ message, type, teleport: '#phone-overlay', duration: 1800 })

const todayStr = () => K.ymd(K.today())
const addD = (s, n) => K.ymd(K.addDays(new Date(s + 'T00:00:00'), n))

// ---------- 演示数据：共用 data.js 的 5 条消息没有“点开去哪里”，也没有活动类消息与订阅额度，这里补上；重置演示数据后（db.users 换了新数组）再补一次 ----------
function seed() {
  const db = state.db
  const marks = (db.seedOf ??= {})
  if (marks.notices === db.users) return
  marks.notices = db.users
  const t = todayStr(), D = (n) => addD(t, n), at = (n, hm) => D(n) + ' ' + hm
  const jump = { 1: { page: 'orders', params: { seg: 'pickup' } }, 2: { page: 'coupons' }, 3: { page: 'my-cards' }, 5: { page: 'orders', params: { seg: 'refund' } } }
  db.notices.forEach((n) => { if (n.jump === undefined) n.jump = jump[n.id] || null })
  let id = db.notices.reduce((m, n) => Math.max(m, n.id), 0)
  ;[['活动', '新人礼券已到账', '一张“满 20 减 5”的新人券已放入“我的优惠券”，今天内有效，下单时自动抵扣。', at(0, '08:05'), false, { page: 'coupons' }],
    ['活动', '周末满 60 减 15 后天开抢', '周末满 60 减 15 将在后天 00:00 开放领取，每人限领 1 张，先到先得。', at(-1, '18:30'), false, { page: 'coupons', params: { tab: 'center' } }],
    ['订单', '订单已完成', '您的订单已完成，欢迎再次光临。评价订单可以帮助我们做得更好。', at(-1, '13:02'), true, { page: 'orders', params: { seg: 'done' } }],
    ['系统', '隐私政策将于近期更新', '隐私政策已更新到 3.1 版，新增“个性化推荐”开关并说明订阅消息的数据用途，请阅读并确认。', at(-2, '10:00'), false, { page: 'legal', params: { doc: 'privacy' } }],
    ['会员卡', '十次卡剩余 7 次', '您的十次卡还剩 7 次，有效期至 ' + D(70) + '，可在任意门店使用。', at(-4, '12:05'), true, { page: 'my-cards' }],
    ['活动', '储值充 100 送 10', '储值满 100 元赠 10 元，赠送金与本金同样可以抵扣订单，限时进行中。', at(-6, '09:00'), true, { page: 'wallet' }],
    ['订单', '订单待支付提醒', '您有一笔订单还没有支付，请在 30 分钟内完成支付，超时将自动取消。', at(-7, '11:40'), true, { page: 'orders', params: { seg: 'unpaid' } }],
    ['系统', '账号安全提醒', '您的账号刚在新设备上登录。如非本人操作，请尽快联系客服。', at(-9, '20:15'), true, null],
    ['活动', '生日月福利预告', '补全个人资料里的生日，生日当月可享专属权益。', at(-12, '10:30'), true, { page: 'profile' }],
    ['订单', '退款申请已受理', '您的退款申请已受理，审核通过后将原路退回，请留意到账通知。', at(-14, '16:45'), true, { page: 'orders', params: { seg: 'refund' } }],
  ].forEach(([kind, title, body, when, read, jp]) => db.notices.push({ id: ++id, kind, title, body, at: when, read, jump: jp }))
  db.subs = [{ id: 1, name: '订单支付成功', desc: '付款后通知取餐号', left: 3 }, { id: 2, name: '订单完成', desc: '出餐后提醒取餐', left: 1 }, { id: 3, name: '退款到账', desc: '退款原路退回后通知', left: 0 }, { id: 4, name: '会员卡到期', desc: '到期前 7、3、1 天提醒', left: 0 }]
}
seed()

const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); seed(); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)
const status = computed(() => (state.role === 'guest' ? 'forbidden' : phase.value))

// ---------- 分组、图标、时间 ----------
const GS = [['all', '全部'], ['订单', '订单'], ['活动', '活动'], ['系统', '系统']]
const groupOf = (n) => ({ 订单: '订单', 会员卡: '订单', 卡券: '活动', 活动: '活动', 系统: '系统' }[n.kind] || '系统')
const iconOf = (n) => ({ 订单: 'orders-o', 会员卡: 'vip-card-o', 卡券: 'coupon-o', 活动: 'gift-o', 系统: 'bell' }[n.kind] || 'bell')
const JUMP = { orders: '查看订单', coupons: '去使用', 'my-cards': '查看会员卡', wallet: '查看储值', legal: '去阅读', profile: '去完善资料', 'card-detail': '查看会员卡' }
const dayLabel = (at) => { const d = at.slice(0, 10), t = todayStr(); return d === t ? '今天' : d === addD(t, -1) ? '昨天' : '更早' }
const timeLabel = (at) => { const d = at.slice(0, 10), t = todayStr(); return d === t ? at.slice(11, 16) : d === addD(t, -1) ? '昨天' : d }

const g = ref('all')
const shown = ref(10)
const more = ref(false)
watch(g, () => { shown.value = 10 })
const all = computed(() => state.db.notices.filter((n) => !n.deleted))
const unreadOf = (id) => all.value.filter((n) => !n.read && (id === 'all' || groupOf(n) === id)).length
const rows = computed(() => all.value.filter((n) => g.value === 'all' || groupOf(n) === g.value).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)))
const bands = computed(() => {
  const out = []
  rows.value.slice(0, shown.value).forEach((n) => {
    const d = dayLabel(n.at)
    if (!out.length || out[out.length - 1].label !== d) out.push({ label: d, items: [] })
    out[out.length - 1].items.push(n)
  })
  return out
})
const emptyText = computed(() => (g.value === 'all' ? '还没有消息，订单进度、优惠和会员卡提醒会出现在这里' : '暂时没有' + g.value + '消息'))
async function loadMore() { more.value = true; try { await request(300); shown.value += 10 } catch { toast('加载失败，请检查网络后重试', 'fail') } finally { more.value = false } }

// ---------- 确认框：全部已读、删除（等服务器，失败写在框里并保留） ----------
const dlg = reactive({ show: false, title: '', message: '', confirmText: '确定', danger: false, error: '', run: null, failHint: '' })
const ask = (o) => Object.assign(dlg, { show: true, error: '', danger: false, failHint: '', ...o })
async function beforeClose(action) {
  if (action !== 'confirm') return true
  dlg.error = ''
  try { await request(500); dlg.run(); return true } catch (e) { dlg.error = e.message + '：' + dlg.failHint; return false }
}
function askMarkAll() {
  const ts = all.value.filter((n) => !n.read && (g.value === 'all' || groupOf(n) === g.value))
  if (!ts.length) return toast('没有未读消息')
  ask({
    title: '全部已读', confirmText: '全部已读',
    message: '把' + (g.value === 'all' ? '全部' : '“' + g.value + '”类') + ' ' + ts.length + ' 条未读消息标为已读？红点会消失，消息不会被删除。',
    failHint: '没有标为已读，红点还在，请检查网络后再点“全部已读”',
    run: () => { ts.forEach((n) => { n.read = true }); toast('已全部标为已读', 'success') },
  })
}

// ---------- 详情 ----------
const detail = ref(null)
const sheet = ref(false)
const jumpErr = ref('')
const jumpLabel = computed(() => { const j = detail.value?.jump; return j ? JUMP[j.page] || '查看详情' : '我知道了' })
function open(n) {
  if (!n.read) n.read = true
  detail.value = n; jumpErr.value = ''; sheet.value = true
}
function askDelete() {
  const n = detail.value
  sheet.value = false
  ask({
    title: '删除消息', confirmText: '删除', danger: true, message: '删除“' + n.title + '”？删除后这条消息不再显示。',
    failHint: '没有删除，这条消息还在，请检查网络后再试',
    run: () => { n.deleted = true; toast('已删除', 'success') },
  })
}
function goDetail() {
  const j = detail.value.jump
  if (!j) { sheet.value = false; return }
  if (!pageOf(j.page) || scene.value === 'jump-gone') { jumpErr.value = '这条消息对应的页面已经不存在了，可以删除这条消息，或稍后再看。'; return }
  sheet.value = false
  if (isTab(j.page)) replace(j.page, j.params); else go(j.page, j.params)
}

// ---------- 订阅额度与授权 ----------
const granted = reactive({})
const quota = computed(() => state.db.subs.map((s) => ({ ...s, left: scene.value === 'quota-low' ? granted[s.id] || 0 : s.left })))
const low = computed(() => quota.value.filter((x) => x.left <= 0))
const quotaOpen = ref([])
const auth = reactive({ show: false, sel: [], error: '', busy: false })
function openAuth() {
  auth.sel = (low.value.length ? low.value : quota.value).map((x) => x.id); auth.error = ''; auth.show = true
}
async function allow() {
  auth.error = ''
  if (!auth.sel.length) { auth.error = '请至少选择一项，不选就不会增加额度。'; return }
  if (auth.sel.length > 5) { auth.error = '一次最多只能选择 5 项，请取消几项后再允许。'; return }
  auth.busy = true
  try {
    await request(600, { fail: scene.value === 'sub-ban' ? new Error('你在微信“设置 > 通知”里关闭了该小程序的订阅消息，请先打开后再授权') : undefined })
    state.db.subs.forEach((s) => { if (auth.sel.includes(s.id)) { if (scene.value === 'quota-low') granted[s.id] = (granted[s.id] || 0) + 1; else s.left += 1 } })
    auth.show = false; toast('已授权，所选提醒各增加 1 次', 'success')
  } catch (e) {
    auth.error = '授权没有成功：' + e.message + '。额度没有增加，选择的项目还在，处理后可以再点“允许”；不授权也不影响点单，站内信仍可查看。'
  } finally { auth.busy = false }
}
function refuse() { auth.show = false; toast('已拒绝，不影响使用，站内信仍可查看') }
</script>

<template>
  <div class="mp-page nt">
    <MiniState :status="status" :rows="6" error-text="消息加载失败" @retry="load">
      <template #forbidden-action><van-button type="primary" round size="small" @click="go('login')">去登录</van-button></template>

      <van-cell-group inset>
        <van-cell center title="订阅提醒额度" :label="low.length ? '“' + low.map((x) => x.name).join('”“') + '”额度已用完，到时可能收不到微信提醒' : '额度充足，订单和会员卡提醒会推送到微信'">
          <template #icon><span class="ic ic-wrap k-sys"><van-icon name="bell" /></span></template>
          <template #value><van-button size="small" round :type="low.length ? 'primary' : 'default'" @click="openAuth">{{ low.length ? '去授权' : '补充额度' }}</van-button></template>
        </van-cell>
        <van-collapse v-model="quotaOpen" :border="false">
          <van-collapse-item title="各项提醒的剩余次数" name="q">
            <van-cell v-for="q in quota" :key="q.id" :title="q.name" :border="false">
              <template #value><van-tag plain :type="q.left <= 0 ? 'danger' : 'success'">{{ q.left <= 0 ? '已用完' : '剩 ' + q.left + ' 次' }}</van-tag></template>
            </van-cell>
          </van-collapse-item>
        </van-collapse>
      </van-cell-group>

      <van-tabs v-model:active="g" :swipeable="false" class="top" aria-label="消息分类">
        <van-tab v-for="s in GS" :key="s[0]" :name="s[0]" :title="s[1] + (unreadOf(s[0]) ? ' ' + unreadOf(s[0]) : '')" />
      </van-tabs>
      <div class="sum">
        <span class="muted">{{ unreadOf('all') ? unreadOf('all') + ' 条未读' : '全部已读' }}</span>
        <van-button size="small" plain type="primary" icon="success" :disabled="!unreadOf(g)" @click="askMarkAll">全部已读</van-button>
      </div>

      <MiniState v-if="!rows.length" status="empty" :empty-text="emptyText">
        <template #empty-action>
          <van-button v-if="g === 'all'" round type="primary" size="small" @click="toTab('menu')">去点单</van-button>
          <van-button v-else round plain type="primary" size="small" @click="g = 'all'">看全部消息</van-button>
        </template>
      </MiniState>
      <template v-else>
        <van-cell-group v-for="b in bands" :key="b.label" inset :title="b.label">
          <van-cell v-for="n in b.items" :key="n.id" center clickable is-link @click="open(n)">
            <template #icon>
              <van-badge :dot="!n.read" class="ic-wrap" :aria-label="n.read ? '' : '未读'"><span class="ic" :class="'k-' + ({ 订单: 'order', 活动: 'promo', 系统: 'sys' }[groupOf(n)])"><van-icon :name="iconOf(n)" /></span></van-badge>
            </template>
            <template #title><span :class="{ b: !n.read }">{{ n.title }}</span></template>
            <template #label><span class="clamp-2 body">{{ n.body }}</span></template>
            <template #value><span class="muted num">{{ timeLabel(n.at) }}</span></template>
          </van-cell>
        </van-cell-group>
        <van-button v-if="rows.length > shown" block plain type="primary" :loading="more" @click="loadMore">加载更多（还有 {{ rows.length - shown }} 条）</van-button>
        <div v-else-if="rows.length > 10" class="muted end">没有更多了</div>
      </template>
    </MiniState>

    <van-popup v-model:show="sheet" position="bottom" round safe-area-inset-bottom>
      <div v-if="detail" class="detail">
        <div class="muted">{{ detail.kind }}通知 · <span class="num">{{ detail.at }}</span></div>
        <h3>{{ detail.title }}</h3>
        <p>{{ detail.body }}</p>
        <div v-if="jumpErr" class="err" role="alert"><van-icon name="warning-o" /><span>{{ jumpErr }}</span></div>
        <div class="auth-btns">
          <van-button block plain type="danger" @click="askDelete">删除这条消息</van-button>
          <van-button block type="primary" @click="goDetail">{{ jumpLabel }}</van-button>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="auth.show" position="bottom" round safe-area-inset-bottom>
      <div class="auth">
        <div class="auth-head">
          <span class="ic k-order"><van-icon name="shop-o" /></span>
          <div><div class="b">{{ B.shop.name }}</div><div class="muted">想给你发送以下通知</div></div>
        </div>
        <van-checkbox-group v-model="auth.sel" class="auth-list">
          <van-cell-group inset>
            <van-cell v-for="q in quota" :key="q.id" clickable :title="q.name" :label="q.desc + '（一次性，授权一次收到一次）'" @click="auth.sel = auth.sel.includes(q.id) ? auth.sel.filter((x) => x !== q.id) : [...auth.sel, q.id]">
              <template #right-icon><van-checkbox :name="q.id" @click.stop /></template>
            </van-cell>
          </van-cell-group>
        </van-checkbox-group>
        <div v-if="auth.error" class="err" role="alert"><van-icon name="warning-o" /><span>{{ auth.error }}</span></div>
        <p class="muted">一次最多选 5 项。拒绝授权不影响点单和使用，站内信仍然可以看到。</p>
        <div class="auth-btns">
          <van-button block plain @click="refuse">拒绝</van-button>
          <van-button block type="primary" :loading="auth.busy" @click="allow">允许</van-button>
        </div>
      </div>
    </van-popup>

    <van-dialog v-model:show="dlg.show" :title="dlg.title" show-cancel-button :confirm-button-text="dlg.confirmText" :confirm-button-color="dlg.danger ? 'var(--luz-danger)' : 'var(--luz-action)'" :before-close="beforeClose">
      <div class="dlg">
        <p>{{ dlg.message }}</p>
        <div v-if="dlg.error" class="err" role="alert"><van-icon name="warning-o" /><span>{{ dlg.error }}</span></div>
      </div>
    </van-dialog>
  </div>
</template>

<style scoped>
.top { border-radius: var(--luz-radius-card); overflow: hidden; }
.sum { display: flex; align-items: center; justify-content: space-between; padding: 0 4px; }
.end { text-align: center; }
.b { font-weight: 600; }
.body { font-size: var(--t16); }
.ic-wrap { margin-right: 12px; }
.ic { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; font-size: 20px; flex: none; }
.k-order { background: var(--luz-action-tint); color: var(--luz-action-text); }
.k-promo { background: var(--luz-price-tint); color: var(--luz-price); }
.k-sys { background: var(--luz-info-tint); color: var(--luz-info); }
.err { display: flex; gap: 6px; margin-top: 8px; color: var(--luz-danger); }
.err .van-icon { margin-top: 3px; flex: none; }
.detail { padding: 20px 16px 16px; display: grid; gap: 8px; }
.detail h3 { margin: 0; font-size: var(--t16); line-height: 24px; font-weight: 600; }
.detail p { margin: 0; }
.auth { padding: 16px 0 16px; display: grid; gap: 12px; }
.auth .ic { margin-right: 12px; }
.auth > :not(.auth-list) { margin-left: 16px; margin-right: 16px; }
.auth-head { display: flex; align-items: center; }
.auth-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dlg { padding: 8px 24px 16px; }
.dlg p { margin: 0; }
</style>
