<script>
// 确认订单（横带分层）：取餐 → 订单摘要 → 优惠券 → 费用 → 支付方式 → 备注 → 底部提交。
// 这个文件的普通脚本块还导出订单与支付的共用动作（生成订单、收银台、落账、查询、关单、迟到支付的退款），支付结果页也用。
import { B } from '../../shared/data.js'
import { state } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, money } from '../../shared/format.js'
import { cart } from '../cart.js'
import { demoNow, stamp, tradeSeed } from './Cart.vue'

export const meta = {
  id: 'checkout', label: '确认订单', title: '确认订单', group: '点单', order: 5,
  layout: '横带分层',
  reason: '结算是一条单向的决策链：先定“在哪取、什么时候取”，再核对“买了什么、优惠多少”，最后选“怎么付”；一条一条从上往下读，实付金额和提交按钮钉在底部拇指区，上面没处理完的问题会拦住提交并给出路',
  scenes: [
    { id: 'rule', label: '商品不满足购买规则（逐条出路）' },
    { id: 'no-coupon', label: '没有可用的优惠券' },
    { id: 'balance-short', label: '储值余额不足（可充值或组合支付）' },
    { id: 'price-change', label: '提交时价格有变化（商家调价）' },
    { id: 'token-expired', label: '报价超过 10 分钟，重新试算' },
    { id: 'stock-out', label: '提交时库存不足（刚被抢光）' },
    { id: 'coupon-gone', label: '提交时优惠券刚失效' },
    { id: 'slot-past', label: '所选取餐时段已过' },
    { id: 'rest', label: '营业状态：休息中' },
    { id: 'closed', label: '营业状态：已打烊' },
    { id: 'paused', label: '营业状态：暂停营业（不能下单）' },
  ],
}

if (B.PAY && !B.PAY.MIX) B.PAY.MIX = '余额加微信'

/* =====================================================================================
   订单与支付的共用动作（读写 state.db：订单、券、余额与流水、消息）
   ===================================================================================== */
const toast = (message, o = {}) => showToast({ message, teleport: '#phone-overlay', ...o })
const trade = () => tradeSeed()._trade
export const closeMinutes = () => (state.db.config.runtime.find((c) => c.key === 'order.unpaid_close_minutes') || {}).value || 30
export const orderByNo = (no) => state.db.orders.find((o) => o.no === no && o.userId === state.db.me.id)
export const mineOrders = () => state.db.orders.filter((o) => o.userId === state.db.me.id && !o.hidden)
export const logOrder = (o, who, text) => { (o.log = o.log || []).push({ at: stamp(), who, text }) }
export const addNotice = (kind, title, body) => { const n = state.db.notices; n.unshift({ id: n.reduce((m, x) => Math.max(m, x.id), 0) + 1, kind, title, body, at: stamp(), read: false }) }
export const walletLog = (kind, amount, ref) => { const db = state.db, me = db.me; db.walletLogs.unshift({ id: db.walletLogs.reduce((m, x) => Math.max(m, x.id), 0) + 1, userId: me.id, userName: me.name, kind, amount, balance: me.balance, at: stamp(), ref }) }
/** 可用的储值余额：页面场景“储值余额不足”时只有 5.20 元 */
export const availBalance = () => (state.scenes.checkout === 'balance-short' ? Math.min(state.db.me.balance, 520) : state.db.me.balance)
export const methodOf = (o) => (o.pay === 'BALANCE' ? 'balance' : o.pay === 'MIX' ? 'mix' : 'wechat')
export const methodName = (m) => ({ wechat: '微信支付', balance: '储值余额', mix: '储值余额 + 微信支付' }[m] || '微信支付')
export const payText = (o) => (o.status === 'UNPAID' ? '待支付' : o.pay === 'MIX' ? '储值余额 + 微信支付' : B.PAY[o.pay] || '微信支付')
export const splitOf = (o) => o.paySplit || (o.pay === 'BALANCE' ? { balance: o.amount } : o.pay === 'CARD' ? { card: o.amount } : { wechat: o.amount })
const nextPickup = () => { const d = trade(); d.pickup += 1; const n = d.pickup % 100; return 'A' + (n < 10 ? '0' + n : n) }

/** 提交订单：锁券、写价格快照；还没付 */
export function createOrder({ lines, store, pickType = 'self', slot = '尽快取餐', remark = '', coupon = null, discount = 0 }) {
  const db = state.db, me = db.me, now = demoNow(), seq = ++trade().seq
  const items = lines.map((l) => ({ pid: l.pid, name: l.name, spec: l.spec, qty: l.qty, price: l.price, img: l.img }))
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0), no = '26' + K.ymd(now).replace(/-/g, '').slice(2) + String(100000 + seq * 137)
  db.orders.unshift({ no, userId: me.id, userName: me.name, items, subtotal, discount, amount: subtotal - discount, pay: 'WECHAT', status: 'UNPAID', createdAt: B.fmt(now), paidAt: '', remark, pickup: '', coupon: coupon ? coupon.name : '',
    couponRef: coupon ? coupon.id : null, storeId: store.id, pickType, slot, deadlineAt: Date.now() + closeMinutes() * 60000, t: {}, log: [] })
  const o = db.orders[0]
  logOrder(o, me.name, '提交订单' + (coupon ? '，使用 ' + coupon.name : ''))
  if (coupon) { const c = db.myCoupons.find((x) => x.id === coupon.id); if (c) { c.state = 'USED'; c.usedOrder = no; c.orderNo = no; c.usedAt = B.fmt(now) } }
  return o
}
/** 把锁在待支付订单上的券放回（已过期的记为已过期） */
export function releaseCoupon(o) {
  const c = o.couponRef && state.db.myCoupons.find((x) => x.id === o.couponRef)
  if (c && c.state === 'USED' && c.usedOrder === o.no) { c.state = c.expire < K.ymd(demoNow()) ? 'EXPIRED' : 'UNUSED'; delete c.usedOrder; delete c.orderNo; delete c.usedAt }
}
/** 关单：timeout 超时自动关闭，user 会员取消（只对待支付） */
export function closeOrder(o, why, reason) {
  if (o.status !== 'UNPAID') return false
  o.status = 'CANCELLED'; (o.t = o.t || {}).cancelled = stamp(); delete o.deadlineAt
  if (why === 'timeout') { o.closeReason = '超时未支付'; logOrder(o, '系统', '超过 ' + closeMinutes() + ' 分钟未支付，订单自动关闭') } else { o.cancelReason = reason || '不想要了'; logOrder(o, state.db.me.name, '取消订单（' + o.cancelReason + '）') }
  releaseCoupon(o); return true
}
/** 迟到支付的全额原路退款：约 13 秒走完 待处理 → 已通过 → 退款中 → 已到账 */
const LATE_STAY = { REVIEW: 4000, APPROVED: 3000, REFUNDING: 6000 }
export function lateRefund(o) {
  const db = state.db, id = db.refunds.reduce((m, x) => Math.max(m, x.id), 0) + 1, at = stamp()
  db.refunds.unshift({ id, no: 'R' + String(2600000 + id * 37), orderNo: o.no, userId: o.userId, userName: o.userName, amount: o.amount, reason: '迟到支付', kind: '仅退款', status: 'PENDING', appliedAt: at, handler: '', note: '', desc: '订单已超时关闭，晚到的支付款自动原路退回',
    by: o.userName, items: o.items.map((it, i) => ({ idx: i, qty: it.qty, amount: it.price * it.qty })), proofs: [], channel: { balance: 0, wechat: o.amount }, stage: 'REVIEW', stageAt: Date.now(), auto: true, via: 'late',
    trail: [{ at, who: '系统', text: '系统发起全额原路退款（迟到支付）' }] })
  return db.refunds[0]
}
export function advanceLate(r) {
  if (!r.auto || r.via !== 'late' || r.status !== 'PENDING') return
  while (LATE_STAY[r.stage] && Date.now() - r.stageAt >= LATE_STAY[r.stage]) {
    const next = { REVIEW: 'APPROVED', APPROVED: 'REFUNDING', REFUNDING: 'DONE' }[r.stage], at = stamp()
    r.stageAt += LATE_STAY[r.stage]; r.stage = next
    if (next === 'APPROVED') { r.handler = '门店'; r.trail.push({ at, who: '门店', text: '系统自动通过' }) }
    if (next === 'REFUNDING') r.trail.push({ at, who: '系统', text: '已向支付渠道发起退款' })
    if (next === 'DONE') { r.status = 'DONE'; r.doneAt = at; r.trail.push({ at, who: '系统', text: '退款到账 ' + money(r.amount) + '，原路退回' }); addNotice('订单', '退款已到账', '订单退款 ' + money(r.amount) + ' 已原路退回。') }
  }
}
/** 到期的待支付订单自动关闭；渠道还在处理中（pending）的先不关，等结果 */
export function sweep() {
  state.db.orders.forEach((o) => { if (o.status === 'UNPAID' && o.deadlineAt && o.deadlineAt <= Date.now() && !(o.attempt && o.attempt.outcome === 'pending')) closeOrder(o, 'timeout') })
  state.db.refunds.forEach(advanceLate)
}
setInterval(() => { try { sweep() } catch { /* 演示数据正在重置 */ } }, 1000)

/** 支付到账（等于收到渠道的支付成功通知）：储值余额部分此时才扣；余额不够返回 nofund */
export function settleOrder(o) {
  const db = state.db, me = db.me, sp = splitOf(o)
  if (o.status !== 'UNPAID') return { ok: o.status !== 'CANCELLED' }
  if ((sp.balance || 0) > me.balance) return { ok: false, reason: 'nofund' }
  if (sp.balance) { me.balance -= sp.balance; walletLog('消费', -sp.balance, '订单 ' + o.no) }
  const t = stamp(); o.status = 'PAID'; o.paidAt = t; (o.t = o.t || {}).making = t; o.pickup = o.pickup || nextPickup(); delete o.deadlineAt
  logOrder(o, '系统', '支付成功 ' + money(o.amount) + '（' + payText(o) + '）'); logOrder(o, '门店', '已接单，开始制作')
  me.orders++; me.spent += o.amount
  addNotice('订单', '订单已支付', '您的订单已支付成功，正在备餐，取餐号 ' + o.pickup + '。')
  return { ok: true }
}
/** 微信收银台示意（真实环境是 wx.requestPayment）→ 'success' | 'cancel' */
export function wxCashier(o, sp) {
  return showConfirmDialog({
    title: '微信支付', message: B.shop.name + '\n支付 ' + money(sp.wechat) + '\n订单 ' + o.no + (sp.balance ? '\n已用储值余额 ' + money(sp.balance) : ''),
    confirmButtonText: '立即支付', cancelButtonText: '取消支付', teleport: '#phone-overlay',
    beforeClose: async (action) => { if (action !== 'confirm') return true; try { await request(500); return true } catch { toast('网络不太稳定，支付没有发起，请稍后再试'); return false } },
  }).then(() => 'success', () => 'cancel')
}
/** 去支付：写支付方式，需要微信的先弹收银台；结果写在 o.attempt，由支付结果页向“服务端”查询后落账 → 'success' | 'cancel' | 'nofund' | 'closed' | 'paid' */
export async function payOrder(o, method) {
  sweep()
  if (o.status === 'CANCELLED') return 'closed'
  if (o.status !== 'UNPAID') return 'paid'
  const bal = availBalance(), amt = o.amount
  const sp = method === 'balance' ? { balance: amt } : method === 'mix' ? { balance: Math.min(bal, amt), wechat: amt - Math.min(bal, amt) } : { wechat: amt }
  o.paySplit = sp; o.pay = method === 'balance' ? 'BALANCE' : method === 'mix' ? 'MIX' : 'WECHAT'; trade().lastPay = method
  let outcome = 'success'
  if (sp.balance > bal) outcome = 'nofund'; else if (sp.wechat) outcome = await wxCashier(o, sp)
  o.attempt = { outcome, at: Date.now() }
  return outcome
}
/** 向“服务端”查支付结果（第 n 次轮询）→ {state:'paid'|'processing'|'failed'|'late'|'closed', reason} */
export function queryOrder(o, n) {
  sweep()
  if (['PAID', 'FULFILLED', 'DONE'].includes(o.status)) return { state: 'paid' }
  if (o.status === 'CANCELLED') return o.late ? { state: 'late' } : { state: 'closed' }
  const a = o.attempt || {}
  if (a.outcome === 'success' || (a.outcome === 'pending' && a.okAfter && n >= a.okAfter)) { const r = settleOrder(o); return r.ok ? { state: 'paid' } : { state: 'failed', reason: r.reason } }
  if (['cancel', 'nofund', 'channel'].includes(a.outcome)) return { state: 'failed', reason: a.outcome }
  return { state: 'processing' }
}
/** 支付结果页的演示订单：按场景造一张待支付单并写好“渠道结果”，迟到支付造一张已超时关闭的单 */
export function demoOrder(kind) {
  const db = state.db, old = ['pending', 'cancel', 'nofund', 'channel'].includes(kind) && db.orders.find((x) => x.demo === kind && x.status === 'UNPAID' && x.userId === db.me.id && x.deadlineAt > Date.now() + 60000)
  if (old) { old.attempt = { outcome: kind, at: Date.now() }; return old }
  const lines = [2, 10].map((pid) => { const p = db.products.find((x) => x.id === pid), spec = (p.specs || []).map((g) => g.opts[0].n).join(' / '); return { pid, name: p.name, spec, price: p.price, qty: 1, img: p.img } })
  const o = createOrder({ lines, store: db.stores.find((s) => s.id === db.curStore) || db.stores[0] }); o.demo = kind
  if (kind === 'late') {
    o.status = 'CANCELLED'; o.closeReason = '超时未支付'; o.t.cancelled = stamp(); o.deadlineAt = 0; logOrder(o, '系统', '超过 ' + closeMinutes() + ' 分钟未支付，订单自动关闭')
    o.late = { amount: o.amount, at: stamp() }; logOrder(o, '系统', '关单后收到支付 ' + money(o.amount) + '，已记为迟到支付并发起全额原路退款'); lateRefund(o)
  } else o.attempt = { outcome: { success: 'success', pending: 'pending', slow: 'pending', cancel: 'cancel', nofund: 'nofund', channel: 'channel' }[kind] || 'success', okAfter: kind === 'slow' ? 3 : 0, at: Date.now() }
  if (kind === 'nofund') { o.pay = 'BALANCE'; o.paySplit = { balance: o.amount } }
  return o
}

// 本页场景造出来的演示条件（库存没了、调价、券失效），离开场景时拿走
const owned = { stock: [], price: [], gone: [] }
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useScene } from '../../shared/state.js'
import { yuan } from '../../shared/format.js'
import { useNav } from '../nav.js'
import { setQty } from '../cart.js'
import { addLine, couponFace, couponWorth, forcedShop, fx, lineState, nowPrice, origOf, productOf, quoteOf, ruleProblems, seedCart, shopInfo, slotsOf, storeOf, storeShopKey, usableCoupons, fmtDist, prepMin } from './Cart.vue'

const { go, back, replace, toTab } = useNav()
const scene = useScene('checkout')
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
load()

const S = reactive({ storeId: state.db.curStore, pick: 'self', slot: 'asap', coupon: undefined, pay: trade().lastPay || 'wechat', remark: '', cutlery: false, agree: false, busy: false, done: false, err: '', note: '', termsErr: false, expand: false })
const tokenAt = ref(Date.now())

/* 场景：规则不满足、报价过期、取餐时段已过；离开场景时拿走演示条件 */
function applyScene(s) {
  seedCart()
  if (s === 'rule' && !cart.lines.some((l) => l.pid === 9 && l.qty === 1)) { const l = cart.lines.find((x) => x.pid === 9); if (l) { l.qty = 1; l.selected = true } else addLine(9, 1) }
  if (s !== 'stock-out') owned.stock.splice(0).forEach((pid) => delete fx.stock[pid])
  if (s !== 'price-change') owned.price.splice(0).forEach((pid) => delete fx.price[pid])
  if (s !== 'coupon-gone') owned.gone.splice(0).forEach((id) => delete fx.gone[id])
  tokenAt.value = s === 'token-expired' ? Date.now() - 601000 : Date.now()
  if (s === 'slot-past') { const p = slotsOf(storeOf(S.storeId)).list.find((x) => x.past); if (p) S.slot = p.label }
}
watch(scene, applyScene, { immediate: true })

const store = computed(() => storeOf(S.storeId))
const forced = computed(() => forcedShop(scene.value))
const global = computed(() => forced.value || state.shopStatus !== 'open')
const st = computed(() => shopInfo(storeShopKey(store.value, { forced: forced.value }), global.value ? B.shop.hours : store.value.hours))
const lines = computed(() => cart.lines.filter((l) => lineState(l).ok && l.selected !== false))
const noCoupon = computed(() => scene.value === 'no-coupon')
const q = computed(() => quoteOf(lines.value, noCoupon.value ? null : S.coupon))
const issues = computed(() => ruleProblems(lines.value))
watch(q, (x) => { if (S.coupon != null && !x.coupon) S.coupon = undefined })

/* 价格有没有变：购物车里的单价和商品现在的价格比，变了就更新购物车并返回变化列表 */
function syncPrices(list) {
  const ch = []
  list.forEach((l) => { const now = nowPrice(l); if (now !== l.price) { ch.push({ name: l.name, from: l.price, to: now }); l.price = now } })
  return ch
}
const changeText = (ch) => '价格有变化，已更新：' + ch.map((c) => c.name + ' ' + money(c.from) + ' → ' + money(c.to)).join('；')
{ const first = syncPrices(lines.value); if (first.length) S.note = changeText(first) }

/* 取餐 */
const slotText = computed(() => (S.slot === 'asap' ? '尽快取餐' : S.slot))
const slotHint = computed(() => (!st.value.canOrder ? '营业后可选' : slotPast.value ? '所选时段已过，请重新选择' : S.slot === 'asap' ? '约 ' + slotsOf(store.value).asap + ' 可取，出餐约 ' + prepMin(store.value) + ' 分钟' : ''))
const slotPast = computed(() => S.slot !== 'asap' && (slotsOf(store.value).list.find((x) => x.label === S.slot) || { past: true }).past)
const storeLabel = computed(() => fmtDist(store.value.dist) + (st.value.canOrder ? (store.value.queue ? ' · 前方 ' + store.value.queue + ' 单制作中' : ' · 现在下单马上做') : ' · ' + st.value.hint))
const showStores = ref(false)
const storeActions = computed(() => state.db.stores.map((s) => { const info = shopInfo(storeShopKey(s, { forced: forced.value }), global.value ? B.shop.hours : s.hours); return { id: s.id, name: s.name, subname: fmtDist(s.dist) + ' · ' + (info.canOrder ? (s.queue ? '前方 ' + s.queue + ' 单' : '现在下单马上做') : info.label + '，' + info.hint), disabled: !info.canOrder, color: s.id === S.storeId ? 'var(--luz-action)' : undefined } }))
function pickStore(a) { showStores.value = false; if (a.id !== S.storeId) { S.storeId = a.id; state.db.curStore = a.id; S.slot = 'asap'; toast('已换到 ' + a.name) } }
const showSlots = ref(false)
const slotCols = computed(() => { const sl = slotsOf(store.value); return [{ text: '尽快取餐（约 ' + sl.asap + ' 可取，出餐约 ' + prepMin(store.value) + ' 分钟）', value: 'asap' }, ...sl.list.filter((x) => !x.past).map((x) => ({ text: x.label, value: x.label }))] })
const slotVal = ref(['asap'])
function openSlot() { if (!st.value.canOrder) return; slotVal.value = [slotCols.value.some((c) => c.value === S.slot) ? S.slot : 'asap']; showSlots.value = true }
function confirmSlot({ selectedValues }) { S.slot = selectedValues[0]; showSlots.value = false }

/* 订单摘要 */
const shown = computed(() => (lines.value.length > 3 && !S.expand ? lines.value.slice(0, 3) : lines.value))

/* 优惠券：用库里的优惠券列表（可用、不可用分栏，带“不使用优惠”） */
const showCoupons = ref(false)
const couponRows = computed(() => {
  if (noCoupon.value) return []
  const sub = quoteOf(lines.value, null).subtotal
  return usableCoupons().map((c) => { const ok = sub >= c.threshold && sub > 0; return { c, ok, d: ok ? Math.min(sub, couponWorth(c, sub)) : 0, need: ok ? 0 : c.threshold - sub } }).sort((a, b) => b.d - a.d || a.need - b.need)
})
const toFace = (r) => ({ id: r.c.id, name: r.c.name, condition: r.c.threshold ? '满 ' + yuan(r.c.threshold) + ' 元可用' : '无门槛', reason: r.ok ? '' : '还差 ' + money(r.need) + ' 可用', value: r.c.value, valueDesc: r.c.kind === '折扣' ? String(r.c.value / 10) : String(r.c.value / 100), unitDesc: r.c.kind === '折扣' ? '折' : '元',
  startAt: Math.floor(demoNow().getTime() / 1000), endAt: Math.floor(new Date(r.c.expire + 'T23:59:59').getTime() / 1000), description: r.ok ? '本单可抵 ' + money(r.d) : '' })
const faceUsable = computed(() => couponRows.value.filter((r) => r.ok).map(toFace))
const faceOff = computed(() => couponRows.value.filter((r) => !r.ok).map(toFace))
const chosen = computed(() => (q.value.coupon ? faceUsable.value.findIndex((c) => c.id === q.value.coupon.id) : -1))
const usableCount = computed(() => couponRows.value.filter((r) => r.ok).length)
function onCoupon(i) { S.coupon = i < 0 ? null : faceUsable.value[i].id; showCoupons.value = false }

/* 支付方式 */
const bal = computed(() => availBalance())
const payOk = computed(() => ({ wechat: true, balance: bal.value >= q.value.pay && q.value.pay > 0, mix: bal.value > 0 && bal.value < q.value.pay }))
watch(payOk, (o) => { if (!o[S.pay]) S.pay = 'wechat' }, { immediate: true })
const pickPay = (k) => { if (payOk.value[k]) S.pay = k }

/* 备注 */
const TAGS = ['不要香菜', '少盐', '少辣', '不要葱']
const hasTag = (t) => S.remark.includes(t)
function toggleTag(t) {
  if (hasTag(t)) S.remark = S.remark.replace(t, '').replace(/^[，、\s]+|[，、\s]+$/g, '')
  else if (S.remark.length + t.length < 195) S.remark = (S.remark ? S.remark + '，' : '') + t
}
const showTerms = ref(false)

/* 提交：重复点击保护 → 校验（营业、库存、规则、价格、券、时段、余额）→ 生成订单 → 支付 → 结果页 */
const issueEl = ref(null), noteEl = ref(null), termEl = ref(null)
const look = (el) => nextTick(() => el.value?.scrollIntoView({ block: 'center', behavior: state.reducedMotion ? 'auto' : 'smooth' }))
const fail = (text) => { S.busy = false; S.err = text }
let stockOnce = false, priceOnce = false, goneOnce = false
async function submit() {
  if (S.busy || S.done) return
  if (!st.value.canOrder) return
  if (issues.value.length) { look(issueEl); return }
  if (!S.agree) { S.termsErr = true; look(termEl); return }
  S.busy = true; S.err = ''
  try { await request(500) } catch { return fail('网络不太稳定，订单没有提交。请检查网络后再点一次，不会重复下单') }
  if (!st.value.canOrder) return fail(store.value.name + st.value.label + '，暂时不能下单')
  /* 库存：提交时才发现被抢光，已从本单移除 */
  const before = lines.value.slice()
  if (scene.value === 'stock-out' && !stockOnce && before.length) { stockOnce = true; fx.stock[before[0].pid] = 0; owned.stock.push(before[0].pid) }
  const gone = before.filter((l) => !lineState(l).ok)
  if (gone.length) return fail('「' + gone[0].name + '」刚刚售罄，已从本单移除，请核对后再提交')
  /* 价格：商家调价，或报价超过 10 分钟 */
  if (scene.value === 'price-change' && !priceOnce && lines.value.length) { priceOnce = true; fx.price[lines.value[0].pid] = 200; owned.price.push(lines.value[0].pid) }
  const ch = syncPrices(lines.value)
  if (ch.length || Date.now() - tokenAt.value > 600000) {
    tokenAt.value = Date.now(); S.busy = false
    S.note = ch.length ? changeText(ch) + '。请确认后再提交' : '报价已过期，已重新试算：金额没有变化，请再点一次提交'
    return look(noteEl)
  }
  /* 券：提交时才发现失效，按当前可用的券重新计价，请用户确认 */
  if (scene.value === 'coupon-gone' && !goneOnce && q.value.coupon) {
    goneOnce = true; const c = q.value.coupon; fx.gone[c.id] = true; owned.gone.push(c.id); S.coupon = undefined; S.busy = false
    S.note = '优惠券「' + c.name + '」已失效：本单已按当前可用的券重新计价，请确认后再提交'
    return look(noteEl)
  }
  /* 取餐时段 */
  if (slotPast.value) { S.slot = 'asap'; return fail('所选取餐时段已过，已改为尽快取餐，请确认后再提交') }
  const x = q.value, method = x.pay === 0 ? 'none' : S.pay
  if (method === 'balance' && availBalance() < x.pay) return fail('储值余额不足，请改用微信支付或先去充值')
  const o = createOrder({ lines: lines.value, store: store.value, pickType: S.pick, slot: S.slot === 'asap' ? '尽快取餐' : S.slot, remark: [S.remark, S.cutlery ? '需要餐具' : ''].filter(Boolean).join('；'), coupon: x.coupon, discount: x.discount })
  S.done = true
  lines.value.slice().forEach((l) => setQty(l.key, 0))
  if (method === 'none') { o.paySplit = {}; settleOrder(o) } else await payOrder(o, method)
  replace('pay-result', { no: o.no, s: state.scenes['pay-result'] || 'normal' })
}
onBeforeUnmount(() => { S.busy = false })
const fixIssue = (x) => setQty(x.key, x.fix.qty)
const buttonText = computed(() => (!st.value.canOrder ? '暂未营业' : issues.value.length ? '待处理 ' + issues.value.length + ' 项' : q.value.pay === 0 ? '提交订单' : S.pay === 'balance' ? '余额支付' : S.pay === 'mix' ? '组合支付' : '微信支付'))
const barSub = computed(() => (!st.value.canOrder ? store.value.name + st.value.label + '，' + st.value.hint : q.value.saved + q.value.discount > 0 ? '已优惠 ' + money(q.value.saved + q.value.discount) : '到店自取，无配送费'))
</script>

<template>
  <div class="mp-page checkout">
    <MiniState :status="state.role === 'guest' ? 'forbidden' : S.done ? 'loading' : phase === 'ok' && !lines.length ? 'empty' : phase" :empty-text="cart.lines.length ? '还没有选中要结算的商品，先去购物车勾选' : '购物车是空的，选好商品后再来结算'" @retry="load">
      <template #empty-action><van-button round type="primary" size="small" @click="cart.lines.length ? back() : toTab('menu')">{{ cart.lines.length ? '回购物车' : '去选购' }}</van-button></template>
      <template #forbidden-action><van-button round type="primary" size="small" @click="go('login', { redirect: 'back' })">去登录</van-button></template>

      <van-notice-bar v-if="!st.canOrder" left-icon="clock-o" :text="store.name + st.label + '，' + st.hint + '。商品可以先留在购物车，营业后再来结算。'" :scrollable="false" wrapable color="var(--luz-warning)" background="var(--luz-warning-tint)" />
      <div ref="noteEl"><van-notice-bar v-if="S.note" left-icon="info-o" :text="S.note" :scrollable="false" wrapable mode="closeable" @close="S.note = ''" /></div>

      <div ref="issueEl">
        <van-cell-group v-if="issues.length" inset :title="'有 ' + issues.length + ' 项需要先处理，处理完才能提交'" role="alert">
          <van-cell v-for="x in issues" :key="x.key + x.text" :title="x.text" center>
            <template #right-icon><van-button size="small" type="primary" plain @click="fixIssue(x)">{{ x.fix.label }}</van-button></template>
          </van-cell>
        </van-cell-group>
      </div>

      <van-cell-group inset title="取餐">
        <van-cell title="取餐方式" center>
          <template #value><van-radio-group v-model="S.pick" direction="horizontal"><van-radio name="self">到店自取</van-radio><van-radio name="dine">堂食</van-radio></van-radio-group></template>
        </van-cell>
        <van-cell :title="store.name" :label="storeLabel" icon="shop-o" is-link center @click="showStores = true">
          <template #value><van-tag round :type="st.tag">{{ st.label }}</van-tag></template>
        </van-cell>
        <van-cell :title="S.pick === 'dine' ? '到店用餐时间' : '取餐时间'" :label="slotHint" icon="clock-o" is-link center :clickable="st.canOrder" @click="openSlot">
          <template #value><span :class="{ past: slotPast }">{{ st.canOrder ? slotText : '—' }}</span></template>
        </van-cell>
      </van-cell-group>

      <van-cell-group inset :title="'订单摘要 · 共 ' + q.count + ' 件'">
        <van-card v-for="l in shown" :key="l.key" :num="l.qty" :title="l.name" :desc="l.spec || '默认规格'" :thumb="l.img">
          <template #price><MiniPrice :cents="l.price" :old="origOf(l)" /></template>
        </van-card>
        <van-cell v-if="lines.length > 3" :title="S.expand ? '收起' : '展开全部 ' + lines.length + ' 种商品'" is-link @click="S.expand = !S.expand" />
        <van-cell title="返回修改商品" is-link @click="back()" />
      </van-cell-group>

      <van-cell-group inset title="优惠券">
        <van-cell :title="q.coupon ? q.coupon.name : '优惠券'" :label="q.coupon ? (S.coupon === undefined ? '已自动选择最优券' : '已选择') : couponRows.length ? (usableCount ? '不使用优惠券' : '有 ' + couponRows.length + ' 张券，还差一点才能用') : '暂无可用优惠券'" icon="coupon-o" :is-link="!!couponRows.length" center :clickable="!!couponRows.length" @click="couponRows.length && (showCoupons = true)">
          <template #value><span v-if="q.coupon" class="minus num">-{{ money(q.discount) }}</span><van-tag v-else-if="usableCount" type="danger" plain>{{ usableCount }} 张可用</van-tag></template>
        </van-cell>
        <van-cell v-if="q.next && !noCoupon" icon="gift-o" :title="'再买 ' + money(q.next.need) + ' 可用「' + q.next.name + '」，立减 ' + money(q.next.value)" value="去凑单" is-link center @click="toTab('menu')" />
      </van-cell-group>

      <van-cell-group inset title="费用明细">
        <van-cell title="商品金额" :value="money(q.subtotal)" value-class="num" />
        <van-cell v-if="q.saved > 0" title="较划线价已省" :value="money(q.saved)" value-class="num" />
        <van-cell v-if="q.coupon" :title="'优惠券（' + q.coupon.name + '）'" :value="'-' + money(q.discount)" value-class="num minus" />
        <van-cell title="合计" label="到店自取，无配送费、无包装费"><template #value><span class="sum num">{{ money(q.pay) }}</span></template></van-cell>
      </van-cell-group>

      <van-cell-group inset title="支付方式">
        <van-cell v-if="q.pay === 0" title="本单优惠后为 0 元" label="提交即成交，不需要支付" />
        <van-radio-group v-else v-model="S.pay">
          <van-cell title="微信支付" :label="'推荐，支付 ' + money(q.pay)" icon="wechat-pay" clickable center @click="pickPay('wechat')"><template #right-icon><van-radio name="wechat" /></template></van-cell>
          <van-cell title="储值余额" icon="balance-o" clickable center :class="{ off: !payOk.balance }" @click="pickPay('balance')">
            <template #label><span :class="{ short: bal < q.pay }">{{ bal < q.pay ? '余额 ' + money(bal) + '，还差 ' + money(q.pay - bal) : '余额 ' + money(bal) + '，支付后剩 ' + money(bal - q.pay) }}</span></template>
            <template #right-icon><van-button v-if="bal < q.pay" size="small" type="primary" plain @click.stop="go('wallet')">去充值</van-button><van-radio name="balance" :disabled="!payOk.balance" /></template>
          </van-cell>
          <van-cell v-if="payOk.mix" title="储值余额 + 微信支付" :label="'余额抵扣 ' + money(bal) + '，再微信支付 ' + money(q.pay - bal) + '；取消订单时按原路分别退回'" icon="cash-o" clickable center @click="pickPay('mix')"><template #right-icon><van-radio name="mix" /></template></van-cell>
        </van-radio-group>
      </van-cell-group>

      <van-cell-group inset title="备注">
        <van-field v-model="S.remark" label="口味与要求" label-align="top" type="textarea" rows="2" autosize maxlength="200" show-word-limit placeholder="口味、忌口等要求，门店会尽量满足" />
        <div class="chips"><van-button v-for="t in TAGS" :key="t" size="small" round :type="hasTag(t) ? 'primary' : 'default'" :plain="!hasTag(t)" @click="toggleTag(t)">{{ t }}</van-button></div>
        <van-cell title="需要餐具" label="默认不提供，减少浪费" center><template #right-icon><van-switch v-model="S.cutlery" size="22px" aria-label="需要餐具" /></template></van-cell>
      </van-cell-group>

      <div ref="termEl" class="terms">
        <div class="terms-row"><van-checkbox v-model="S.agree" @update:model-value="S.termsErr = false">我已阅读并同意</van-checkbox><van-button type="primary" plain size="small" class="link" @click="showTerms = true">《购买须知》</van-button></div>
        <p v-if="S.termsErr" class="err" role="alert">请先阅读并同意《购买须知》，再提交订单</p>
      </div>
    </MiniState>

    <van-submit-bar v-if="phase === 'ok' && lines.length && state.role !== 'guest'" placeholder button-type="primary" :price="q.pay" label="实付：" :button-text="buttonText" :loading="S.busy" :disabled="S.busy || !st.canOrder || issues.length > 0" :tip="S.err" tip-icon="warning-o" @submit="submit">
      <template #top><div class="sub" role="status">{{ barSub }}</div></template>
    </van-submit-bar>

    <van-action-sheet v-model:show="showStores" :actions="storeActions" title="选择取餐门店" cancel-text="取消" close-on-click-action @select="pickStore" />
    <van-popup v-model:show="showSlots" position="bottom" round>
      <van-picker v-model="slotVal" :columns="slotCols" :title="S.pick === 'dine' ? '选择到店用餐时间' : '选择取餐时间'" confirm-button-text="确定" cancel-button-text="取消" @confirm="confirmSlot" @cancel="showSlots = false" />
    </van-popup>
    <van-popup v-model:show="showCoupons" position="bottom" round :style="{ height: '78%' }">
      <van-coupon-list :coupons="faceUsable" :disabled-coupons="faceOff" :chosen-coupon="chosen" :show-exchange-bar="false" close-button-text="不使用优惠券" enabled-title="可用优惠" disabled-title="不可用优惠" @change="onCoupon" />
    </van-popup>
    <van-dialog v-model:show="showTerms" title="购买须知" confirm-button-text="知道了" class="terms-dialog">
      <div class="prose">
        <p>1. 餐品现点现做，出餐后不支持无理由退换；餐品有问题请在收到后 7 天内申请售后。</p>
        <p>2. 待支付订单为你保留 {{ closeMinutes() }} 分钟，超时自动关闭，已用的优惠券会退回。</p>
        <p>3. 到店取餐请出示取餐码，逾时未取的餐品由门店处理，不另行退款。</p>
        <p>4. 已支付订单取消后，款项原路退回：微信支付 1–3 个工作日，储值余额即时。</p>
      </div>
    </van-dialog>
  </div>
</template>

<style scoped>
.checkout { --van-card-background: var(--van-background-2); }
.minus { color: var(--luz-price); font-weight: 600; }
.sum { color: var(--luz-ink); font-size: var(--t16); font-weight: 600; }
.past { color: var(--luz-danger); }
.short { color: var(--luz-danger); }
.off :deep(.van-cell__title) { color: var(--luz-ink-2); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 12px; }
.terms { padding: 0 4px; }
.terms-row { display: flex; align-items: center; flex-wrap: wrap; gap: 0; font-size: var(--t16); }
.link { --van-button-border-width: 0; --van-button-plain-background: transparent; padding: 0 4px; }
.err { margin: 4px 0 0; color: var(--luz-danger); }
.sub { padding: 8px 16px; background: var(--van-background-2); color: var(--luz-ink-2); border-top: 1px solid var(--luz-line); }
.prose { padding: 8px 20px 16px; text-align: left; color: var(--luz-ink-2); }
.prose p { margin: 0 0 8px; }
</style>
