<script>
// 会员卡详情（主次布局）。本文件的普通脚本块同时导出会员卡与储值的业务函数，购卡、我的会员卡、储值三页共用；数据只读写 state.db。
import { B } from '../../shared/data.js'
import { state } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, money } from '../../shared/format.js'

export const meta = {
  id: 'card-detail', label: '会员卡详情', title: '会员卡详情', group: '会员与资产', order: 3,
  layout: '主次布局',
  reason: '一张卡最要紧的是“还能用多少、到哪天”，所以卡面放大成主角；状态异常时在卡面下给原因和唯一的修复动作，冻结、转让、挂失、退卡收成一组操作行，规则与记录退到下面',
  scenes: [
    { id: 'frozen', label: '状态：冻结中' }, { id: 'lost', label: '状态：已挂失' }, { id: 'expired', label: '状态：已过期' }, { id: 'usedup', label: '状态：已用完' }, { id: 'pending', label: '状态：未生效' },
    { id: 'refund-review', label: '退卡进度：审核中' }, { id: 'refund-doing', label: '退卡进度：退款中' }, { id: 'refund-done', label: '退卡进度：已到账' }, { id: 'refund-rejected', label: '退卡进度：被驳回，恢复原状态' },
    { id: 'pay-fail', label: '支付：补办费支付失败' },
  ],
}

/* ---------- 日期 ---------- */
export const today = () => K.ymd(B.NOW())
export const addD = (s, n) => K.ymd(K.addDays(new Date(s + 'T00:00:00'), n))
export const diff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5)
export const toDate = (s) => new Date(s + 'T00:00:00')

/* ---------- 预付限额与功能开关（后台“系统配置”里的 feature.card、feature.wallet） ---------- */
export const PREPAID = { cardCap: 100000, totalCap: 300000, minTopup: 1000, maxTopup: 200000 }
export const featureOn = (key) => { const f = state.db.config.runtime.find((x) => x.key === key); return !f || f.value !== false }

/* ---------- 提示与支付（弹层都挂在手机框的覆盖层里） ---------- */
const OVERLAY = '#phone-overlay'
export const say = (message, type) => showToast({ message, type: type || 'text', teleport: OVERLAY, duration: 1800 })
/** 模拟微信支付：返回 { ok, kind: 'cancel'|'fail'|'timeout'|'net', reason }；页面场景 pay-cancel、pay-fail、pay-timeout 演示各种结果 */
export function payWx(scene, { amount, subject }) {
  let out = { ok: false, kind: 'cancel', reason: '你取消了支付' }
  return showConfirmDialog({
    title: '微信支付', message: subject + '\n应付 ' + money(amount), confirmButtonText: '确认支付', cancelButtonText: '取消支付', teleport: OVERLAY,
    beforeClose: async (action) => {
      if (action !== 'confirm') return true
      try { await request(700) } catch (e) { out = { ok: false, kind: 'net', reason: e.message + '，请稍后再试' }; return true }
      if (scene === 'pay-cancel') out = { ok: false, kind: 'cancel', reason: '你取消了支付' }
      else if (scene === 'pay-fail') out = { ok: false, kind: 'fail', reason: '银行卡余额不足，请换一种支付方式' }
      else if (scene === 'pay-timeout') { await new Promise((r) => setTimeout(r, 1200)); out = { ok: false, kind: 'timeout', reason: '支付结果确认超时，如已扣款会在 10 分钟内自动退回' } }
      else out = { ok: true }
      return true
    },
  }).catch(() => {}).then(() => out)
}

/* ---------- 卡种：库里只有价格、天数、次数，限购、冻结、转让这些规则在这里补默认值（卡种上有同名字段时以卡种为准） ---------- */
const DEFAULTS = { orig: 0, limit: 2, scope: '全部门店', hours: '营业时间内可用', freeze: null, transfer: null, reissue: 1000, refundFee: 10 }
const EXTRA = {
  1: { orig: 24800, limit: 3, hours: '全天可用，每天限用 1 次', freeze: { min: 3, max: 15, total: 15, times: 2 }, transfer: { fee: 500, cool: 30, times: 1 } },
  2: { orig: 18000, limit: 2, hours: '营业时间内可用，每次用 1 次', freeze: { min: 3, max: 30, total: 30, times: 1 }, transfer: { fee: 0, cool: 30, times: 1 } },
  3: { orig: 12800, limit: 1 },
  4: { orig: 62800, limit: 1, hours: '全天可用，每天限用 1 次', freeze: { min: 3, max: 30, total: 30, times: 2 }, transfer: { fee: 500, cool: 30, times: 1 } },
}
export const typeOf = (id) => state.db.cardTypes.find((x) => x.id === id)
export const ruleOf = (ty) => Object.assign({}, DEFAULTS, EXTRA[ty.id], ty.slot ? { hours: '每天 ' + ty.slot + ' 可用' } : {}, ty)
export const typeFor = (c) => ruleOf(typeOf(c.typeId) || { id: c.typeId, name: c.typeName, kind: c.kind, price: c.price || 0, days: 30, times: 0, gift: 0, daily: 0, status: 'OFF' })
/** 卡种使用规则：[[名称, 文字]] */
export function rulesOf(ty0) {
  const ty = ruleOf(ty0), fr = ty.freeze, tr = ty.transfer
  return [
    ['适用门店', ty.scope], ['可用时段', ty.hours],
    ['有效期', ty.times ? ty.days + ' 天内用完，超期作废；生效当天算第 1 天' : ty.days + ' 天，生效当天算第 1 天'],
    ty.daily ? ['每日限用', '每天最多用 1 次，当天未用不累计'] : null,
    ty.gift ? ['赠送', '赠送 ' + ty.gift + ' 次，退卡时不折现'] : null,
    ['请假冻结', fr ? '最多冻结 ' + fr.times + ' 次，每次 ' + fr.min + ' 到 ' + fr.max + ' 天，累计不超过 ' + fr.total + ' 天；冻结期间不能使用，到期日顺延' : '这个卡种不支持请假冻结'],
    ['转让', tr ? '可转让 ' + tr.times + ' 次，手续费 ' + (tr.fee ? money(tr.fee) : '免费') + '；转让后 ' + tr.cool + ' 天内不能再转让；对方须是已注册会员' : '这个卡种不可转让'],
    ['挂失补办', '挂失后卡立即不能使用；补办费 ' + money(ty.reissue) + '，换新卡号，剩余权益全部保留'],
    ['退卡', '付款 7 日内且未使用，全额退；其余按原价扣除已使用部分，再收 ' + ty.refundFee + '% 手续费；赠送部分不折现；已过期的卡不予退款'],
    ['限购', '每人限购 ' + ty.limit + ' 张（含未生效的卡）'],
  ].filter(Boolean)
}

/* ---------- 卡的状态：PENDING 未生效 / ACTIVE 使用中 / FROZEN 冻结中 / LOST 已挂失 / REFUNDING 退款中 / REFUNDED 已退卡 / EXPIRED 已过期 / USEDUP 已用完 ---------- */
export const startOf = (c) => c.start || c.bought
export function cardState(c) {
  const t = today(), S = (key, label, type) => ({ key, label, type })
  if (c.status === 'REFUNDED') return S('REFUNDED', '已退卡', 'default')
  if (c.status === 'VOID') return S('REFUNDED', '已作废', 'default')
  if (c.status === 'REFUNDING') return S('REFUNDING', '退款中', 'warning')
  if (c.status === 'LOST') return S('LOST', '已挂失', 'danger')
  if (c.status === 'FROZEN') return S('FROZEN', '冻结中', 'primary')
  if (c.start && c.start > t) return S('PENDING', '未生效', 'primary')
  if (c.expire < t || c.status === 'EXPIRED') return S('EXPIRED', '已过期', 'default')
  if (c.total > 0 && c.used >= c.total) return S('USEDUP', '已用完', 'default')
  return S('ACTIVE', '使用中', 'success')
}
export const myCards = () => state.db.cards.filter((c) => c.userId === state.db.me.id)
export const isHeld = (c) => ['ACTIVE', 'PENDING', 'FROZEN', 'LOST'].includes(cardState(c).key)
export const priceOf = (c) => (c.price != null ? c.price : (typeOf(c.typeId) || {}).price || 0)
export const frozenRange = (c) => { const from = c.frozenFrom || addD(today(), -1), to = c.frozenTo || addD(from, Math.max(1, c.frozenDays || 3) - 1); return { from, to } }
/** 状态标签的颜色：品牌卡面上是白底标签，灰色（已过期、已退卡）用浅底深字，保证对比度 */
export const tagOf = (chip, onBrand = false) => (onBrand ? { color: 'var(--luz-on-action)', textColor: 'var(--luz-action)' } : chip.type === 'default' ? { color: 'var(--luz-canvas)', textColor: 'var(--luz-ink-2)' } : { type: chip.type })
/** 卡面要显示的主数字、有效期说明、状态标签 */
export function faceOf(c, st = cardState(c)) {
  const t = today(), k = st.key, f = frozenRange(c)
  let r
  if (c.total) r = { n: Math.max(0, c.total - c.used), unit: '次', label: k === 'EXPIRED' ? '到期时剩余' : '剩余' }
  else if (k === 'EXPIRED' || k === 'REFUNDED') r = { n: c.used, unit: '次', label: '累计使用' }
  else if (k === 'PENDING') r = { n: Math.max(0, diff(startOf(c), c.expire)), unit: '天', label: '有效' }
  else if (k === 'FROZEN') r = { n: Math.max(0, diff(f.to, c.expire)), unit: '天', label: '恢复后剩余' }
  else r = { n: Math.max(0, diff(t, c.expire)), unit: '天', label: '剩余' }
  const exp = {
    PENDING: startOf(c) + ' 生效，至 ' + c.expire, ACTIVE: '有效期至 ' + c.expire, FROZEN: '冻结至 ' + f.to + '，有效期至 ' + c.expire, LOST: '已挂失，补办后继续使用',
    REFUNDING: '退款处理中', REFUNDED: '卡已终止', EXPIRED: '已于 ' + c.expire + ' 到期', USEDUP: '次数已用完',
  }[k]
  const d = diff(t, c.expire), soon = k === 'ACTIVE' && d >= 0 && d <= 7
  return { ...r, exp, soon, chip: soon ? { label: d === 0 ? '今天到期' : d + ' 天后到期', type: 'warning' } : { label: st.label, type: st.type }, live: ['ACTIVE', 'PENDING', 'FROZEN'].includes(k), dead: ['EXPIRED', 'USEDUP', 'REFUNDED'].includes(k) }
}
/** 卡的剩余价值（预付限额按它算）：次卡按剩余次数，期限卡按剩余天数 */
export function remainValue(c) {
  const ty = typeOf(c.typeId)
  if (!ty || !isHeld(c)) return 0
  return Math.round(priceOf(c) * (c.total ? Math.max(0, c.total - c.used) / c.total : Math.max(0, Math.min(ty.days, diff(today(), c.expire))) / ty.days))
}
export const prepaidHeld = () => state.db.me.balance + myCards().reduce((s, c) => s + remainValue(c), 0)
/** 退卡试算：付款 7 日内且未使用全额退；其余按原价扣已用部分，再收手续费；赠送不折现 */
export function quoteRefund(c) {
  const ty = typeFor(c), t = today(), paid = priceOf(c), sinceBuy = diff(c.bought, t), freeUnits = ty.gift || 0, paidUnits = Math.max(1, c.total ? c.total - freeUnits : ty.days)
  const usedUnits = c.total ? c.used : startOf(c) > t ? 0 : Math.min(ty.days, Math.max(0, diff(startOf(c), t) + 1 - (c.frozenTotal || 0)))
  const full = sinceBuy <= 7 && c.used === 0
  const unit = Math.round((ty.orig || paid) / paidUnits), deduct = full ? 0 : Math.min(paid, unit * usedUnits), base = paid - deduct, fee = full ? 0 : Math.round((base * ty.refundFee) / 100)
  return { paid, full, usedUnits, unit, unitName: c.total ? '次' : '天', deduct, fee, gift: freeUnits, amount: Math.max(0, base - fee), orig: ty.orig || paid, paidUnits, feeRate: ty.refundFee }
}

/* ---------- 写账：扣次记录、消息、储值流水 ---------- */
const nextId = (list) => list.reduce((m, x) => Math.max(m, x.id), 0) + 1
export function logCard(c, action, note, delta = 0) {
  const db = state.db
  db.cardLogs.unshift({ id: nextId(db.cardLogs), cardNo: c.no, userName: db.me.name, at: B.fmt(B.NOW()), action, operator: '本人', store: '小程序', note: note || '', delta })
}
export function pushNotice(kind, title, body, jump) {
  const db = state.db
  db.notices.unshift({ id: nextId(db.notices), kind, title, body, at: B.fmt(B.NOW()), read: false, jump: jump || null })
}
export const giftOf = () => Math.min(state.db.me.giftBalance || 0, state.db.me.balance)
/** 储值流水：本金与赠送金分开记，余额随流水一起变，不会为负 */
export function walletLog(kind, principal, gift, ref) {
  const db = state.db, me = db.me
  if (me.balance + principal + gift < 0) throw new Error('储值余额不足')
  me.balance += principal + gift
  me.giftBalance = Math.max(0, (me.giftBalance || 0) + gift)
  db.walletLogs.unshift({ id: nextId(db.walletLogs), userId: me.id, userName: me.name, kind, amount: principal + gift, principal, gift, balance: me.balance, at: B.fmt(B.NOW()), ref })
}
/** 用储值余额付款：消费时本金与赠送金按比例同时扣减（向下取整） */
export function spendBalance(cents, ref) {
  const me = state.db.me
  if (cents > me.balance) throw new Error('储值余额不足，请换一种支付方式')
  const g = Math.floor((cents * giftOf()) / Math.max(1, me.balance))
  walletLog('消费', -(cents - g), -g, ref)
}
</script>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useScene, setScene } from '../../shared/state.js'
import { maskPhone } from '../../shared/format.js'
import { useNav } from '../nav.js'

const { go, back } = useNav()
const route = useRoute()
const scene = useScene('card-detail')
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)
const guest = computed(() => state.role === 'guest')

/* ---------- 这张卡：地址里的 id；没有 id 时取第一张在用的卡（演示面板直达） ---------- */
const card = computed(() => {
  const mine = myCards(), id = Number(route.query.id) || 0
  return id ? mine.find((c) => c.id === id) || null : mine.find(isHeld) || mine[0] || null
})
/** 场景把这张卡“演成”某个状态：只改显示，不改数据 */
function view(c, sc) {
  const t = today(), v = { ...c }, cur = cardState(c).key
  if (sc === 'frozen' && cur !== 'FROZEN') Object.assign(v, { status: 'FROZEN', frozenFrom: addD(t, -1), frozenTo: addD(t, 5), frozenDays: 7, expire: addD(c.expire, 7) })
  if (sc === 'lost') v.status = 'LOST'
  if (sc === 'expired') Object.assign(v, { status: 'EXPIRED', expire: addD(t, -3) })
  if (sc === 'usedup' && c.total) v.used = c.total
  else if (sc === 'usedup') Object.assign(v, { status: 'EXPIRED', expire: addD(t, -1) })
  if (sc === 'pending') Object.assign(v, { start: addD(t, 3), expire: addD(t, 3 + (typeFor(c).days || 30)), status: 'ACTIVE' })
  let rf = c.refund && ['REFUNDING', 'REFUNDED'].includes(c.status) ? c.refund : null
  if (/^refund-/.test(sc || '')) {
    const q = quoteRefund(c), step = { 'refund-review': 1, 'refund-doing': 2, 'refund-done': 3, 'refund-rejected': 1 }[sc]
    rf = { amount: q.amount, at: addD(t, -1) + ' 15:20', step, status: sc === 'refund-rejected' ? 'REJECTED' : 'OK', reason: sc === 'refund-rejected' ? '这张卡在审核期间有一次使用记录，需先冲正后再申请' : '' }
    v.status = sc === 'refund-done' ? 'REFUNDED' : sc === 'refund-rejected' ? 'ACTIVE' : 'REFUNDING'
  }
  return { v, rf }
}
const viewed = computed(() => (card.value ? view(card.value, scene.value) : null))
const v = computed(() => viewed.value.v)
const rf = computed(() => viewed.value.rf)
const st = computed(() => cardState(v.value))
const face = computed(() => faceOf(v.value, st.value))
const ty = computed(() => typeFor(card.value))
const status = computed(() => (phase.value !== 'ok' ? phase.value : card.value ? 'ok' : 'empty'))
const faceClass = computed(() => (face.value.dead ? 'is-dead' : ['LOST', 'REFUNDING'].includes(st.value.key) ? 'is-warn' : 'is-live'))
const done = () => { if (scene.value) setScene('card-detail', null); document.getElementById('screen')?.scrollTo({ top: 0 }) }

/* ---------- 冻结额度、操作行能不能点 ---------- */
const fr = computed(() => ty.value.freeze)
const frLeft = computed(() => (fr.value ? Math.max(0, fr.value.total - (card.value.frozenTotal || 0)) : 0))
const frTimes = computed(() => (fr.value ? Math.max(0, fr.value.times - (card.value.freezeCount || 0)) : 0))
const rq = computed(() => quoteRefund(card.value))
const why = computed(() => {
  const k = st.value.key, c = card.value, t = today(), tr = ty.value.transfer
  const live = ['ACTIVE', 'PENDING'].includes(k), alive = ['ACTIVE', 'PENDING', 'FROZEN'].includes(k)
  return {
    freeze: !fr.value ? '这个卡种不支持请假冻结' : k === 'FROZEN' ? '已在冻结中；要提前恢复，请点上方“提前解冻”' : k === 'PENDING' ? '未生效的卡不能冻结' : !live ? '当前状态不能冻结（' + st.value.label + '）' : !frTimes.value ? '冻结次数已用完（最多 ' + fr.value.times + ' 次）' : frLeft.value < fr.value.min ? '累计可冻结天数不足 ' + fr.value.min + ' 天' : null,
    transfer: !tr ? '这个卡种不可转让' : !live ? (k === 'FROZEN' ? '冻结中的卡不能转让，请先提前解冻' : '当前状态不能转让（' + st.value.label + '）') : (c.transferCount || 0) >= tr.times ? '这张卡已转让过 ' + tr.times + ' 次，不能再转让' : c.transferAt && diff(c.transferAt, t) < tr.cool ? '转让冷却期内，' + (tr.cool - diff(c.transferAt, t)) + ' 天后可再转让' : null,
    lost: k === 'LOST' ? '已挂失；要补办，请点上方“补办新卡”' : !alive ? '当前状态不能挂失（' + st.value.label + '）' : null,
    refund: k === 'EXPIRED' ? '已过期的卡不予退款' : k === 'USEDUP' ? '次数已用完，没有可退金额' : k === 'LOST' ? '挂失中的卡请先补办再退卡' : k === 'REFUNDING' ? '退卡申请处理中，进度见下方' : k === 'REFUNDED' ? '已退卡' : rq.value.amount <= 0 ? '已使用部分超过实付，没有可退金额' : null,
  }
})
const actions = computed(() => {
  const tr = ty.value.transfer, q = rq.value
  return [
    { key: 'freeze', icon: 'pause-circle-o', title: '请假冻结', sub: fr.value ? '暂停计时、到期日顺延；还可冻结 ' + frLeft.value + ' 天、' + frTimes.value + ' 次' : '', on: openFreeze },
    { key: 'transfer', icon: 'exchange', title: '转让给他人', sub: tr ? (tr.fee ? '手续费 ' + money(tr.fee) : '免手续费') + '，对方须是已注册会员' : '', on: openTransfer },
    { key: 'lost', icon: 'lock', title: '挂失', sub: '挂失后立即不能使用，可补办新卡（补办费 ' + money(ty.value.reissue) + '）', on: lostConfirm, danger: true },
    { key: 'refund', icon: 'revoke', title: '退卡', sub: q.full ? '付款 7 日内未使用，可全额退 ' + money(q.amount) : '预计可退 ' + money(q.amount) + '，先试算再决定', on: openRefund, danger: true },
  ].map((a) => ({ ...a, bad: !!why.value[a.key] }))
})

/* ---------- 状态说明与唯一的修复动作 ---------- */
const banner = computed(() => {
  const k = st.value.key, x = v.value
  return {
    FROZEN: { text: '冻结至 ' + frozenRange(x).to + '，期间不能使用，有效期已顺延到 ' + x.expire, action: { label: '提前解冻', on: unfreeze } },
    LOST: { text: '这张卡已挂失，现在不能使用；补办后换新卡号，剩余权益全部保留', action: { label: '补办新卡', on: () => (sheet.value = 'reissue') } },
    PENDING: { text: '这张卡 ' + startOf(x) + ' 零点生效，生效前不能使用' },
    REFUNDING: { text: '退卡申请处理中，这张卡暂停使用，驳回后会恢复原状态' },
    EXPIRED: { text: '这张卡已过期，不能再使用或退款' },
    USEDUP: { text: '次数已经用完，不能再使用' },
    REFUNDED: { text: '退款已到账，这张卡已终止' },
  }[k] || null
})

/* ---------- 退卡进度 ---------- */
const STEPS = ['已提交', '审核中', '退款中', '已到账']
const rfNote = computed(() => (rf.value.status === 'REJECTED' ? '申请被驳回：' + rf.value.reason + '。这张卡已恢复为原状态，可以继续使用。' : rf.value.step >= 3 ? '退款已原路退回，请查看支付渠道到账通知。' : rf.value.step === 2 ? '退款已发起，通常 1 到 3 个工作日到账。' : '审核通过后进入退款，期间这张卡暂停使用。'))

/* ---------- 使用规则与用卡记录 ---------- */
const openRules = ref([])
const rules = computed(() => rulesOf(ty.value))
const shown = ref(5)
const logs = computed(() => state.db.cardLogs.filter((l) => l.cardNo === card.value.no).slice().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)))
const deltaOf = (l) => (l.delta != null ? l.delta : l.action === '冲正' ? 1 : l.action === '核销扣次' ? -1 : 0)

/* ---------- 弹层：冻结、转让、补办、退卡共用一个底部弹层 ---------- */
const sheet = ref(null)
const sheetOpen = computed({ get: () => !!sheet.value, set: (x) => { if (!x) sheet.value = null } })
const SHEET_TITLE = { freeze: '请假冻结', transfer: '转让会员卡', reissue: '补办新卡', refund: '退卡试算' }
const busy = ref(false), err = ref('')
const openSheet = (name) => { err.value = ''; busy.value = false; sheet.value = name }

/* 冻结 */
const fz = reactive({ from: '', to: '' })
const calOpen = ref(false)
const calMin = computed(() => toDate(today()))
const calMax = computed(() => toDate(addD(today(), 7 + (fr.value ? fr.value.max : 15) - 1)))
const fzCheck = computed(() => {
  const f = fr.value, t = today()
  if (!f || !fz.from || !fz.to) return { days: 0, e: '' }
  const days = diff(fz.from, fz.to) + 1
  let e = ''
  if (fz.to < fz.from) e = '结束日期不能早于开始日期'
  else if (fz.from > addD(t, 7)) e = '开始日期最晚是 7 天后'
  else if (!frTimes.value) e = '这张卡最多冻结 ' + f.times + ' 次，已经用完'
  else if (days < f.min) e = '单次最少冻结 ' + f.min + ' 天'
  else if (days > f.max) e = '单次最多冻结 ' + f.max + ' 天'
  else if (days > frLeft.value) e = '累计还可以冻结 ' + frLeft.value + ' 天，已经冻结了 ' + (card.value.frozenTotal || 0) + ' 天'
  return { days, e }
})
function openFreeze() { fz.from = today(); fz.to = addD(today(), fr.value.min - 1); openSheet('freeze') }
const onRange = ([a, b]) => { fz.from = K.ymd(a); fz.to = K.ymd(b); calOpen.value = false; err.value = '' }
async function submitFreeze() {
  const { days, e } = fzCheck.value, c = card.value, t = today()
  if (e || !days) { err.value = e || '请选择冻结的开始和结束日期'; return }
  busy.value = true; err.value = ''
  try { await request(700) } catch (x) { err.value = x.message + '，冻结没有提交，请稍后再试'; busy.value = false; return }
  c.freezeCount = (c.freezeCount || 0) + 1; c.frozenTotal = (c.frozenTotal || 0) + days; c.expire = addD(c.expire, days)
  if (fz.from <= t) { c.status = 'FROZEN'; c.frozenFrom = fz.from; c.frozenTo = fz.to; c.frozenDays = days } else c.freezePlan = { from: fz.from, to: fz.to, days }
  logCard(c, '冻结', '冻结 ' + days + ' 天（' + fz.from + ' 至 ' + fz.to + '），到期日顺延')
  busy.value = false; sheet.value = null; say(fz.from <= t ? '已冻结，到期日已顺延' : '已预约冻结', 'success'); done()
}
async function unfreeze() {
  const c = card.value, t = today(), f = frozenRange(v.value), plan = diff(f.from, f.to) + 1, used = Math.min(plan, Math.max(1, diff(f.from, t) + 1)), backDays = plan - used, newExp = addD(v.value.expire, -backDays)
  try { await showConfirmDialog({ title: '提前解冻', message: '提前解冻后立即恢复使用。实际冻结 ' + used + ' 天，有效期由 ' + v.value.expire + ' 调整为 ' + newExp + '。', confirmButtonText: '解冻', teleport: '#phone-overlay' }) } catch { return }
  try { await request(700) } catch (x) { return say(x.message + '，解冻没有成功', 'fail') }
  if (c.status === 'FROZEN') { c.status = 'ACTIVE'; c.expire = addD(c.expire, -backDays); c.frozenTotal = Math.max(0, (c.frozenTotal || 0) - backDays); c.frozenFrom = c.frozenTo = ''; c.frozenDays = 0; logCard(c, '解冻', '提前解冻，实际冻结 ' + used + ' 天') }
  say('已解冻，可以继续使用', 'success'); done()
}
async function cancelPlan() {
  const c = card.value, p = c.freezePlan
  try { await showConfirmDialog({ title: '取消冻结预约', message: '取消 ' + p.from + ' 至 ' + p.to + ' 的冻结预约，有效期会恢复为 ' + addD(c.expire, -p.days) + '。', confirmButtonText: '取消预约', cancelButtonText: '保留', teleport: '#phone-overlay' }) } catch { return }
  try { await request(600) } catch (x) { return say(x.message + '，取消没有成功', 'fail') }
  c.expire = addD(c.expire, -p.days); c.frozenTotal = Math.max(0, (c.frozenTotal || 0) - p.days); c.freezeCount = Math.max(0, (c.freezeCount || 0) - 1); c.freezePlan = null
  logCard(c, '取消冻结', '取消冻结预约'); say('已取消预约', 'success'); done()
}

/* 转让 */
const tr = reactive({ phone: '' })
const demoPhone = computed(() => (state.db.users.find((u) => u.id !== state.db.me.id && u.status === 'ENABLED') || {}).phone || '')
function openTransfer() { tr.phone = ''; openSheet('transfer') }
async function submitTransfer() {
  const c = card.value, rule = ty.value.transfer, p = tr.phone.trim(), t = today()
  err.value = ''
  if (!/^1[3-9]\d{9}$/.test(p)) { err.value = '请输入正确的 11 位手机号'; return }
  if (p === state.db.me.phone) { err.value = '不能转让给自己'; return }
  busy.value = true
  try { await request(600) } catch (x) { err.value = x.message + '，请稍后再试'; busy.value = false; return }
  const to = state.db.users.find((u) => u.phone === p)
  if (!to) { err.value = '该手机号还没有注册，请对方先打开小程序完成注册'; busy.value = false; return }
  if (to.status === 'DISABLED') { err.value = '对方账号暂时不能接收会员卡'; busy.value = false; return }
  const brief = c.total ? '剩余 ' + (c.total - c.used) + ' 次' : '有效期至 ' + c.expire
  try {
    await showConfirmDialog({ title: '确认转让', message: '把「' + c.typeName + '」（' + brief + '）转让给 ' + to.name.slice(0, 1) + '*（' + maskPhone(to.phone) + '）。' + (rule.fee ? '需支付手续费 ' + money(rule.fee) + '。' : '') + '转让后你不再持有这张卡，且不能撤回。', confirmButtonText: rule.fee ? '支付手续费并转让' : '确认转让', confirmButtonColor: 'var(--luz-danger)', teleport: '#phone-overlay' })
  } catch { busy.value = false; return }
  if (rule.fee) {
    const res = await payWx(scene.value, { amount: rule.fee, subject: '会员卡转让手续费' })
    if (!res.ok) { err.value = '手续费没有支付成功：' + res.reason + '，转让没有生效，卡仍在你名下'; busy.value = false; return }
  }
  c.userId = to.id; c.userName = to.name; c.transferCount = (c.transferCount || 0) + 1; c.transferAt = t
  logCard(c, '转让', '转让给 ' + to.name.slice(0, 1) + '*')
  busy.value = false; sheet.value = null; if (scene.value) setScene('card-detail', null); say('已转让给 ' + to.name.slice(0, 1) + '*', 'success'); back()
}

/* 挂失与补办 */
async function lostConfirm() {
  const c = card.value
  try { await showConfirmDialog({ title: '挂失会员卡', message: '确认挂失「' + c.typeName + '」（卡号尾号 ' + c.no.slice(-4) + '）？挂失后这张卡立即不能使用，点单抵扣也不可用。可以随时补办，补办费 ' + money(ty.value.reissue) + '，换新卡号，剩余权益全部保留。', confirmButtonText: '确认挂失', confirmButtonColor: 'var(--luz-danger)', teleport: '#phone-overlay' }) } catch { return }
  try { await request(700) } catch (x) { return say(x.message + '，挂失没有成功，请稍后再试', 'fail') }
  c.prevStatus = c.status; c.status = 'LOST'; logCard(c, '挂失', '本人挂失')
  say('已挂失，这张卡不能再使用', 'success'); done()
}
async function submitReissue() {
  const c = card.value, fee = ty.value.reissue
  busy.value = true; err.value = ''
  const res = await payWx(scene.value, { amount: fee, subject: '补办' + c.typeName })
  if (!res.ok) { err.value = '补办费没有支付成功：' + res.reason + '。卡仍是挂失状态，可以再试。'; busy.value = false; return }
  const old = c.no, nn = 'C' + (20260000 + c.id * 53 + 7 * ((c.reissueCount || 0) + 1))
  state.db.cardLogs.filter((l) => l.cardNo === old).forEach((l) => { l.cardNo = nn })
  c.no = nn; c.reissueCount = (c.reissueCount || 0) + 1; c.status = c.prevStatus && c.prevStatus !== 'LOST' ? c.prevStatus : 'ACTIVE'
  logCard(c, '补办', '补办新卡，原卡号尾号 ' + old.slice(-4) + ' 作废')
  busy.value = false; sheet.value = null; say('补办成功，新卡号尾号 ' + nn.slice(-4), 'success'); done()
}

/* 退卡 */
const rqLines = computed(() => {
  const q = rq.value
  return q.full ? [['实付金额', money(q.paid)], ['付款 7 日内且未使用', '全额退还']] : [['实付金额', money(q.paid)], ['已使用 ' + q.usedUnits + ' ' + q.unitName + '（原价 ' + money(q.orig) + ' ÷ ' + q.paidUnits + ' ' + q.unitName + '）', '−' + money(q.deduct)], ['剩余价值', money(q.paid - q.deduct)], ['手续费（' + q.feeRate + '%，按剩余价值计）', '−' + money(q.fee)]]
})
const openRefund = () => openSheet('refund')
async function submitRefund() {
  const c = card.value, q = rq.value
  err.value = ''
  try { await showConfirmDialog({ title: '提交退卡申请', message: '确认为「' + c.typeName + '」提交退卡申请？预计退回 ' + money(q.amount) + '。提交后这张卡立即暂停使用，审核通过后终止，不能撤回。', confirmButtonText: '提交申请', confirmButtonColor: 'var(--luz-danger)', teleport: '#phone-overlay' }) } catch { return }
  busy.value = true
  try { await request(800) } catch (x) { err.value = x.message + '，申请没有提交，请稍后再试'; busy.value = false; return }
  c.prevStatus = c.status; c.status = 'REFUNDING'; c.refund = { amount: q.amount, fee: q.fee, at: B.fmt(B.NOW()), step: 1, status: 'OK', reason: '' }
  logCard(c, '退卡申请', '申请退卡，预计退回 ' + money(q.amount))
  pushNotice('会员卡', '退卡申请已提交', '「' + c.typeName + '」退卡申请已提交，预计退回 ' + money(q.amount) + '，审核通过后原路退回。', { page: 'card-detail', params: { id: c.id } })
  busy.value = false; sheet.value = null; say('退卡申请已提交', 'success'); done()
}
</script>

<template>
  <div class="mp-page">
    <MiniState v-if="guest" status="forbidden">
      <template #forbidden-action><van-button round type="primary" @click="go('login')">去登录</van-button></template>
    </MiniState>
    <MiniState v-else :status="status" empty-text="这张卡不存在或已转让；转让给他人的卡不再显示在你的账户里" @retry="load">
      <template #empty-action><van-button round type="primary" @click="back()">返回我的会员卡</van-button></template>

      <!-- 主角：卡面（还能用多少、到哪天） -->
      <section class="brand-card" :class="faceClass" aria-label="会员卡">
        <div class="brand-top">
          <span class="brand-name">{{ v.typeName }}</span>
          <van-tag round v-bind="tagOf(face.chip, face.live)">{{ face.chip.label }}</van-tag>
        </div>
        <div class="brand-hero"><span>{{ face.label }}</span><b class="num brand-n">{{ face.n }}</b><span>{{ face.unit }}</span></div>
        <div class="brand-sub"><span>{{ face.exp }}</span><span>卡号尾号 {{ v.no.slice(-4) }}</span></div>
      </section>

      <!-- 状态说明与唯一的修复动作 -->
      <van-cell-group v-if="banner" inset>
        <van-cell center :icon="st.key === 'LOST' ? 'warning-o' : 'info-o'" :title="banner.text" :class="{ bad: st.key === 'LOST' }">
          <template v-if="banner.action" #right-icon><van-button type="primary" round class="banner-btn" @click="banner.action.on()">{{ banner.action.label }}</van-button></template>
        </van-cell>
      </van-cell-group>
      <van-cell-group v-else-if="card.freezePlan" inset>
        <van-cell center icon="info-o" :title="'已预约 ' + card.freezePlan.from + ' 至 ' + card.freezePlan.to + ' 冻结，到期日已顺延到 ' + card.expire">
          <template #right-icon><van-button type="primary" plain round class="banner-btn" @click="cancelPlan">取消预约</van-button></template>
        </van-cell>
      </van-cell-group>

      <!-- 操作：每行说明做什么，或为什么不能做 -->
      <van-cell-group inset title="卡片操作">
        <van-cell
          v-for="a in actions" :key="a.key" :icon="a.icon" :title="a.title" :label="a.bad ? why[a.key] : a.sub" :is-link="!a.bad" clickable
          :class="{ off: a.bad, danger: a.danger && !a.bad }" :aria-disabled="a.bad ? 'true' : null" @click="a.bad ? say(why[a.key]) : a.on()"
        />
      </van-cell-group>

      <!-- 退卡进度 -->
      <van-cell-group v-if="rf" inset title="退卡进度">
        <van-cell title="预计退回" :value="money(rf.amount)" value-class="num" />
        <div class="steps">
          <van-steps :active="rf.step" :active-color="rf.status === 'REJECTED' ? 'var(--luz-danger)' : undefined">
            <van-step v-for="(s, i) in STEPS" :key="s">{{ rf.status === 'REJECTED' && i === 1 ? '已驳回' : s }}</van-step>
          </van-steps>
        </div>
        <van-cell :title="rfNote" :class="{ bad: rf.status === 'REJECTED' }" :label="'提交时间 ' + rf.at" />
      </van-cell-group>

      <!-- 使用规则 -->
      <van-cell-group inset>
        <van-collapse v-model="openRules">
          <van-collapse-item title="使用规则" name="rules">
            <van-cell-group :border="false"><van-cell v-for="[k, t] in rules" :key="k" :title="k" :label="t" /></van-cell-group>
          </van-collapse-item>
        </van-collapse>
      </van-cell-group>

      <!-- 用卡记录 -->
      <van-cell-group inset title="用卡记录">
        <van-cell title="累计已用" :value="card.used + ' 次'" value-class="num" />
        <van-cell v-for="l in logs.slice(0, shown)" :key="l.id" :title="l.action" :label="(l.store || '') + (l.store && l.note ? ' · ' : '') + l.note || undefined">
          <template #value>
            <div class="log-r"><b v-if="deltaOf(l)" class="num" :class="{ plus: deltaOf(l) > 0 }">{{ deltaOf(l) > 0 ? '+' : '−' }}{{ Math.abs(deltaOf(l)) }} 次</b><span class="num log-at">{{ l.at.slice(0, 16) }}</span></div>
          </template>
        </van-cell>
        <van-cell v-if="logs.length > shown" is-link :title="'查看更多（还有 ' + (logs.length - shown) + ' 条）'" @click="shown += 10" />
        <van-cell v-if="!logs.length" title="还没有使用记录，到店使用后会显示在这里" />
      </van-cell-group>
    </MiniState>

    <!-- 冻结、转让、补办、退卡 -->
    <van-popup v-model:show="sheetOpen" position="bottom" round class="sheet-popup" :close-on-click-overlay="!busy">
      <div v-if="card" class="sheet">
        <h2 class="sheet-title">{{ SHEET_TITLE[sheet] }}</h2>
        <div class="sheet-body">

        <template v-if="sheet === 'freeze'">
          <p class="sheet-note">本卡累计还可冻结 {{ frLeft }} 天（已冻结 {{ card.frozenTotal || 0 }} 天），还能冻结 {{ frTimes }} 次；每次 {{ fr.min }} 到 {{ fr.max }} 天。冻结期间不能使用，也不会计入有效期；开始日期晚于今天时按预约处理。</p>
          <van-cell-group inset>
            <van-cell title="冻结日期" is-link value="修改" :label="fz.from ? fz.from + ' 至 ' + fz.to : '请选择开始和结束日期'" @click="calOpen = true" />
            <van-cell v-if="fzCheck.e" icon="warning-o" :title="fzCheck.e" class="bad" />
            <van-cell v-else-if="fzCheck.days" :title="'冻结 ' + fzCheck.days + ' 天'" :label="'有效期 ' + card.expire + ' → ' + addD(card.expire, fzCheck.days)" />
          </van-cell-group>
        </template>

        <template v-else-if="sheet === 'transfer'">
          <van-cell-group inset>
            <van-cell v-for="x in [card.total ? '剩余 ' + (card.total - card.used) + ' 次全部转给对方' : '剩余有效期（至 ' + card.expire + '）全部转给对方', '转让后你不再持有这张卡，不能撤回', ty.transfer.fee ? '转让手续费 ' + money(ty.transfer.fee) + '，支付成功后才完成转让' : '本次转让免手续费', '同一张卡最多转让 ' + ty.transfer.times + ' 次，转让后 ' + ty.transfer.cool + ' 天内不能再转', '对方必须是已注册会员']" :key="x" :title="x" icon="info-o" />
          </van-cell-group>
          <van-cell-group inset>
            <van-field v-model="tr.phone" class="big-field" type="tel" inputmode="numeric" maxlength="11" label="对方手机号" placeholder="对方的 11 位手机号" clearable @update:model-value="err = ''" />
          </van-cell-group>
          <p class="sheet-note">演示：可输入已注册的 {{ demoPhone }}；输入 13900000000 会提示对方还没有注册。</p>
        </template>

        <template v-else-if="sheet === 'reissue'">
          <van-cell-group inset>
            <van-cell v-for="x in ['补办费 ' + money(ty.reissue) + '，补办条款已在购卡时写明', '换新卡号，原卡号（尾号 ' + card.no.slice(-4) + '）作废', '剩余' + (card.total ? '次数' : '有效期') + '、冻结记录、用卡记录全部保留']" :key="x" :title="x" icon="info-o" />
          </van-cell-group>
        </template>

        <template v-else-if="sheet === 'refund'">
          <div class="rf-hero"><span class="muted">预计可退</span><b class="num rf-n">{{ money(rq.amount) }}</b></div>
          <van-cell-group inset>
            <van-cell v-for="[k, x] in rqLines" :key="k" :title="k" :value="x" value-class="num" />
          </van-cell-group>
          <p v-if="rq.gift" class="sheet-note">赠送的 {{ rq.gift }} 次不折现，也不计入退款。</p>
          <p class="sheet-note">退款原路退回，通常 1 到 3 个工作日到账。提交后这张卡暂停使用；审核驳回会恢复原状态。{{ st.key === 'FROZEN' ? '冻结中的卡退卡前会先按今天结束冻结再报价。' : '' }}</p>
        </template>

        </div>
        <van-notice-bar v-if="err" class="alert-bad" left-icon="warning-o" wrapable :scrollable="false" :text="err" />

        <div class="sheet-foot">
          <van-button block plain :disabled="busy" @click="sheet = null">{{ sheet === 'refund' ? '再想想' : '取消' }}</van-button>
          <van-button v-if="sheet === 'freeze'" block type="primary" :loading="busy" :disabled="!!fzCheck.e" @click="submitFreeze">确认冻结</van-button>
          <van-button v-else-if="sheet === 'transfer'" block type="primary" :loading="busy" :disabled="tr.phone.length < 11" @click="submitTransfer">下一步</van-button>
          <van-button v-else-if="sheet === 'reissue'" block type="primary" :loading="busy" @click="submitReissue">支付 {{ money(ty.reissue) }}</van-button>
          <van-button v-else-if="sheet === 'refund'" block type="danger" :loading="busy" @click="submitRefund">提交退卡申请</van-button>
        </div>
      </div>
    </van-popup>

    <van-calendar :show-mark="false" :closeable="false" v-model:show="calOpen" type="range" title="选择冻结日期" :min-date="calMin" :max-date="calMax" :allow-same-day="true" color="var(--luz-action)" confirm-text="确定" @confirm="onRange" />
  </div>
</template>

<style scoped>
.mp-page { --van-calendar-confirm-button-height: 44px; --van-cell-group-inset-title-padding: 12px 4px 4px; padding-bottom: 32px; }
.brand-card { padding: 16px; border-radius: var(--luz-radius-card); background: var(--luz-action); color: var(--luz-on-action); box-shadow: var(--luz-level-2); }
.brand-card.is-dead { background: var(--luz-surface); color: var(--luz-ink); box-shadow: none; border: 1px solid var(--luz-line); }
.brand-card.is-warn { background: var(--luz-warning-tint); color: var(--luz-ink); box-shadow: none; }
.brand-top, .brand-sub { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.brand-name { font-size: var(--t18); line-height: 26px; font-weight: 600; }
.brand-hero { display: flex; align-items: baseline; gap: 6px; margin: 12px 0; }
.brand-n { font-size: var(--t40); line-height: 48px; font-weight: 700; }
.brand-sub { font-size: var(--t14); }
.brand-sub span:last-child { white-space: nowrap; }
.banner-btn { flex: none; margin-left: 12px; }
.big-field { --van-cell-line-height: 40px; }
.bad { --van-cell-text-color: var(--luz-danger); --van-cell-icon-size: 18px; }
.off { --van-cell-text-color: var(--luz-ink-3); }
.danger { --van-cell-icon-color: var(--luz-danger); }
.steps { padding: 12px 16px 4px; background: var(--van-background-2); }
.log-r { display: grid; justify-items: end; }
.log-r b { font-weight: 600; }
.log-r .plus { color: var(--luz-success); }
.log-at { color: var(--luz-ink-3); font-size: var(--t14); }
.sheet-popup { display: flex; flex-direction: column; max-height: 80%; }
.sheet { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; gap: 12px; padding: 20px 0 16px; }
.sheet-body { display: grid; grid-auto-rows: max-content; gap: 12px; align-content: start; overflow-y: auto; min-height: 0; }
.sheet-title { margin: 0; padding: 0 16px; font-size: var(--t18); line-height: 26px; font-weight: 600; }
.sheet-note { margin: 0; padding: 0 16px; color: var(--luz-ink-2); }
.sheet-foot { display: flex; gap: 12px; padding: 4px 16px 0; }
.alert-bad { --van-notice-bar-background: var(--luz-danger-tint); --van-notice-bar-text-color: var(--luz-danger); margin: 0 16px; border-radius: var(--luz-radius-control); }
.rf-hero { display: grid; justify-items: center; gap: 4px; }
.rf-n { font-size: var(--t32); line-height: 40px; font-weight: 700; color: var(--luz-price); }
</style>
