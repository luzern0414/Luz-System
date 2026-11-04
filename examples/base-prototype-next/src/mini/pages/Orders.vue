<script>
// The member's order list (tab page). The four pages orders / order-detail / refund-apply / review share one order and after-sales
// state machine; it lives in `kit` below and the other three pages import it from this file (CONVENTIONS §6 does not allow a new
// shared file, so a later clean-up can move the `kit` block to src/mini/order-kit.js unchanged).
import { B } from '../../shared/data.js'
import { state } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, money } from '../../shared/format.js'
import { addToCart } from '../cart.js'

export const meta = {
  id: 'orders', label: '订单', title: '我的订单', group: '订单', tab: true, order: 1,
  layout: '横带分层',
  reason: '订单列表的价值是“有哪些事要办”：顶上一条分段带数量，下面每张订单卡自上而下是门店与状态、商品缩略图、实付与进度、按状态给的操作；要办的（待支付、待取餐）排最前，已取消和已退款排最后',
  scenes: [{ id: 'expiring', label: '待支付订单快到期（还剩 8 秒）' }, { id: 'refresh-fail', label: '刷新失败：网络异常' }, { id: 'more-fail', label: '加载更多失败（点重试后成功）' }],
}

/* ==========================================================================================================================
   kit: the order and after-sales state machine of the member side. Reads and writes state.db only (orders, refunds, myCoupons,
   me.balance and walletLogs, notices), and keeps the admin side's states: UNPAID -> PAID -> FULFILLED -> DONE, UNPAID/PAID -> CANCELLED,
   PAID/FULFILLED/DONE -> REFUNDING -> REFUNDED; a refund is PENDING -> DONE or REJECTED (APPROVED when the channel did not take it).
   Fields the member side adds to an order are all optional: deadlineAt, t, log, paySplit, actDiscount, couponRef, pickType, slot,
   cancelReason, closeReason, late, prev, reviewed, review, hidden. Money is cents everywhere.
   ========================================================================================================================== */
const T0 = Date.now()
const now = () => new Date(B.NOW().getTime() + (Date.now() - T0))          // the demo clock starts at 10:30 and runs on
const stamp = () => B.fmt(now())
const parse = (s) => new Date(String(s).replace(' ', 'T') + ':00')
const hm = (s) => (s || '').slice(11, 16)
const when = (s) => {
  if (!s) return ''
  const d = s.slice(0, 10), n = now()
  return d === K.ymd(n) ? '今天 ' + s.slice(11, 16) : d === K.ymd(K.addDays(n, -1)) ? '昨天 ' + s.slice(11, 16) : s.slice(5, 16)
}
const me = () => state.db.me
const mins = (n) => n * 60000
/** a toast inside the phone frame (function-style popups are teleported to the shell's overlay root) */
const toast = (message, type, duration) => showToast({ message, type, duration, teleport: '#phone-overlay' })
/** the grey tag of the library reads 2.9:1 on white; the secondary ink colour reads 5.9:1 */
const tagColor = (t) => (!t || t === 'default' ? 'var(--luz-ink-2)' : undefined)
const uniq = (list) => [...new Set(list)]

/* ---- which state an order is in, as the member sees it ---- */
const KIND = { UNPAID: 'unpaid', PAID: 'making', FULFILLED: 'ready', DONE: 'done', REFUNDING: 'refunding', REFUNDED: 'refunded' }
const kind = (o) => (o.status === 'CANCELLED' ? (o.closeReason ? 'closed' : 'cancelled') : KIND[o.status])
const WORD = { making: '制作中', ready: '待取餐', closed: '已关闭' }                  // wording that differs from B.ORDER_STATUS for the member
const TONE = { unpaid: 'warning', making: 'primary', ready: 'success', done: 'default', cancelled: 'default', closed: 'default', refunding: 'warning', refunded: 'default' }
const label = (o) => WORD[kind(o)] || B.ORDER_STATUS[o.status]
const SEG = [['all', '全部'], ['unpaid', B.ORDER_STATUS.UNPAID], ['pickup', '待取餐'], ['done', B.ORDER_STATUS.DONE], ['after', '退款与售后']]
const RANK = { unpaid: 0, ready: 1, making: 1, refunding: 2, done: 3, refunded: 4, cancelled: 5, closed: 5 }
const refundsOf = (o) => state.db.refunds.filter((r) => r.orderNo === o.no)
const inSeg = (o, seg) => seg === 'all' || (seg === 'unpaid' && o.status === 'UNPAID') || (seg === 'pickup' && (o.status === 'PAID' || o.status === 'FULFILLED')) || (seg === 'done' && o.status === 'DONE')
  || (seg === 'after' && (o.status === 'REFUNDING' || o.status === 'REFUNDED' || refundsOf(o).length > 0))
/** my orders: the ones I did not delete, what needs doing first, ended orders last, newest first inside a rank */
const mine = () => state.db.orders.filter((o) => o.userId === me().id && !o.hidden)
  .sort((a, b) => RANK[kind(a)] - RANK[kind(b)] || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
const byNo = (no) => state.db.orders.find((o) => o.no === no && o.userId === me().id)
const count = (o) => o.items.reduce((s, i) => s + i.qty, 0)
const code = (o) => { let n = 0; for (const c of o.no) n = (n * 31 + c.charCodeAt(0)) >>> 0; const s = String(10000000 + ((n * 7919 + 4096) % 90000000)); return s.slice(0, 4) + ' ' + s.slice(4, 8) }

/* ---- times (the same derivation as the admin order page, so both ends show the same minute) ---- */
const times = (o) => {
  const t = o.t || {}, n = +o.no.slice(-3) || 0, end = now().getTime(), base = parse(o.paidAt || o.createdAt).getTime(), s = o.status
  const at = (m) => B.fmt(new Date(Math.min(end, base + mins(m))))
  return {
    created: o.createdAt, paid: o.paidAt || '', making: t.making || o.paidAt || '',
    ready: t.fulfilled || (s === 'FULFILLED' || s === 'DONE' ? at(9 + (n % 6)) : ''),
    done: t.done || (s === 'DONE' ? at(16 + (n % 9)) : ''),
    cancelled: t.cancelled || (s === 'CANCELLED' ? (o.paidAt ? at(4 + (n % 5)) : B.fmt(new Date(Math.min(end, parse(o.createdAt).getTime() + mins(30))))) : ''),
    refunding: t.refunding || (s === 'REFUNDING' || s === 'REFUNDED' ? at(60 + (n % 40)) : ''),
    refunded: t.refunded || (s === 'REFUNDED' ? at(120 + (n % 60)) : ''),
  }
}
/** the steps of the progress: [{label, at, state: done | now | todo | bad}]; steps that never happened in an ended order are left out */
const timeline = (o) => {
  const t = times(o), k = kind(o), L = [], add = (text, at, st) => L.push({ label: text, at: at || '', state: st })
  add('已下单', t.created, 'done')
  if (k === 'unpaid') { add('待支付', '', 'now'); add('制作中', '', 'todo'); add('待取餐', '', 'todo'); add('已完成', '', 'todo'); return L }
  if (t.paid) add('已支付', t.paid, 'done')
  if (k === 'cancelled' || k === 'closed') { add(k === 'closed' ? '已关闭' : '已取消', t.cancelled, 'bad'); if (o.late) add('迟到支付，款项退回', o.late.at, 'done'); return L }
  const rf = k === 'refunding' || k === 'refunded'
  if (!rf || t.ready || t.done) add('制作中', t.making, k === 'making' ? 'now' : 'done')
  if (!rf || t.ready || t.done) add('待取餐', t.ready, k === 'ready' ? 'now' : k === 'making' ? 'todo' : 'done')
  if (!rf || t.done) add('已完成', t.done, k === 'done' ? 'done' : k === 'making' || k === 'ready' ? 'todo' : 'done')
  if (rf) { add('退款中', t.refunding, k === 'refunding' ? 'now' : 'done'); if (k === 'refunded') add('已退款', t.refunded, 'done') }
  return L
}
/** money split: subtotal, activity and coupon discounts, then how it was paid; the parts add up to the amount paid */
const split = (o) => {
  const act = o.actDiscount || 0, coupon = Math.max(0, (o.discount || 0) - act)
  const p = o.paySplit || (o.pay === 'BALANCE' ? { balance: o.amount } : o.pay === 'CARD' ? { card: o.amount } : { wechat: o.amount })
  return { subtotal: o.subtotal, act, coupon, balance: p.balance || 0, wechat: p.wechat || 0, card: p.card || 0, amount: o.amount }
}
const payText = (o) => {
  if (o.status === 'UNPAID') return '待支付'
  if (!o.paidAt && !o.late) return '未支付'
  const sp = split(o)
  return [sp.balance && '储值余额', sp.wechat && '微信支付', sp.card && '会员卡抵扣'].filter(Boolean).join(' + ') || B.PAY[o.pay] || '微信支付'
}

/* ---- records written to the shared data: log, wallet flow, messages ---- */
const t_ = (o) => (o.t = o.t || {})
const log = (o, who, text) => { (o.log = o.log || []).push({ at: stamp(), who, text }) }
const walletLog = (k, amount, ref) => { const db = state.db; db.walletLogs.unshift({ id: db.walletLogs.reduce((m, x) => Math.max(m, x.id), 0) + 1, userId: me().id, userName: me().name, kind: k, amount, balance: me().balance, at: stamp(), ref }) }
const notice = (k, title, body) => { const n = state.db.notices; n.unshift({ id: n.reduce((m, x) => Math.max(m, x.id), 0) + 1, kind: k, title, body, at: stamp(), read: false }) }
let pickSeq = 30
const nextPickup = () => { pickSeq += 1; const n = pickSeq % 100; return 'A' + (n < 10 ? '0' + n : n) }
const closeMin = () => Number((state.db.config.runtime.find((c) => c.key === 'order.unpaid_close_minutes') || {}).value) || 30

/* ---- closing, paying ---- */
const releaseCoupon = (o) => {
  const c = o.couponRef && state.db.myCoupons.find((x) => x.id === o.couponRef)
  if (c && c.state === 'USED') { c.state = c.expire < K.ymd(now()) ? 'EXPIRED' : 'UNUSED'; delete c.usedOrder; delete c.orderNo; delete c.usedAt }
}
/** closes an unpaid order: 'timeout' by the system, otherwise by the member; the coupon locked on it comes back */
const close = (o, why, reason) => {
  if (o.status !== 'UNPAID') return false
  o.status = 'CANCELLED'; t_(o).cancelled = stamp(); delete o.deadlineAt
  if (why === 'timeout') { o.closeReason = '超时未支付'; log(o, '系统', '超过 ' + closeMin() + ' 分钟未支付，订单自动关闭') } else { o.cancelReason = reason || '不想要了'; log(o, me().name, '取消订单（' + o.cancelReason + '）') }
  releaseCoupon(o); return true
}
/** a pass over the data: unpaid orders get their deadline and are closed when it is over; refunds the member made move along */
const sweep = () => {
  state.db.orders.forEach((o) => {
    if (o.status !== 'UNPAID') return
    if (!o.deadlineAt && o.userId === me().id) o.deadlineAt = Date.now() + mins(24)
    if (o.deadlineAt && o.deadlineAt <= Date.now() && !(o.attempt && o.attempt.outcome === 'pending')) close(o, 'timeout')
  })
  state.db.refunds.forEach((r) => { if (r.auto) advance(r) })
}
/** the payment arrived: the stored-value part is taken now (never below zero), the order goes to 待履约 with a pickup number */
const settle = (o) => {
  const m = me(), sp = o.paySplit || split(o)
  if (o.status !== 'UNPAID') return { ok: o.status !== 'CANCELLED' }
  if ((sp.balance || 0) > m.balance) return { ok: false, reason: 'nofund' }
  if (sp.balance) { m.balance -= sp.balance; walletLog('消费', -sp.balance, '订单 ' + o.no) }
  const at = stamp(); o.status = 'PAID'; o.paidAt = at; t_(o).making = at; o.pickup = o.pickup || nextPickup(); delete o.deadlineAt
  log(o, '系统', '支付成功 ' + money(o.amount) + '（' + payText(o) + '）'); log(o, '门店', '已接单，开始制作')
  m.orders++; m.spent += o.amount
  notice('订单', '订单已支付', '您的订单已支付成功，正在备餐，取餐号 ' + o.pickup + '。')
  return { ok: true }
}
/** pay an unpaid order with 'wechat', 'balance' or 'mix' (the stored value first, the rest by WeChat) */
const payWith = (o, method) => {
  const bal = me().balance, a = o.amount
  const sp = method === 'balance' ? { balance: a } : method === 'mix' ? { balance: Math.min(bal, a), wechat: a - Math.min(bal, a) } : { wechat: a }
  if ((sp.balance || 0) > bal) return { ok: false, reason: 'nofund' }
  o.paySplit = sp; o.pay = sp.wechat ? 'WECHAT' : 'BALANCE'; o.attempt = { outcome: 'success', at: Date.now() }
  return settle(o)
}
const REASONS = ['不想要了', '点错了', '想换门店', '想改取餐时间', '信息填错了', '其他']
/** channel of a refund: the stored-value part goes back at once, the rest the way it came */
const channelOf = (o, cents) => { const sp = split(o), tot = sp.balance + sp.wechat + sp.card || 1, b = Math.round((cents * sp.balance) / tot); return { balance: b, wechat: cents - b } }
const channelText = (ch) => [ch.balance ? '储值余额 ' + money(ch.balance) + '（即时回钱包）' : '', ch.wechat ? '原支付渠道 ' + money(ch.wechat) + '（原路退回，1–3 个工作日）' : ''].filter(Boolean).join('；')
/** cancel an order: unpaid ones close, paid ones that are not made yet go through a full refund. Throws with the reason a person can read. */
const cancelOrder = async (o, { reason, other = '', wasPaid = false, scene = '' }) => {
  sweep()
  if (o.status === 'CANCELLED') return { ok: false, message: '订单已经关闭了' }
  try { await request(450, { fail: scene === 'cancel-fail' ? new Error('offline') : null }) } catch (e) { throw new Error('网络不太稳定，订单没有取消，请稍后再试。没有取消的订单会继续为你保留') }
  sweep()
  if (scene === 'cancel-paid' && o.status === 'UNPAID') { o.paySplit = { wechat: o.amount }; settle(o) }
  if (o.status === 'CANCELLED') return { ok: false, message: '订单已超时关闭，无需再取消' }
  if (!wasPaid && o.status !== 'UNPAID') return { ok: false, message: '订单刚刚已经支付成功，不能直接取消。可在订单里申请退款' }
  if (wasPaid && o.status !== 'PAID') return { ok: false, message: '门店刚刚已经出餐，不能再取消。可以申请退款' }
  const why = reason === '其他' ? '其他：' + other.trim() : reason
  if (wasPaid) { cancelPaid(o, why); return { ok: true, message: '已提交取消，' + money(o.amount) + ' 将原路退回' } }
  close(o, 'user', why); return { ok: true, message: o.couponRef ? '订单已取消，优惠券已退回' : '订单已取消' }
}

/* ---- after-sales ---- */
const tr = (r) => (r.trail = r.trail || [])                                          // refunds made on the admin side may have no trail yet
const ACTIVE = ['REVIEW', 'APPROVED', 'REFUNDING', 'FAILED']
const STAGE = { REVIEW: ['待审核', 'warning'], APPROVED: ['已通过', 'primary'], REFUNDING: ['退款中', 'primary'], DONE: ['已到账', 'success'], REJECTED: ['被拒绝', 'danger'], FAILED: ['转人工处理', 'danger'], WITHDRAWN: ['已撤销', 'default'] }
/** the stage the member sees: what the admin side decided (status) wins over the stage the demo reviewer moved it to */
const stageOf = (r) => (r.status === 'DONE' ? 'DONE' : r.status === 'REJECTED' ? (r.stage === 'WITHDRAWN' ? 'WITHDRAWN' : 'REJECTED')
  : r.manual ? 'FAILED' : r.status === 'APPROVED' && (!r.stage || r.stage === 'REVIEW') ? 'APPROVED' : ACTIVE.includes(r.stage) ? r.stage : 'REVIEW')
const activeRefunds = (o) => refundsOf(o).filter((r) => ACTIVE.includes(stageOf(r)))
const rno = (r) => 'RF' + String(r.id).padStart(5, '0')                                  // the number the admin side shows too
const refundable = (o, except) => o.amount - state.db.refunds.filter((r) => r.orderNo === o.no && r.status !== 'REJECTED' && r !== except).reduce((s, r) => s + r.amount, 0)
/** per line: the share of the amount paid (coupons and activities spread over the lines), what is refunded or in a request, what is left */
const lines = (o) => {
  const sub = o.items.reduce((s, i) => s + i.price * i.qty, 0) || 1; let acc = 0
  const L = o.items.map((it, i) => { const raw = i === o.items.length - 1 ? Math.max(0, o.amount - acc) : Math.round((it.price * it.qty * o.amount) / sub); acc += raw; return { i, it, share: raw, usedQty: 0, usedAmt: 0, locked: false } })
  refundsOf(o).forEach((r) => {
    const st = stageOf(r); if (st === 'REJECTED' || st === 'WITHDRAWN') return
    const rows = r.items && r.items.length ? r.items : L.map((l) => ({ idx: l.i, qty: r.amount >= o.amount ? l.it.qty : 0, amount: Math.round(l.share * Math.min(1, r.amount / (o.amount || 1))) }))
    rows.forEach((x) => { const l = L[x.idx]; if (!l) return; l.usedQty += x.qty; l.usedAmt += x.amount; if (ACTIVE.includes(st)) l.locked = true })
  })
  L.forEach((l) => { l.leftQty = Math.max(0, l.it.qty - l.usedQty); l.leftAmt = Math.max(0, l.share - l.usedAmt) })
  return L
}
const lineAmt = (l, k) => (k >= l.leftQty ? l.leftAmt : Math.round((l.leftAmt * k) / Math.max(1, l.leftQty)))
const refundWindow = (o) => new Date(parse(times(o).done || o.paidAt || o.createdAt).getTime() + 7 * 864e5)
const reviewDeadline = (o) => new Date(parse(times(o).done || o.createdAt).getTime() + 15 * 864e5)
const canRefund = (o) => ['PAID', 'FULFILLED', 'DONE', 'REFUNDING'].includes(o.status) && o.amount > 0 && lines(o).some((l) => l.leftQty > 0 && l.leftAmt > 0 && !l.locked) && now() <= refundWindow(o)
const STAY = { REVIEW: 15000, APPROVED: 6000, REFUNDING: 9000 }, STAY_AUTO = { REVIEW: 4000, APPROVED: 3000, REFUNDING: 6000 }
/** a refund request: lines [{i, qty}] or full; never more than what is left of the amount paid. The order goes to 退款中 and remembers where it came from. */
const makeRefund = (o, p) => {
  const db = state.db, L = lines(o)
  const rows = p.full ? L.filter((l) => l.leftQty > 0).map((l) => ({ idx: l.i, qty: l.leftQty, amount: l.leftAmt })) : p.lines.map((x) => ({ idx: x.i, qty: x.qty, amount: lineAmt(L[x.i], x.qty) }))
  const amount = rows.reduce((s, x) => s + x.amount, 0), at = stamp()
  if (amount <= 0 || amount > refundable(o)) throw new Error('退款金额超过这笔订单的可退上限（最多 ' + money(Math.max(0, refundable(o))) + '）')
  const id = db.refunds.reduce((m, x) => Math.max(m, x.id), 0) + 1
  const text = p.via === 'late' ? '系统发起全额原路退款（迟到支付）' : p.via === 'cancel' ? '取消订单，申请全额退款 ' + money(amount) : '提交退款申请 ' + money(amount) + '（' + (p.reason || '点错了') + '）'
  const r = { id, orderNo: o.no, userId: o.userId, userName: o.userName, amount, reason: p.reason || '点错了', kind: '仅退款', status: 'PENDING', appliedAt: at, handler: '', note: '', desc: p.desc || '', by: o.userName,
    items: rows, proofs: p.proofs || [], channel: channelOf(o, amount), stage: 'REVIEW', stageAt: Date.now(), auto: p.auto !== false, via: p.via || 'apply', trail: [{ at, who: o.userName + '（会员）', text }] }
  db.refunds.unshift(r)
  if (o.status !== 'REFUNDING' && o.status !== 'CANCELLED') { o.prev = o.status; o.status = 'REFUNDING' }
  t_(o).refunding = at; log(o, o.userName + '（会员）', text)
  return state.db.refunds[0]
}
/** the demo reviewer: moves the refunds the member made along with time (review, approve, send to the channel, arrive); the admin page can do it by hand */
const advance = (r) => {
  if (!r.auto || r.status !== 'PENDING') return
  const tbl = r.via === 'apply' ? STAY : STAY_AUTO; let st = stageOf(r)
  while (tbl[st] && Date.now() - r.stageAt >= tbl[st]) {
    const next = { REVIEW: 'APPROVED', APPROVED: 'REFUNDING', REFUNDING: 'DONE' }[st], at = stamp()
    r.stageAt += tbl[st]; r.stage = next; st = next
    if (next === 'APPROVED') { r.handler = '门店'; tr(r).push({ at, who: '门店', text: r.via === 'apply' ? '审核通过，金额 ' + money(r.amount) : '系统自动通过' }) }
    if (next === 'REFUNDING') tr(r).push({ at, who: '系统', text: '已向支付渠道发起退款' })
    if (next === 'DONE') refundDone(r)
  }
}
/** the refund arrived: the stored-value part goes back to the wallet, the order is 已退款 (or back where it was for a partial one), a fully refunded order gives its coupon back */
const refundDone = (r) => {
  const db = state.db, o = db.orders.find((x) => x.no === r.orderNo), m = me(), at = stamp()
  r.status = 'DONE'; r.stage = 'DONE'; r.doneAt = at
  tr(r).push({ at, who: '系统', text: '退款到账 ' + money(r.amount) + (r.channel && r.channel.balance ? '（含储值余额 ' + money(r.channel.balance) + ' 已回到钱包）' : '，原路退回') })
  if (!o) return
  if (r.channel && r.channel.balance && o.userId === m.id) { m.balance += r.channel.balance; walletLog('退款', r.channel.balance, '订单 ' + o.no) }
  const left = lines(o).reduce((s, l) => s + l.leftAmt, 0)
  if (o.status === 'CANCELLED') { /* a late payment: the order stays closed */ } else if (left <= 0) { o.status = 'REFUNDED'; t_(o).refunded = at; m.orders = Math.max(0, m.orders - 1); m.spent = Math.max(0, m.spent - o.amount); releaseCoupon(o) }
  else if (o.status === 'REFUNDING' && !activeRefunds(o).length) { o.status = o.prev || 'DONE'; m.spent = Math.max(0, m.spent - r.amount) }
  log(o, '系统', '退款到账 ' + money(r.amount)); notice('订单', '退款已到账', '订单退款 ' + money(r.amount) + ' 已原路退回。')
}
/** rejected or withdrawn: the lines are free again and the order goes back to what it was before the request */
const endRefund = (r, stage, who, text) => {
  const o = state.db.orders.find((x) => x.no === r.orderNo), at = stamp()
  r.status = 'REJECTED'; r.stage = stage; r.handler = who; r.note = text; tr(r).push({ at, who, text: stage === 'WITHDRAWN' ? '撤销了退款申请' : '驳回：' + text })
  if (o && o.status === 'REFUNDING' && !activeRefunds(o).length) o.status = o.prev || 'DONE'
  if (o) log(o, who, stage === 'WITHDRAWN' ? '撤销退款申请' : '退款申请被驳回：' + text)
}
const cancelPaid = (o, reason) => { o.cancelReason = reason; return makeRefund(o, { full: true, via: 'cancel', reason, auto: true }) }

/* ---- reorder and review ---- */
/** puts the lines of an order into the cart; products that are off the shelf or sold out are listed, not added */
const reorder = (o) => {
  const added = [], skipped = []
  for (const it of o.items) {
    const p = state.db.products.find((x) => x.id === it.pid)
    if (!p || p.status !== 'ON') { skipped.push({ name: it.name, why: '已下架' }); continue }
    if (p.stock <= 0) { skipped.push({ name: it.name, why: '已售罄' }); continue }
    const opt = ((p.specs && p.specs[0] && p.specs[0].opts) || []).find((x) => x.n === it.spec), qty = Math.min(it.qty, p.stock)
    addToCart(p, { spec: it.spec, specExtra: opt ? opt.d : 0, qty }); added.push(it.name)
    if (qty < it.qty) skipped.push({ name: it.name, why: '库存只够 ' + qty + ' 件，只加入了 ' + qty + ' 件' })
  }
  return { added, skipped }
}
const addReview = (o, d) => {
  const db = state.db, m = me(), user = d.anon ? '匿名用户' : m.name.slice(0, 1) + '**', day = stamp().slice(5, 10)
  db.reviews = (db.reviews || []).filter((x) => x.orderNo !== o.no)
  uniq(o.items.map((i) => i.pid)).forEach((pid) => {
    const like = d.likes[pid]
    db.reviews.push({ id: db.reviews.reduce((x, r) => Math.max(x, r.id), 0) + 1, pid, user, rating: like === true ? Math.max(d.rating, 4) : like === false ? Math.min(d.rating, 2) : d.rating, text: d.text, at: day, orderNo: o.no, tags: d.tags, imgs: d.imgs })
  })
  o.reviewed = true; o.review = { rating: d.rating, text: d.text, tags: d.tags, imgs: d.imgs, likes: d.likes, anon: d.anon, at: stamp() }
  log(o, m.name, '评价了订单（' + d.rating + ' 星）')
}

/* ---- demo orders: when a scene needs an order in a state the data does not have, one is made for the member ---- */
const WANT = {
  unpaid: (o) => kind(o) === 'unpaid', making: (o) => kind(o) === 'making', ready: (o) => kind(o) === 'ready',
  done: (o) => kind(o) === 'done' && !o.reviewed && now() <= reviewDeadline(o) && now() <= refundWindow(o), 'done-reviewed': (o) => kind(o) === 'done' && !!o.reviewed && !!o.review,
  cancelled: (o) => kind(o) === 'cancelled', closed: (o) => kind(o) === 'closed' && !o.late, late: (o) => kind(o) === 'closed' && !!o.late,
  refunding: (o) => kind(o) === 'refunding' && activeRefunds(o).length > 0, refunded: (o) => kind(o) === 'refunded' && refundsOf(o).length > 0,
  expired: (o) => kind(o) === 'done' && !o.reviewed && now() > reviewDeadline(o) && now() > refundWindow(o),
}
let demoSeq = 0
const demoOrder = (want) => {
  const db = state.db, m = me(), on = db.products.filter((p) => p.status === 'ON'), P = (n) => on[n % on.length]
  const ago = (min) => B.fmt(new Date(now().getTime() - mins(min)))
  const item = (p, qty, spec) => ({ pid: p.id, name: p.name, spec: spec || '标准', qty, price: p.price, img: p.img })
  const items = [item(P(1), 1), item(P(8), 2)], subtotal = items.reduce((s, i) => s + i.price * i.qty, 0), amount = subtotal
  const created = want === 'expired' ? ago(60 * 24 * 20) : ['cancelled', 'closed', 'late'].includes(want) ? ago(60 * 20) : ['done', 'done-reviewed', 'refunding', 'refunded'].includes(want) ? ago(60 * 26) : want === 'unpaid' ? ago(6) : want === 'ready' ? ago(28) : ago(20)
  let no = ''; do { demoSeq += 1; no = '26' + created.slice(2, 10).replace(/-/g, '') + String(900000 + demoSeq * 137) } while (db.orders.some((x) => x.no === no))
  const o = { no, userId: m.id, userName: m.name, items, subtotal, discount: 0, amount, pay: 'WECHAT', status: 'UNPAID', createdAt: created, paidAt: '', remark: '', pickup: '', coupon: '', pickType: 'self', slot: '尽快取餐', t: {}, log: [], demo: true }
  const plus = (s, min) => B.fmt(new Date(parse(s).getTime() + mins(min)))
  log(o, m.name, '提交订单'); o.log[0].at = created
  const L = (at, who, text) => o.log.push({ at, who, text })
  const paid = () => { o.paidAt = plus(created, 1); o.paySplit = { wechat: amount }; o.pickup = 'A' + (20 + (demoSeq % 60)); t_(o).making = o.paidAt; L(o.paidAt, '系统', '支付成功 ' + money(amount) + '（微信支付）'); L(o.paidAt, '门店', '已接单，开始制作') }
  if (want === 'unpaid') o.deadlineAt = Date.now() + mins(24)
  else if (want === 'making') { o.status = 'PAID'; paid() }
  else if (want === 'ready') { o.status = 'FULFILLED'; paid(); t_(o).fulfilled = plus(created, 14); L(t_(o).fulfilled, '门店', '餐品已做好，通知取餐') }
  else if (['done', 'done-reviewed', 'refunding', 'refunded', 'expired'].includes(want)) {
    o.status = 'DONE'; paid(); t_(o).fulfilled = plus(created, 13); t_(o).done = plus(created, 19); L(t_(o).fulfilled, '门店', '餐品已做好，通知取餐'); L(t_(o).done, '前台', '核销取餐码，顾客已取餐')
    if (want === 'done-reviewed') { o.reviewed = true; o.review = { rating: 5, text: '味道很好，米饭也热，取餐不用等。', tags: ['味道很好', '出餐很快'], imgs: [], likes: { [items[0].pid]: true }, anon: false, at: plus(created, 90) } }
    if (want === 'refunding' || want === 'refunded') {
      const id = db.refunds.reduce((x, r) => Math.max(x, r.id), 0) + 1, part = want === 'refunding', amt = part ? items[0].price : amount, at = plus(created, 120)
      const r = { id, orderNo: o.no, userId: m.id, userName: m.name, amount: amt, reason: part ? '菜品有问题' : '点错了', kind: '仅退款', status: part ? 'PENDING' : 'DONE', appliedAt: at, handler: part ? '' : '王海燕', note: '', desc: part ? '饭里有一小块不明异物' : '', by: m.name, items: part ? [{ idx: 0, qty: 1, amount: amt }] : items.map((it, i) => ({ idx: i, qty: it.qty, amount: it.price * it.qty })),
        proofs: [], channel: channelOf(o, amt), stage: part ? 'REVIEW' : 'DONE', stageAt: Date.now(), auto: false, via: 'apply', trail: [{ at, who: m.name + '（会员）', text: '提交退款申请 ' + money(amt) }] }
      if (!part) { r.doneAt = plus(at, 40); tr(r).push({ at: plus(at, 20), who: '王海燕', text: '同意退款 ' + money(amt) }, { at: r.doneAt, who: '系统', text: '退款到账 ' + money(amt) + '，原路退回' }) }
      db.refunds.unshift(r); o.prev = 'DONE'; o.status = part ? 'REFUNDING' : 'REFUNDED'; t_(o).refunding = at; if (!part) t_(o).refunded = r.doneAt
    }
  } else if (want === 'cancelled') { o.status = 'CANCELLED'; o.cancelReason = '点错了'; t_(o).cancelled = plus(created, 3); L(t_(o).cancelled, m.name, '取消订单（点错了）') }
  else if (want === 'closed' || want === 'late') {
    o.status = 'CANCELLED'; o.closeReason = '超时未支付'; t_(o).cancelled = plus(created, 30); L(t_(o).cancelled, '系统', '超过 ' + closeMin() + ' 分钟未支付，订单自动关闭')
    if (want === 'late') {
      o.late = { amount, at: plus(created, 41) }; L(o.late.at, '系统', '关单后收到支付 ' + money(amount) + '，已记为迟到支付并发起全额原路退款')
      const id = db.refunds.reduce((x, r) => Math.max(x, r.id), 0) + 1
      db.refunds.unshift({ id, orderNo: o.no, userId: m.id, userName: m.name, amount, reason: '迟到支付', kind: '仅退款', status: 'PENDING', appliedAt: o.late.at, handler: '', note: '', desc: '订单已超时关闭，晚到的支付款自动原路退回', by: m.name,
        items: items.map((it, i) => ({ idx: i, qty: it.qty, amount: it.price * it.qty })), proofs: [], channel: { balance: 0, wechat: amount }, stage: 'REFUNDING', stageAt: Date.now(), auto: false, via: 'late', trail: [{ at: o.late.at, who: '系统', text: '系统发起全额原路退款（迟到支付）' }, { at: o.late.at, who: '系统', text: '已向支付渠道发起退款' }] })
    }
  }
  db.orders.unshift(o)
  return db.orders[0]
}
/** the first order of mine in the wanted state (see WANT), made for the member when there is none */
const find = (want) => mine().find(WANT[want]) || demoOrder(want)
const copy = (text, done) => { const ok = () => toast(done || '已复制', undefined, 1200); try { navigator.clipboard.writeText(text).then(ok, ok) } catch (e) { ok() } }

export const kit = {
  now, stamp, parse, hm, when, kind, label, TONE, SEG, inSeg, mine, byNo, count, code, times, timeline, split, payText, REASONS, REVIEW_DAYS: 15, REFUND_DAYS: 7,
  toast, tagColor, sweep, settle, payWith, cancelOrder, channelOf, channelText, close,
  refundsOf, STAGE, stageOf, activeRefunds, rno, refundable, lines, lineAmt, refundWindow, reviewDeadline, canRefund, makeRefund, endRefund, reorder, addReview, find, demoOrder, copy,
}
</script>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useScene } from '../../shared/state.js'
import { useNav } from '../nav.js'

const { go, toTab } = useNav()
const router = useRouter()
const scene = useScene('orders')
const guest = computed(() => state.role === 'guest')
const phase = ref('loading')                                             // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); if (scene.value === 'expiring') { const u = kit.mine().find((o) => o.status === 'UNPAID'); if (u) u.deadlineAt = Date.now() + 8000 } kit.sweep(); at.value = kit.stamp(); phase.value = 'ok' } catch { phase.value = 'error' } }
let timer = 0
onMounted(() => { load(); timer = setInterval(kit.sweep, 1000) })
onBeforeUnmount(() => clearInterval(timer))

// ---- the list: segment, paging, refresh
const seg = ref('all')
const shown = ref(10)
const at = ref(kit.stamp())
const refreshing = ref(false)
const refreshErr = ref('')
const all = computed(() => kit.mine())
const rows = computed(() => all.value.filter((o) => kit.inSeg(o, seg.value)))
const page = computed(() => rows.value.slice(0, shown.value))
const finished = computed(() => shown.value >= rows.value.length)
const countOf = (k) => all.value.filter((o) => kit.inSeg(o, k)).length
const status = computed(() => (guest.value ? 'forbidden' : phase.value !== 'ok' ? phase.value : rows.value.length ? 'ok' : 'empty'))
const EMPTY = { all: '还没有订单，去点一份喜欢的吧', unpaid: '没有待支付的订单，下单后没支付的订单会为你保留 30 分钟', pickup: '没有待取餐的订单，支付成功后，取餐码会出现在这里', done: '还没有已完成的订单，取餐后的订单会放在这里', after: '没有退款或售后记录，申请过退款的订单会在这里显示进度' }
watch(seg, () => { shown.value = 10; listError.value = false })
async function refresh() {
  refreshing.value = true
  try {
    await request(600, { fail: scene.value === 'refresh-fail' ? new Error('offline') : null })
    kit.sweep(); at.value = kit.stamp(); refreshErr.value = ''; kit.toast('订单已更新', undefined, 1200)
  } catch (e) { refreshErr.value = '刷新失败：网络不太稳定，当前显示的是上次的内容'; kit.toast('刷新没有成功，请稍后再试', 'fail') } finally { refreshing.value = false }
}
const listLoading = ref(false)
const listError = ref(false)
let failMore = true                                                      // the scene: the first load-more fails, the retry works
async function loadMore() {
  listLoading.value = true
  try { await request(500, { fail: scene.value === 'more-fail' && failMore ? new Error('offline') : null }); shown.value += 10 } catch (e) { failMore = false; listError.value = true } finally { listLoading.value = false }
}

// ---- one confirm dialog for the page
const cf = reactive({ show: false, title: '', message: '', ok: '确定', cancel: '取消', danger: false, resolve: null })
function ask({ title, message, ok = '确定', cancel = '取消', danger = false }) { Object.assign(cf, { show: true, title, message, ok, cancel, danger }); return new Promise((r) => { cf.resolve = r }) }
function answer(v) { if (cf.resolve) { cf.resolve(v); cf.resolve = null } }

// ---- what each card offers
const ICON = { unpaid: 'clock-o', making: 'fire-o', ready: 'bell', done: 'success', refunding: 'refund-o', refunded: 'balance-o', closed: 'clock-o', cancelled: 'close' }
const isEnd = (o) => ['cancelled', 'closed', 'refunded'].includes(kit.kind(o))
const left = (o) => Math.max(0, (o.deadlineAt || 0) - Date.now())
const progress = (o) => {
  const k = kit.kind(o), act = kit.activeRefunds(o)[0], recs = kit.refundsOf(o)
  if (k === 'making') return '制作中 · 取餐号 ' + o.pickup + ' · ' + (o.slot || '尽快取餐')
  if (k === 'ready') return '餐品已做好 · 取餐号 ' + o.pickup
  if (k === 'done') return '已取餐 ' + kit.when(kit.times(o).done)
  if (k === 'refunding') return act ? '退款' + kit.STAGE[kit.stageOf(act)][0] + ' ' + money(act.amount) : '退款处理中'
  if (k === 'refunded') return '已原路退回 ' + money(recs.filter((r) => r.status === 'DONE').reduce((s, r) => s + r.amount, 0) || o.amount)
  if (k === 'closed') return o.late ? '超时关闭 · 迟到支付已退回' : '超时未支付，已自动关闭'
  return '你已取消 · ' + (o.cancelReason || '不想要了')
}
const open = (o) => go('order-detail', { id: o.no })
const refundOf = (o) => go('refund-apply', { id: o.no })
const progressOf = (o) => go('refund-apply', { id: o.no, rid: kit.activeRefunds(o)[0]?.id })

async function remove(o) {
  const yes = await ask({ title: '删除这条订单记录', message: '删除订单 ' + o.no.slice(-6) + '（' + money(o.amount) + '）。删除后列表里不再显示，不影响已有的退款和发票。', ok: '删除', danger: true })
  if (yes) { o.hidden = true; kit.toast('订单已删除', 'success') }
}
async function again(o) {
  const r = kit.reorder(o)
  if (!r.added.length) { const yes = await ask({ title: '这单的商品现在都买不了', message: r.skipped.map((x) => '「' + x.name + '」' + x.why).join('\n'), ok: '去点单', cancel: '知道了' }); if (yes) toTab('menu'); return }
  if (!r.skipped.length) { kit.toast('已把 ' + r.added.length + ' 种商品加入购物车', 'success'); go('cart'); return }
  const yes = await ask({ title: '已加入 ' + r.added.length + ' 种商品', message: '另有商品没能加入：\n' + r.skipped.map((x) => '「' + x.name + '」' + x.why).join('\n'), ok: '去购物车', cancel: '继续逛' })
  if (yes) go('cart')
}
const more = reactive({ show: false, o: null })
const moreActions = computed(() => (more.o ? [kit.canRefund(more.o) && { name: '申请退款', key: 'refund' }, { name: '订单详情', key: 'detail' }, { name: '删除订单', key: 'delete', color: 'var(--luz-danger)' }].filter(Boolean) : []))
function onMore(a) { const o = more.o; more.show = false; if (a.key === 'refund') refundOf(o); else if (a.key === 'detail') open(o); else remove(o) }

// ---- cancel
const cx = reactive({ show: false, o: null, paid: false, reason: '', other: '', err: '', busy: false })
async function askCancel(o) {
  kit.sweep()
  if (!['UNPAID', 'PAID'].includes(o.status)) {
    const can = kit.canRefund(o)
    const yes = await ask({ title: '现在不能取消', message: o.status === 'FULFILLED' ? '餐品已经做好，不能再取消订单。如果餐品有问题，可以申请退款。' : '订单已经不能取消。如果餐品有问题，可以在 7 天内申请退款。', ok: can ? '申请退款' : '知道了', cancel: can ? '知道了' : '' })
    if (yes && can) refundOf(o)
    return
  }
  Object.assign(cx, { show: true, o, paid: o.status === 'PAID', reason: '', other: '', err: '', busy: false })
}
async function doCancel() {
  if (!cx.reason) { cx.err = '请先选一个取消原因'; return }
  if (cx.reason === '其他' && cx.other.trim().length < 2) { cx.err = '选了“其他”，请写下具体原因（至少 2 个字）'; return }
  cx.busy = true; cx.err = ''
  try { const r = await kit.cancelOrder(cx.o, { reason: cx.reason, other: cx.other, wasPaid: cx.paid }); cx.show = false; kit.toast(r.message, r.ok ? 'success' : 'fail') } catch (e) { cx.err = e.message } finally { cx.busy = false }
}
const refundNote = computed(() => (cx.o ? '门店还没出餐，取消后将全额退款 ' + money(cx.o.amount) + '：' + kit.channelText(kit.channelOf(cx.o, cx.o.amount)) + '。' + (cx.o.couponRef ? '用掉的优惠券会退回（未过期的）。' : '') : ''))

// ---- pay
const pay = reactive({ show: false, o: null, method: 'wechat', busy: false, err: '' })
const payOpts = computed(() => {
  if (!pay.o) return []
  const bal = state.db.me.balance, a = pay.o.amount
  return [
    ['wechat', '微信支付', '推荐，支付 ' + money(a), true],
    ['balance', '储值余额', bal >= a ? '余额 ' + money(bal) + '，支付后剩 ' + money(bal - a) : '余额 ' + money(bal) + '，还差 ' + money(a - bal), bal >= a],
    ['mix', '储值余额 + 微信支付', bal > 0 && bal < a ? '余额抵扣 ' + money(bal) + '，再微信支付 ' + money(a - bal) : bal >= a ? '余额足够，不需要组合' : '没有可用余额', bal > 0 && bal < a],
  ]
})
function askPay(o) { kit.sweep(); if (o.status === 'CANCELLED') { kit.toast('订单已超时关闭，请重新下单', 'fail'); return } Object.assign(pay, { show: true, o, method: 'wechat', busy: false, err: '' }) }
async function doPay() {
  const o = pay.o; pay.busy = true; pay.err = ''
  try {
    kit.sweep()
    if (o.status === 'CANCELLED') throw new Error('订单已超时关闭，请重新下单')
    try { await request(500) } catch (e) { throw new Error(e.message + '，订单没有支付，没有扣款，请稍后再试。订单为你保留中') }
    const r = kit.payWith(o, pay.method)
    if (!r.ok) throw new Error(r.reason === 'nofund' ? '储值余额不足，请改用微信支付或先去充值' : '支付没有成功，请重新支付')
    pay.show = false
    if (router.hasRoute('pay-result')) go('pay-result', { no: o.no }); else kit.toast('支付成功，门店正在备餐', 'success')
  } catch (e) { pay.err = e.message } finally { pay.busy = false }
}

// ---- pickup code
const pick = reactive({ show: false, o: null })
</script>

<template>
  <div class="mp-page">
    <div v-if="status !== 'forbidden' && phase === 'ok'" class="head">
      <van-tabs v-model:active="seg" line-width="24" aria-label="订单分类">
        <van-tab v-for="[k, t] in kit.SEG" :key="k" :name="k">
          <template #title>{{ t }}<span class="n num" :class="{ zero: !countOf(k) }">{{ countOf(k) }}</span></template>
        </van-tab>
      </van-tabs>
      <van-cell clickable center :title="'共 ' + rows.length + ' 单 · 更新于 ' + kit.hm(at)" :label="refreshErr || undefined" :class="{ err: refreshErr }" @click="refresh">
        <template #value><span class="refresh"><van-loading v-if="refreshing" size="16" /><van-icon v-else name="replay" />刷新</span></template>
      </van-cell>
    </div>

    <MiniState :status="status" :rows="4" :empty-text="EMPTY[seg]" error-hint="订单列表没有加载出来，请检查网络后重试" @retry="load">
      <template #empty-action><van-button v-if="seg !== 'after'" round type="primary" @click="toTab('menu')">去点单</van-button></template>
      <template #forbidden-action><van-button round type="primary" @click="go('login')">去登录</van-button></template>
      <van-pull-refresh v-model="refreshing" :disabled="refreshing" @refresh="refresh">
        <van-list v-model:loading="listLoading" v-model:error="listError" :finished="finished" :immediate-check="false"
          :finished-text="rows.length > 10 ? '没有更多了' : '已显示全部 ' + rows.length + ' 单'" error-text="没有加载出来，网络不太稳定，点此重试" loading-text="加载中…" @load="loadMore">
          <van-cell-group v-for="o in page" :key="o.no" inset class="oc" :class="{ end: isEnd(o) }">
            <van-cell center clickable :border="false" @click="open(o)">
              <template #title><van-icon name="shop-o" class="shop" /><b class="store">{{ B.shop.name }}</b><van-tag plain class="pk" color="var(--luz-ink-2)">{{ o.pickType === 'dine' ? '堂食' : '自取' }}</van-tag></template>
              <template #value><van-tag :type="kit.TONE[kit.kind(o)]" plain :color="kit.tagColor(kit.TONE[kit.kind(o)])">{{ kit.label(o) }}</van-tag></template>
            </van-cell>
            <van-cell center clickable :border="false" @click="open(o)">
              <template #title>
                <div class="thumbs">
                  <van-image v-for="(i, n) in o.items.slice(0, 4)" :key="n" :src="i.img" :alt="i.name" width="48" height="48" radius="8" fit="cover" />
                  <span v-if="o.items.length > 4" class="more num">+{{ o.items.length - 4 }}</span>
                </div>
              </template>
              <template #value>
                <div class="sum"><span class="muted">{{ kit.when(o.createdAt) }} · {{ kit.count(o) }} 件</span><span><span class="muted">{{ o.status === 'UNPAID' ? '应付 ' : '实付 ' }}</span><MiniPrice :cents="o.amount" :size="16" /></span></div>
              </template>
            </van-cell>
            <van-cell v-if="kit.kind(o) === 'unpaid'" :border="false" :icon="ICON.unpaid">
              <template #title>剩余支付时间 <van-count-down :time="left(o)" format="mm:ss" class="cd num" @finish="kit.sweep" /></template>
            </van-cell>
            <van-cell v-else :border="false" :icon="ICON[kit.kind(o)]" :title="progress(o)">
              <template v-if="kit.kind(o) === 'done' && (o.reviewed || kit.refundsOf(o).length)" #value>
                <van-tag v-if="o.reviewed" type="success" plain>已评价</van-tag><van-tag v-if="kit.refundsOf(o).length" plain class="pk" color="var(--luz-ink-2)">有售后</van-tag>
              </template>
            </van-cell>
            <div class="acts">
              <template v-if="kit.kind(o) === 'unpaid'"><van-button round @click="askCancel(o)">取消订单</van-button><van-button round type="primary" @click="askPay(o)">去支付</van-button></template>
              <template v-else-if="kit.kind(o) === 'making'"><van-button round @click="askCancel(o)">取消订单</van-button><van-button round type="primary" @click="pick.o = o; pick.show = true">查看取餐码</van-button></template>
              <template v-else-if="kit.kind(o) === 'ready'"><van-button v-if="kit.canRefund(o)" round @click="refundOf(o)">申请退款</van-button><van-button round type="primary" @click="pick.o = o; pick.show = true">查看取餐码</van-button></template>
              <template v-else-if="kit.kind(o) === 'done'">
                <van-button round @click="more.o = o; more.show = true">更多</van-button>
                <van-button v-if="!o.reviewed" round type="primary" @click="go('review', { id: o.no })">去评价</van-button>
                <van-button round :type="o.reviewed ? 'primary' : 'default'" @click="again(o)">再来一单</van-button>
              </template>
              <template v-else-if="kit.kind(o) === 'refunding'"><van-button round type="primary" @click="progressOf(o)">查看进度</van-button></template>
              <template v-else><van-button round @click="remove(o)">删除订单</van-button><van-button round type="primary" @click="again(o)">再来一单</van-button></template>
            </div>
          </van-cell-group>
        </van-list>
      </van-pull-refresh>
    </MiniState>

    <!-- cancel -->
    <van-action-sheet v-model:show="cx.show" :title="cx.paid ? '取消订单并退款' : '取消订单'" round>
      <div class="sheet">
        <van-notice-bar v-if="cx.paid" left-icon="info-o" wrapable :scrollable="false" :text="refundNote" />
        <p v-else class="muted">取消后订单关闭{{ cx.o && cx.o.couponRef ? '，用掉的优惠券会退回' : '' }}，购物车里的商品不会恢复，可以用“再来一单”重新加入。</p>
        <van-radio-group v-model="cx.reason">
          <van-cell-group inset title="取消原因（必选）">
            <van-cell v-for="r in kit.REASONS" :key="r" :title="r" clickable @click="cx.reason = r"><template #right-icon><van-radio :name="r" /></template></van-cell>
          </van-cell-group>
        </van-radio-group>
        <van-field v-if="cx.reason === '其他'" v-model="cx.other" type="textarea" rows="2" maxlength="100" show-word-limit placeholder="请简单说明原因（2–100 字）" aria-label="其他原因" />
        <van-notice-bar v-if="cx.err" class="err" left-icon="warning-o" wrapable :scrollable="false" :text="cx.err" />
        <div class="sheet-acts"><van-button block round @click="cx.show = false">再想想</van-button><van-button block round type="danger" :loading="cx.busy" loading-text="处理中" @click="doCancel">{{ cx.paid ? '确认取消并退款' : '确认取消订单' }}</van-button></div>
      </div>
    </van-action-sheet>

    <!-- pay -->
    <van-action-sheet v-model:show="pay.show" title="选择支付方式" round>
      <div v-if="pay.o" class="sheet">
        <van-radio-group v-model="pay.method">
          <van-cell-group inset>
            <van-cell v-for="[k, t, d, ok] in payOpts" :key="k" :title="t" :label="d" clickable center @click="ok && (pay.method = k)"><template #right-icon><van-radio :name="k" :disabled="!ok" /></template></van-cell>
          </van-cell-group>
        </van-radio-group>
        <van-cell-group v-if="state.db.me.balance < pay.o.amount" inset><van-cell title="储值余额不够" value="去充值" is-link @click="pay.show = false; go('wallet')" /></van-cell-group>
        <van-notice-bar v-if="pay.err" class="err" left-icon="warning-o" wrapable :scrollable="false" :text="pay.err" />
        <div class="sheet-acts"><van-button block round type="primary" :loading="pay.busy" loading-text="支付中" @click="doPay">确认支付 {{ money(pay.o.amount) }}</van-button></div>
      </div>
    </van-action-sheet>

    <!-- pickup code -->
    <van-action-sheet v-model:show="pick.show" title="取餐码" round>
      <div v-if="pick.o" class="sheet">
        <van-cell-group inset>
          <van-cell center title="取餐码"><template #value><b class="code num">{{ kit.code(pick.o) }}</b></template></van-cell>
          <van-cell v-if="pick.o.pickup" title="取餐号" :value="pick.o.pickup" />
          <van-cell title="取餐门店" :value="B.shop.name" />
          <van-cell title="取餐时间" :value="pick.o.slot || '尽快取餐'" />
        </van-cell-group>
        <div class="sheet-acts"><van-button block round @click="pick.show = false; open(pick.o)">订单详情</van-button><van-button block round type="primary" @click="pick.show = false">我知道了</van-button></div>
      </div>
    </van-action-sheet>

    <van-action-sheet v-model:show="more.show" :actions="moreActions" cancel-text="取消" close-on-click-action round @select="onMore" />
    <van-dialog v-model:show="cf.show" :title="cf.title" :message="cf.message" message-align="left" :show-cancel-button="!!cf.cancel" :cancel-button-text="cf.cancel" :confirm-button-text="cf.ok"
      :confirm-button-color="cf.danger ? 'var(--luz-danger)' : undefined" @confirm="answer(true)" @cancel="answer(false)" @closed="answer(false)" />
  </div>
</template>

<style scoped>
b { font-weight: 600; }
.head { position: sticky; top: 0; z-index: 3; display: grid; gap: 8px; margin: -12px -12px 0; padding-bottom: 8px; background: var(--luz-canvas); }
.n { margin-left: 4px; font-size: var(--t16); color: var(--luz-ink-2); }
.n.zero { color: var(--luz-ink-3); }
.refresh { display: inline-flex; align-items: center; gap: 4px; color: var(--luz-action-text); }
.err { --van-notice-bar-background: var(--luz-danger-tint); --van-notice-bar-text-color: var(--luz-ink); }
.oc { margin-bottom: 12px; }
.oc.end { background: var(--luz-surface); }
.shop { margin-right: 6px; vertical-align: -2px; }
.store { font-weight: 600; margin-right: 8px; }
.pk { margin-left: 6px; }
.thumbs { display: flex; align-items: center; gap: 8px; }
.more { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 8px; background: var(--luz-canvas); color: var(--luz-ink-2); }
.sum { display: grid; justify-items: end; gap: 4px; white-space: nowrap; }
.cd { display: inline; font-size: inherit; line-height: inherit; color: var(--luz-warning); font-weight: 600; }
.acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding: 4px 16px 12px; background: var(--van-background-2); }
.sheet { display: grid; gap: 12px; padding: 0 12px 16px; }
.sheet-acts { display: flex; gap: 8px; }
.code { font-size: var(--t22); line-height: 30px; font-weight: 700; letter-spacing: 2px; color: var(--luz-ink); }
</style>
