<script>
// 购物车（横带分层）：已选商品 → 失效商品 → 底部合计与去结算。
// 这个文件的普通脚本块还导出结算、支付结果、门店三页共用的交易辅助（门店与购买规则的演示数据、营业状态、行状态、购买规则、报价）。
import { reactive, toRaw } from 'vue'
import { B } from '../../shared/data.js'
import { state } from '../../shared/state.js'
import { K } from '../../shared/format.js'
import { cart, addToCart } from '../cart.js'

export const meta = {
  id: 'cart', label: '购物车', title: '购物车', group: '点单', order: 4,
  layout: '横带分层',
  reason: '单列从上到下：先是能结算的商品，再是失效的，最后固定在底部的合计与去结算；视线从“买什么”走到“花多少”',
  scenes: [
    { id: 'invalid', label: '有失效商品（下架、售罄、库存不足）' },
    { id: 'rest', label: '营业状态：休息中（不能结算）' },
    { id: 'closed', label: '营业状态：已打烊（不能结算）' },
    { id: 'paused', label: '营业状态：暂停营业（不能结算）' },
    { id: 'rule', label: '商品不满足购买规则' },
  ],
}

/* ---------- 演示时钟：每天 10:30 起，按真实时间往前走 ---------- */
const T0 = Date.now()
export const demoNow = () => new Date(B.NOW().getTime() + (Date.now() - T0))
export const stamp = () => B.fmt(demoNow())
const toMin = (s) => { const [a, b] = s.split(':').map(Number); return a * 60 + b }
const hm = (m) => K.pad(Math.floor(m / 60)) + ':' + K.pad(m % 60)
const hoursOf = (hours) => hours.split(/[–-]/).map((s) => s.trim())

/* ---------- 演示数据：门店 5 家、当前自取门店、购买规则（共用数据里还没有，这里补，只补一次） ---------- */
export const STORES = [
  { id: 1, name: B.shop.name, addr: B.shop.addr, phone: B.shop.phone, hours: B.shop.hours, status: 'OPEN', dist: 320, x: 150, y: 215, tags: ['可自取', '有座位'], queue: 3 },
  { id: 2, name: '示例门店 · 万象店', addr: '示例市示例区万象路 12 号 一层', phone: '400-000-0001', hours: '10:00–22:00', status: 'OPEN', dist: 860, x: 270, y: 170, tags: ['可自取', '停车位'], queue: 5 },
  { id: 3, name: '示例门店 · 东湖店', addr: '示例市东湖区滨湖路 45 号', phone: '400-000-0002', hours: '09:00–20:30', status: 'OPEN', dist: 1900, x: 95, y: 300, tags: ['可自取', '临湖座位'], queue: 1 },
  { id: 4, name: '示例门店 · 大学城店', addr: '示例市大学城中路 8 号 学生街', phone: '400-000-0003', hours: '08:00–21:30', status: 'PAUSED', dist: 3200, x: 285, y: 300, tags: ['可自取'], queue: 0 },
  { id: 5, name: '示例门店 · 南站店', addr: '示例市南站东路 3 号 候车厅旁', phone: '400-000-0004', hours: '06:30–19:00', status: 'OPEN', dist: 5600, x: 205, y: 340, tags: ['可自取', '早餐'], queue: 2 },
]
export function tradeSeed() {
  const db = state.db
  if (!db.stores) db.stores = STORES.map((s) => ({ ...s, tags: [...s.tags] }))
  if (db.curStore == null) db.curStore = 1
  if (!db.buyRules) db.buyRules = { 9: { min: 2 }, 1: { limit: { n: 2, period: 'day' } }, 2: { max: 3 }, 11: { once: true } }
  if (!db._trade) db._trade = { seq: 440, pickup: 30, lastPay: 'wechat' }
  return db
}
tradeSeed()
export const storeOf = (id) => state.db.stores.find((s) => s.id === (id || state.db.curStore)) || state.db.stores[0]
export const fmtDist = (m) => (m == null ? '—' : m < 1000 ? m + ' 米' : (m / 1000).toFixed(1) + ' 公里')
export const prepMin = (s) => 8 + (s.queue || 0) * 3
/** 取餐时段：营业时间内每 15 分钟一个，开始时间早于“现在加出餐时间”的已过 */
export function slotsOf(store) {
  const [o, c] = hoursOf(store.hours), now = demoNow(), earliest = now.getHours() * 60 + now.getMinutes() + prepMin(store), list = []
  for (let m = toMin(o); m + 15 <= toMin(c); m += 15) list.push({ label: hm(m) + '–' + hm(m + 15), past: m < earliest })
  return { list, asap: hm(earliest) }
}

/* ---------- 营业状态：key 为 open / rest / closed / paused ---------- */
export function shopInfo(key, hours = B.shop.hours) {
  const [o, c] = hoursOf(hours)
  return {
    open: { key: 'open', label: '营业中', tag: 'success', canOrder: true, hint: '营业至 ' + c },
    rest: { key: 'rest', label: '休息中', tag: 'warning', canOrder: false, hint: o + ' 开始营业' },
    closed: { key: 'closed', label: '已打烊', tag: 'default', canOrder: false, hint: '明天 ' + o + ' 营业' },
    paused: { key: 'paused', label: '暂停营业', tag: 'warning', canOrder: false, hint: '临时暂停，预计 11:30 恢复' },
  }[key] || shopInfo('open', hours)
}
export const forcedShop = (scene) => (['rest', 'closed', 'paused'].includes(scene) ? scene : null)
/** 某家门店此刻的营业状态：全店状态（演示面板或页面场景）优先，其次门店自己的暂停与营业时间；atMin 是演示用的“当前分钟” */
export function storeShopKey(store, { forced = null, atMin = null } = {}) {
  if (forced) return forced
  if (state.shopStatus !== 'open') return state.shopStatus
  if (store.status === 'PAUSED') return 'paused'
  const [o, c] = hoursOf(store.hours), now = demoNow(), t = atMin ?? now.getHours() * 60 + now.getMinutes()
  return t < toMin(o) ? 'rest' : t >= toMin(c) ? 'closed' : 'open'
}

/* ---------- 演示条件：页面场景造出来的“库存没了、调价、券失效”，不改商品与券的数据本身 ---------- */
export const fx = reactive({ stock: {}, price: {}, gone: {} })
export const productOf = (pid) => state.db.products.find((p) => p.id === Number(pid))
export const stockOf = (p) => (p.id in fx.stock ? fx.stock[p.id] : p.stock)
export const defaultSpec = (p) => (p.specs || []).map((g) => g.opts[0].n).join(' / ')
export function specExtra(p, spec) {
  const parts = String(spec || '').split(' / ')
  return (p.specs || []).reduce((s, g) => s + ((g.opts.find((o) => parts.includes(o.n)) || {}).d || 0), 0)
}
/** 商品现在的单价（含规格加价与演示调价）；购物车行里存的是加入时的价格 */
export const nowPrice = (l) => { const p = productOf(l.pid); return p ? p.price + (fx.price[p.id] || 0) + specExtra(p, l.spec) : l.price }
export const origOf = (l) => { const p = productOf(l.pid); return p ? Math.max(l.price, p.orig + (l.price - p.price)) : l.price }
export const cartKey = (pid, spec) => pid + '|' + (spec || '')
export function addLine(pid, qty, selected = true) {
  const p = productOf(pid); if (!p) return null
  const spec = defaultSpec(p)
  addToCart(p, { spec, specExtra: specExtra(p, spec), qty })
  const l = cart.lines.find((x) => x.key === cartKey(pid, spec)); if (l) l.selected = selected
  return l
}
/** 第一次进入购物车或结算时，预置两行（牛腩饭、中式早餐）；演示重置后再预置一次 */
const seeded = new WeakSet()
export function seedCart() {
  const marker = toRaw(state.db.cart)
  if (seeded.has(marker)) return
  seeded.add(marker)
  if (!cart.lines.length) { addLine(1, 1); addLine(9, 2) }
}

/* ---------- 行状态：下架、售罄、库存不足 ---------- */
export function lineState(l) {
  const p = productOf(l.pid)
  if (!p || p.status !== 'ON') return { ok: false, kind: 'off', text: '已下架' }
  const stock = stockOf(p)
  if (stock <= 0) return { ok: false, kind: 'out', text: '已售罄' }
  if (l.qty > stock) return { ok: false, kind: 'short', text: '库存不足，仅剩 ' + stock + ' 件', fix: stock }
  return { ok: true }
}
export const lowOf = (l) => { const p = productOf(l.pid); const s = p ? stockOf(p) : 0; return s > 0 && s <= 3 ? s : 0 }

/* ---------- 购买规则：起售、单笔上限、只能买一次、周期限购 ---------- */
export const rulesOf = (p) => (state.db.buyRules || {})[p.id] || {}
function bought(pid, period) {
  const me = state.db.me, today = K.ymd(demoNow())
  return state.db.orders.filter((o) => o.userId === me.id && !['CANCELLED', 'REFUNDED'].includes(o.status) && (period === 'day' ? o.createdAt.slice(0, 10) === today : true))
    .reduce((s, o) => s + o.items.filter((i) => i.pid === pid).reduce((a, i) => a + i.qty, 0), 0)
}
/** 本人还能买几件（没有限制是 Infinity） */
export function ruleLeft(p) {
  const r = rulesOf(p)
  if (r.once) return bought(p.id) > 0 ? 0 : 1
  if (r.limit) return Math.max(0, r.limit.n - bought(p.id, r.limit.period))
  return Infinity
}
/** 一单最多能买的件数：库存、单笔上限、本人剩余里取最小 */
export const ruleCap = (p) => Math.max(0, Math.min(stockOf(p), rulesOf(p).max || Infinity, ruleLeft(p)))
/** 这一行最多能调到几件（同一商品的其他规格已占用的不算） */
export function lineMax(l) {
  const p = productOf(l.pid); if (!p) return l.qty
  const others = cart.lines.filter((x) => x.pid === l.pid && x.key !== l.key).reduce((s, x) => s + x.qty, 0)
  return Math.max(l.qty, ruleCap(p) - others)
}
/** 逐条找出不满足规则的商品，每条带一步出路 */
export function ruleProblems(lines) {
  const out = [], byPid = {}
  lines.forEach((l) => { byPid[l.pid] = (byPid[l.pid] || 0) + l.qty })
  Object.entries(byPid).forEach(([pid, qty]) => {
    const p = productOf(pid), r = rulesOf(p), left = ruleLeft(p), first = lines.find((l) => l.pid === Number(pid))
    if (r.min && qty < r.min) out.push({ key: first.key, name: p.name, text: p.name + '需要 ' + r.min + ' 件起售', fix: { label: '改为 ' + r.min + ' 件', qty: r.min } })
    if (r.max && qty > r.max) out.push({ key: first.key, name: p.name, text: p.name + '每单最多 ' + r.max + ' 件', fix: { label: '改为 ' + r.max + ' 件', qty: r.max } })
    if (left !== Infinity && qty > left) out.push({ key: first.key, name: p.name, text: left > 0 ? p.name + '你还可买 ' + left + ' 件' : p.name + '已达购买上限', fix: left > 0 ? { label: '改为 ' + left + ' 件', qty: left } : { label: '移除', qty: 0 } })
  })
  return out
}

/* ---------- 报价：小计、券、实付（购物车、结算、订单用同一套算法，金额按分） ---------- */
export const usableCoupons = () => { const today = K.ymd(demoNow()); return state.db.myCoupons.filter((c) => c.state === 'UNUSED' && c.expire >= today && !fx.gone[c.id]) }
export const couponWorth = (c, subtotal) => (c.kind === '折扣' ? Math.min((state.db.coupons.find((x) => x.id === c.couponId) || {}).cap || Infinity, Math.floor((subtotal * (100 - c.value)) / 100)) : c.value)
export const couponFace = (c) => (c.kind === '折扣' ? c.value / 10 + ' 折' : '减 ¥' + c.value / 100)
/** pick：undefined 自动选最优券，null 不用券，数字是指定的券 */
export function quoteOf(lines, pick) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0), orig = lines.reduce((s, l) => s + origOf(l) * l.qty, 0), usable = usableCoupons()
  const fits = usable.filter((c) => subtotal >= c.threshold && subtotal > 0)
  const coupon = pick === null ? null : pick === undefined ? [...fits].sort((a, b) => couponWorth(b, subtotal) - couponWorth(a, subtotal))[0] || null : fits.find((c) => c.id === pick) || null
  const discount = coupon ? Math.min(subtotal, couponWorth(coupon, subtotal)) : 0
  const nx = usable.filter((c) => subtotal < c.threshold && c.threshold > 0).sort((a, b) => a.threshold - b.threshold)[0]
  return { count: lines.reduce((s, l) => s + l.qty, 0), subtotal, orig, saved: Math.max(0, orig - subtotal), coupon, discount, pay: subtotal - discount, next: nx ? { need: nx.threshold - subtotal, name: nx.name, value: nx.value } : null }
}

// 页面场景“有失效商品”塞进购物车的行，离开场景时拿走
const injected = new Set()
</script>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useScene, setScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { money } from '../../shared/format.js'
import { useNav } from '../nav.js'
import { setQty } from '../cart.js'

const { go, toTab } = useNav()
const scene = useScene('cart')
const toast = (message, o = {}) => showToast({ message, teleport: '#phone-overlay', ...o })
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
load()

/* 场景：失效商品、购买规则；离开场景时拿走演示塞进来的行和库存条件 */
function applyScene(s) {
  seedCart()
  if (s === 'invalid') {
    fx.stock[7] = 0; fx.stock[5] = 3
    ;[[12, 1], [7, 1], [5, 5]].forEach(([pid, qty]) => { const l = addLine(pid, qty, false); if (l) injected.add(l.key) })
  } else {
    delete fx.stock[7]; delete fx.stock[5]
    if (injected.size) { cart.lines = cart.lines.filter((l) => !injected.has(l.key)); injected.clear() }
  }
  if (s === 'rule') { const l = cart.lines.find((x) => x.pid === 9); if (l) { l.qty = 1; l.selected = true } else addLine(9, 1) }
}
watch(scene, applyScene, { immediate: true })

const shop = computed(() => shopInfo(forcedShop(scene.value) || state.shopStatus))
const store = computed(() => storeOf())
const valid = computed(() => cart.lines.filter((l) => lineState(l).ok))
const invalid = computed(() => cart.lines.filter((l) => !lineState(l).ok))
const picked = computed(() => valid.value.filter((l) => l.selected !== false))
const q = computed(() => quoteOf(picked.value))
const problems = computed(() => Object.fromEntries(ruleProblems(picked.value).map((x) => [x.key, x])))
const checked = computed({
  get: () => picked.value.map((l) => l.key),
  set: (keys) => valid.value.forEach((l) => { l.selected = keys.includes(l.key) }),
})
const allChecked = computed({
  get: () => valid.value.length > 0 && picked.value.length === valid.value.length,
  set: (v) => valid.value.forEach((l) => { l.selected = v }),
})
const hintOf = (l) => {
  const p = problems.value[l.key]; if (p) return p.text
  const max = lineMax(l), pr = productOf(l.pid)
  if (lowOf(l)) return '仅剩 ' + lowOf(l) + ' 件'
  if (pr && l.qty >= max && max > 0) return ruleLeft(pr) !== Infinity && ruleLeft(pr) <= cart.lines.filter((x) => x.pid === l.pid).reduce((s, x) => s + x.qty, 0) ? '已达购买上限' : rulesOf(pr).max && l.qty >= rulesOf(pr).max ? '每单最多 ' + rulesOf(pr).max + ' 件' : ''
  return ''
}
const sub = computed(() => {
  if (!shop.value.canOrder) return store.value.name + shop.value.label + '，' + shop.value.hint
  if (!picked.value.length) return valid.value.length ? '请先选择商品' : ''
  const x = q.value
  return x.coupon ? '已用券减 ' + money(x.discount) : x.next ? '再买 ' + money(x.next.need) + ' 可用' + x.next.name : '到店自取，无配送费'
})

/* 改动先在本地做，再走一次请求；失败时回滚并写出原因 */
const opErr = ref('')
async function mutate(fn) {
  const snap = JSON.parse(JSON.stringify(cart.lines))
  opErr.value = ''
  fn()
  try { await request(60); return true } catch { cart.lines = snap; opErr.value = '网络不太稳定，刚才的修改没有成功，购物车保持原样，请稍后再试'; return false }
}
const undo = ref(null)
let undoTimer = 0
async function remove(l) {
  const snap = JSON.parse(JSON.stringify(cart.lines))
  if (await mutate(() => setQty(l.key, 0))) {
    undo.value = { snap, text: '已移除「' + l.name + '」' }
    clearTimeout(undoTimer); undoTimer = setTimeout(() => { undo.value = null }, 5000)
  }
}
const doUndo = () => { if (undo.value) { cart.lines = undo.value.snap; undo.value = null } }
onBeforeUnmount(() => clearTimeout(undoTimer))
const onQty = (l, v) => (v <= 0 ? remove(l) : mutate(() => setQty(l.key, v)))
const onOver = (l, action) => { if (action === 'plus') toast(hintOf(l) || '已达购买上限') }
const fixLine = (key, qty) => mutate(() => setQty(key, qty))
async function clearInvalid() {
  const bad = invalid.value.slice()
  try { await showConfirmDialog({ title: '清除失效商品', message: '清除下架、售罄或库存不足的 ' + bad.length + ' 件商品：' + bad.map((l) => l.name).join('、'), confirmButtonText: '清除', confirmButtonColor: 'var(--luz-danger)', teleport: '#phone-overlay' }) } catch { return }
  if (await mutate(() => bad.forEach((l) => setQty(l.key, 0)))) { toast('已清除失效商品'); if (scene.value === 'invalid') setScene('cart', null) }
}
</script>

<template>
  <div class="mp-page cart">
    <MiniState :status="phase === 'ok' && !cart.lines.length ? 'empty' : phase" empty-text="购物车还是空的，选好的商品会放在这里" @retry="load">
      <template #empty-action><van-button round type="primary" size="small" @click="toTab('menu')">去点单</van-button></template>

      <van-notice-bar v-if="!shop.canOrder" left-icon="clock-o" :text="store.name + shop.label + '，' + shop.hint + '。商品可以先留在购物车，营业后再来结算。'" :scrollable="false" wrapable color="var(--luz-warning)" background="var(--luz-warning-tint)" />
      <van-notice-bar v-if="opErr" left-icon="warning-o" :text="opErr" :scrollable="false" wrapable mode="closeable" color="var(--luz-danger)" background="var(--luz-danger-tint)" @close="opErr = ''" />
      <van-cell-group v-if="undo" inset>
        <van-cell :title="undo.text" center role="status"><template #right-icon><van-button size="small" type="primary" plain @click="doUndo">撤销</van-button></template></van-cell>
      </van-cell-group>

      <van-cell-group v-if="valid.length" inset>
        <van-cell :title="store.name" icon="shop-o" center><template #value><van-tag plain round type="primary">到店自取</van-tag></template></van-cell>
        <van-checkbox-group v-model="checked">
          <div v-for="l in valid" :key="l.key" class="line">
            <van-checkbox :name="l.key" :aria-label="'选择 ' + l.name" />
            <van-card class="grow" :title="l.name" :desc="l.spec || '默认规格'" :thumb="l.img">
              <template #tags>
                <div v-if="hintOf(l)" class="warn">
                  <span>{{ hintOf(l) }}</span>
                  <van-button v-if="problems[l.key]" size="small" type="primary" plain @click="fixLine(problems[l.key].key, problems[l.key].fix.qty)">{{ problems[l.key].fix.label }}</van-button>
                </div>
              </template>
              <template #price><MiniPrice :cents="l.price" :old="origOf(l)" /></template>
              <template #footer>
                <van-stepper :model-value="l.qty" :min="0" :max="lineMax(l)" integer disable-input :name="l.key" :aria-label="l.name + ' 数量'" @change="(v) => onQty(l, v)" @overlimit="(a) => onOver(l, a)" />
              </template>
            </van-card>
          </div>
        </van-checkbox-group>
      </van-cell-group>

      <van-cell-group v-if="invalid.length" inset>
        <van-cell :title="'失效商品 ' + invalid.length + ' 件'" center>
          <template #right-icon><van-button size="small" plain icon="delete-o" @click="clearInvalid">清除失效商品</van-button></template>
        </van-cell>
        <div v-for="l in invalid" :key="l.key" class="line off">
          <van-card class="grow" :title="l.name" :desc="l.spec || '默认规格'" :thumb="l.img">
            <template #tags>
              <div class="warn">
                <van-tag type="danger" plain>{{ lineState(l).text }}</van-tag>
                <van-button v-if="lineState(l).fix" size="small" type="primary" plain @click="fixLine(l.key, lineState(l).fix)">改为 {{ lineState(l).fix }} 件</van-button>
              </div>
            </template>
            <template #price><MiniPrice :cents="l.price" /></template>
            <template #footer><van-button size="small" plain icon="delete-o" @click="remove(l)">移除</van-button></template>
          </van-card>
        </div>
      </van-cell-group>
    </MiniState>

    <van-submit-bar v-if="phase === 'ok' && cart.lines.length" placeholder button-type="primary" :price="q.pay" label="合计：" :button-text="shop.canOrder ? '去结算' + (q.count ? '（' + q.count + '）' : '') : '暂未营业'" :disabled="!shop.canOrder || !picked.length" @submit="go('checkout')">
      <van-checkbox v-model="allChecked" :disabled="!valid.length">全选</van-checkbox>
      <template v-if="sub" #top><div class="sub" role="status">{{ sub }}</div></template>
    </van-submit-bar>
  </div>
</template>

<style scoped>
.cart { --van-card-background: var(--van-background-2); }
.line { display: flex; align-items: center; padding-left: 16px; }
.line.off { padding-left: 0; opacity: .72; }
.line :deep(.van-card) { flex: 1 1 auto; min-width: 0; }
.warn { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--luz-warning); }
.sub { padding: 8px 16px; background: var(--van-background-2); color: var(--luz-ink-2); border-top: 1px solid var(--luz-line); }
</style>
