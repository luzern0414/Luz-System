<script>
// 会员卡：主区加右侧窄栏。主区是已发卡（默认只看生效中）、卡种设置、扣次记录；右侧是到期提醒、今日扣次、卡种销量。
export const meta = {
  id: 'cards', label: '会员卡', icon: 'card', group: '会员', order: 2, roles: ['A', 'F'],
  layout: '主区加右侧窄栏',
  reason: '前台和店长的日常是在已发卡里找人、扣次、处理冻结和退卡，这是主区；即将到期、今日扣次和卡种销量只是提醒和参照，放在滚动时停留的右侧窄栏里',
  scenes: [
    { id: 'nodata', label: '没有符合条件的卡' },
    { id: 'deduct-device', label: '扣次失败：卡正在另一台设备核销' },
    { id: 'issue-limit', label: '发卡失败：超过预付上限' },
    { id: 'refund-quote-fail', label: '退卡试算失败：查不到原支付单' },
    { id: 'transfer-fail', label: '转让失败：对方手机号不是会员' },
  ],
}
</script>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, Download, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, maskPhone, yuan } from '../../shared/format.js'
import { usePager } from '../use-pager.js'

const route = useRoute()
const router = useRouter()
const scene = useScene('cards')
const mq = window.matchMedia('(max-width: 700px)')          // on a phone the table's action column scrolls with the rest
const narrow = ref(mq.matches)
const onMq = (e) => { narrow.value = e.matches }
mq.addEventListener('change', onMq)
onUnmounted(() => mq.removeEventListener('change', onMq))
const phase = ref('loading')                                    // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }

// ---- helpers: dates are strings (2026-11-04), money is cents
const today = K.ymd(B.NOW())
const pad = K.pad
const nowHM = pad(B.NOW().getHours()) + ':' + pad(B.NOW().getMinutes())
const parse = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
const dAdd = (s, n) => K.ymd(K.addDays(parse(s), n))
const dDiff = (a, b) => Math.round((parse(a) - parse(b)) / 864e5)
const md = (s) => (!s ? '' : s.slice(0, 4) === today.slice(0, 4) ? s.slice(5, 10) + s.slice(10) : s)
const last4 = (p) => p.slice(-4)
const cardNoOf = (id) => 'C' + String(20260000 + id * 53)
const actor = () => (state.role === 'F' ? '陈晓燕' : '王海燕')
const nowStr = () => B.fmt(B.NOW())
const audit = (code, action, target, result = '成功') => {
  const db = state.db
  db.audit.unshift({ id: db.audit.length + 1, at: nowStr(), actor: actor(), code, action, target, result, ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16) })
}
const tgt = (c) => `会员卡 ${c.no}（${c.userName}）`
const isAdmin = computed(() => state.role === 'A')                 // 前台只能找卡、扣次和查看；发卡、冻结、退卡、卡种、导出都是超级管理员的

const CARD_STATUS = { ACTIVE: ['success', '生效中'], FROZEN: ['primary', '已冻结'], LOST: ['warning', '已挂失'], EXPIRED: ['info', '已过期'], USEDUP: ['info', '已用完'], REFUNDED: ['info', '已退卡'], VOID: ['info', '已作废'] }
const TAB_OF = { ACTIVE: 'ACTIVE', FROZEN: 'FROZEN', LOST: 'LOST', EXPIRED: 'EXPIRED', USEDUP: 'EXPIRED', REFUNDED: 'END', VOID: 'END' }
const STATUS_TABS = [['ACTIVE', '生效中'], ['FROZEN', '已冻结'], ['LOST', '已挂失'], ['EXPIRED', '已过期'], ['END', '已终止'], ['ALL', '全部']]
const cardState = (c) => (['REFUNDED', 'VOID', 'LOST', 'FROZEN'].includes(c.status) ? c.status : c.expire < today ? 'EXPIRED' : c.kind === '次卡' && c.total && c.used >= c.total ? 'USEDUP' : 'ACTIVE')
const typeOf = (c) => state.db.cardTypes.find((t) => t.id === c.typeId) || {}
const priceOf = (c) => c.price ?? typeOf(c).price ?? 0
const payOf = (c) => c.pay || '线上'
const frozenFromOf = (c) => c.frozenFrom || dAdd(today, -1)
const logsOf = (c) => state.db.cardLogs.filter((l) => l.cardNo === c.no)
const usedToday = (c) => state.db.cardLogs.find((l) => l.cardNo === c.no && l.action === '核销扣次' && !l.revoked && l.at.slice(0, 10) === today)
const usable = (c) => cardState(c) === 'ACTIVE' && (c.kind === '次卡' || !usedToday(c))
const addLog = (c, action, note = '', operator = actor(), at = nowStr()) => {
  const l = { id: Math.max(0, ...state.db.cardLogs.map((x) => x.id)) + 1, cardNo: c.no, userName: c.userName, at, action, operator, note }
  state.db.cardLogs.unshift(l)
  return l
}
const cards = computed(() => (scene.value === 'nodata' ? [] : state.db.cards))

// ---- why a deduction is refused, written for the person at the counter
function deductCheck(c, at) {
  const st = cardState(c)
  if (st === 'REFUNDED') return '这张卡已退卡，不能再使用'
  if (st === 'VOID') return '这张卡已作废（已补办新卡），请使用新卡'
  if (st === 'LOST') return '这张卡已挂失，不能使用；找回后请先解挂'
  if (st === 'FROZEN') return `这张卡正在冻结中（到 ${md(dAdd(frozenFromOf(c), c.frozenDays))}），期间不能使用；可以先解冻`
  if (st === 'EXPIRED') return `这张卡已于 ${md(c.expire)} 到期`
  if (st === 'USEDUP') return '这张卡的次数已经用完'
  if (c.kind === '时段卡' && c.slot) { const [a, b] = c.slot.split('–'); if (at < a || at > b) return `不在可用时段：这张卡只能在 ${c.slot} 使用，核销时间是 ${at}` }
  if (c.kind !== '次卡') { const l = usedToday(c); if (l) return `今天 ${l.at.slice(11)} 已经扣过 1 次，同一天同一张卡只能扣一次，不会重复扣` }
  return ''
}
function deduct(c, at) {
  const bad = deductCheck(c, at)
  if (bad) throw new Error(bad)
  if (scene.value === 'deduct-device') throw new Error('扣次失败：这张卡正在另一台设备上核销，请 10 秒后再试，次数没有扣')
  c.used += 1
  addLog(c, '核销扣次', '', undefined, today + ' ' + at)
  audit('card:issue', `扣次 1 次（${c.kind === '次卡' ? '剩余 ' + (c.total - c.used) + ' 次' : '今日已用'}）`, tgt(c))
}

// ---- tabs and the three lists
const tab = ref('issued')
watch(isAdmin, (v) => { if (!v) tab.value = 'issued' })
const confirmBox = reactive({ open: false, title: '', text: '', ok: '确认', danger: false, run: null })
const askConfirm = (title, text, ok, run, danger = false) => Object.assign(confirmBox, { open: true, title, text, ok, run, danger })
const rep = reactive({ open: false, title: '', ok: 0, fails: [] })

// ---- issued cards: the default view is 生效中
const blank = () => ({ status: 'ACTIVE', q: '', type: '', exp: '', avail: '', buy: null })
const filter = reactive(blank())
const match = (c, skipStatus) => {
  const st = cardState(c); const q = filter.q.trim()
  if (!skipStatus && filter.status !== 'ALL' && TAB_OF[st] !== filter.status) return false
  if (filter.type && c.typeId !== filter.type) return false
  if (filter.exp && !(st === 'ACTIVE' && dDiff(c.expire, today) <= Number(filter.exp))) return false
  if (filter.avail === 'Y' && !usable(c)) return false
  if (filter.avail === 'N' && usable(c)) return false
  if (filter.buy && (c.bought < filter.buy[0] || c.bought > filter.buy[1])) return false
  if (q) { const u = state.db.users.find((x) => x.id === c.userId); if (!(c.no.includes(q) || c.userName.includes(q) || (u && /^\d{4}$/.test(q) && last4(u.phone) === q))) return false }
  return true
}
const count = (code) => cards.value.filter((c) => match(c, true) && (code === 'ALL' || TAB_OF[cardState(c)] === code)).length
const filtered = computed(() => cards.value.filter((c) => match(c)).sort((a, b) => b.id - a.id))
const issuedPager = usePager('cards')
const rows = issuedPager.slice(filtered)
const dirty = computed(() => filter.status !== 'ACTIVE' || ['q', 'type', 'exp', 'avail', 'buy'].some((k) => filter[k]))
const resetFilter = () => Object.assign(filter, blank())
const issuedStatus = computed(() => (phase.value !== 'ok' ? phase.value : filtered.value.length ? 'ok' : 'empty'))
const picked = ref([])
const table = ref(null)
const clearPick = () => { picked.value = []; table.value?.clearSelection() }
watch(() => ({ ...filter }), () => { issuedPager.reset(); clearPick() })

// ---- the rail
const soon = computed(() => cards.value.filter((c) => cardState(c) === 'ACTIVE' && dDiff(c.expire, today) <= 7).sort((a, b) => (a.expire < b.expire ? -1 : 1)))
const deductLogs = computed(() => state.db.cardLogs.filter((l) => l.action === '核销扣次' && !l.revoked))
const dayN = (d) => deductLogs.value.filter((l) => l.at.slice(0, 10) === d).length
const week = Array.from({ length: 7 }, (_, i) => dAdd(today, i - 6))
const todayN = computed(() => dayN(today))
const yestN = computed(() => dayN(dAdd(today, -1)))
const spark = computed(() => [{ name: '每天扣次数', data: week.map(dayN) }])
const sales = computed(() => { const t = state.db.cardTypes.map((x) => ({ t: x, n: state.db.cards.filter((c) => c.typeId === x.id && c.status !== 'VOID').length })); const mx = Math.max(1, ...t.map((x) => x.n)); return t.map((x) => ({ ...x, pct: (x.n / mx) * 100 })) })
const remainText = (c) => (c.kind === '次卡' ? `剩余 ${Math.max(0, c.total - c.used)} / ${c.total} 次` : `剩 ${Math.max(0, dDiff(c.expire, today))} 天`)

// ---- 扣次: one card (a time-slot card asks for the time), or many with every refusal listed
const dd = reactive({ open: false, c: null, at: nowHM })
function askDeduct(c) {
  const pre = deductCheck(c, c.kind === '时段卡' && c.slot ? c.slot.split('–')[0] : nowHM)
  if (pre) return ElMessage.error(pre)
  Object.assign(dd, { open: true, c, at: nowHM })
}
async function doDeduct() {
  const c = dd.c
  await request(360)
  deduct(c, dd.at)
  ElMessage.success(`已扣次：${c.userName}，${c.kind === '次卡' ? '剩余 ' + (c.total - c.used) + ' 次' : '今日已用'}`)
}
const ddText = computed(() => { const c = dd.c; if (!c) return ''; return c.kind === '次卡' ? `给 ${c.userName} 的「${c.typeName}」扣 1 次，扣后剩余 ${Math.max(0, c.total - c.used - 1)} 次。` : `给 ${c.userName} 的「${c.typeName}」记录今天使用 1 次。同一天只能扣一次。` })
function askBatchDeduct(list) {
  askConfirm('批量扣次', `将为已选的 ${list.length} 张卡各扣 1 次；今天已扣过的期限卡、不能使用的卡会被跳过并说明原因。`, '开始扣次', async () => {
    await request(500)
    let ok = 0; const fails = []
    list.forEach((c) => { try { deduct(c, nowHM); ok += 1 } catch (e) { fails.push({ name: `${c.userName} ${c.no.slice(-5)}`, reason: e.message }) } })
    clearPick()
    Object.assign(rep, { open: true, title: '批量扣次结果', ok, fails })
  })
}

// ---- 冻结（请假）、解冻
const fz = reactive({ open: false, c: null, days: 3, reason: '' })
const fzLeft = computed(() => 60 - (fz.c?.frozenTotal || 0))
const fzError = computed(() => (!Number.isInteger(fz.days) || fz.days < 1 ? '请填写大于 0 的整数天数' : fz.days > 30 ? '单次最多冻结 30 天' : fz.days > fzLeft.value ? `累计最多 60 天，还可冻结 ${fzLeft.value} 天` : ''))
function askFreeze(c) {
  if (60 - (c.frozenTotal || 0) <= 0) return ElMessage.error('这张卡累计冻结已满 60 天，不能再冻结')
  Object.assign(fz, { open: true, c, days: 3, reason: '' })
}
async function doFreeze() {
  const c = fz.c; const n = fz.days
  await request(400)
  c.status = 'FROZEN'; c.frozenFrom = today; c.frozenDays = n; c.frozenTotal = (c.frozenTotal || 0) + n; c.expire = dAdd(c.expire, n)
  addLog(c, '冻结', `请假 ${n} 天，有效期顺延到 ${c.expire}；${fz.reason.trim()}`)
  audit('card:issue', `冻结 ${n} 天：${fz.reason.trim()}`, tgt(c))
  ElMessage.success(`已冻结，有效期顺延到 ${md(c.expire)}`)
}
function askUnfreeze(c) {
  const used = Math.max(0, Math.min(c.frozenDays, dDiff(today, frozenFromOf(c)))); const back = c.frozenDays - used
  askConfirm('提前解冻', `冻结已过 ${used} 天（原计划 ${c.frozenDays} 天），提前解冻后有效期${back ? `收回 ${back} 天，变为 ${md(dAdd(c.expire, -back))}` : `保持 ${md(c.expire)}`}。`, '确认解冻', async () => {
    await request(400)
    c.expire = dAdd(c.expire, -back); c.frozenTotal = Math.max(0, (c.frozenTotal || 0) - back); c.status = 'ACTIVE'; c.frozenFrom = ''; c.frozenDays = 0
    addLog(c, '解冻', `实际冻结 ${used} 天，到期日 ${c.expire}`); audit('card:issue', `提前解冻（实际冻结 ${used} 天）`, tgt(c))
    ElMessage.success(`已解冻，有效期到 ${md(c.expire)}`)
  })
}

// ---- 挂失、解挂、补办
const askLose = (c) => askConfirm('挂失 ' + c.no, `挂失后「${c.userName}」的这张卡立即不能使用，可以补办新卡或找回后解挂。`, '确认挂失', async () => {
  await request(400)
  c.prevStatus = c.status; c.status = 'LOST'; addLog(c, '挂失', '后台办理'); audit('card:issue', '挂失', tgt(c)); ElMessage.success('已挂失 ' + c.no)
}, true)
async function unlose(c) {
  try { await request(360) } catch (e) { return ElMessage.error(e.message + '，没有解挂，请稍后再试') }
  c.status = c.prevStatus === 'FROZEN' ? 'FROZEN' : 'ACTIVE'; addLog(c, '解挂', '会员找回'); audit('card:issue', '解挂', tgt(c)); ElMessage.success('已解挂 ' + c.no)
}
const askReissue = (c) => askConfirm('补办新卡', '补办后换新卡号，原卡号作废，次数和有效期全部保留，不收工本费。', '确认补办', async () => {
  await request(400)
  const id = Math.max(...state.db.cards.map((x) => x.id)) + 1
  const made = { ...c, id, no: cardNoOf(id), status: 'ACTIVE', prevStatus: '', reissuedFrom: c.no }
  c.status = 'VOID'; state.db.cards.unshift(made)
  addLog(c, '补办', '原卡号作废，新卡号 ' + made.no); addLog(made, '开卡', `补办，沿用原卡权益（原卡 ${c.no}）`); audit('card:issue', '补办新卡 ' + made.no, tgt(c))
  ElMessage.success('已补办，新卡号 ' + made.no)
})

// ---- 转让：对方必须已经是会员
const tr = reactive({ open: false, c: null, phone: '' })
const trTo = computed(() => state.db.users.find((u) => u.phone === tr.phone.trim()))
const trError = computed(() => (!/^1\d{10}$/.test(tr.phone.trim()) ? '' : !trTo.value ? '没有找到这个手机号的会员' : trTo.value.id === tr.c?.userId ? '不能转让给自己' : trTo.value.status === 'DISABLED' ? '对方账号已禁用，不能受让' : ''))
function askTransfer(c) {
  if ((c.transfers || 0) >= 1) return ElMessage.error('这张卡已转让过 1 次，不能再转让')
  Object.assign(tr, { open: true, c, phone: '' })
}
async function doTransfer() {
  const c = tr.c
  await request(400)
  if (scene.value === 'transfer-fail') throw new Error('转让失败：这个手机号还不是会员，请对方先在小程序注册，卡仍在原持卡人名下')
  const to = trTo.value; const from = c.userName
  c.userId = to.id; c.userName = to.name; c.transfers = (c.transfers || 0) + 1
  addLog(c, '转让', `${from} 转给 ${to.name}（尾号 ${last4(to.phone)}）`); audit('card:issue', `转让：${from} → ${to.name}`, tgt(c))
  ElMessage.success('已转让给 ' + to.name)
}

// ---- 退卡试算：算出可退金额再确认；查不到原支付单时给原因和重试
const rf = reactive({ open: false, c: null, status: 'loading', err: '', q: null, reason: '' })
function quote(c) {
  const ty = typeOf(c); const P = priceOf(c); const days = dDiff(today, c.bought); const rows = []
  let usedAmt; const fullRefund = days <= 7 && c.used === 0
  if (c.kind === '次卡') { const paid = ty.times || c.total; const used = Math.min(c.used, paid); usedAmt = Math.round((P * used) / Math.max(1, paid)); rows.push(['已使用', `${c.used} 次（购买 ${paid} 次，赠送 ${Math.max(0, c.total - paid)} 次不折现）`], ['已用折算', `−${yuan(usedAmt)}（${yuan(P)} ÷ ${paid} 次 × ${used} 次）`]) }
  else { const valid = ty.days || 30; const used = Math.min(c.used, valid); usedAmt = Math.round((P * used) / valid); rows.push(['已使用', `${used} 天，共 ${valid} 天有效`], ['已用折算', `−${yuan(usedAmt)}（${yuan(P)} ÷ ${valid} 天 × ${used} 天）`]) }
  const fee = fullRefund ? 0 : Math.round((P - usedAmt) * 0.05); const refund = fullRefund ? P : Math.max(0, P - usedAmt - fee)
  return { P, fee, refund, fullRefund, rows }
}
async function calcRefund() {
  rf.status = 'loading'
  try {
    await request(500, { fail: scene.value === 'refund-quote-fail' ? new Error('退卡试算失败：查不到这张卡的原支付单，卡的状态没有改变。请稍后重试，或联系财务核对支付记录') : null })
    rf.q = quote(rf.c); rf.status = 'ok'
  } catch (e) { rf.err = e.message; rf.status = 'error' }
}
function askRefund(c) { Object.assign(rf, { open: true, c, status: 'loading', err: '', q: null, reason: '' }); calcRefund() }
async function doRefund() {
  const c = rf.c; const q = rf.q
  await request(500)
  c.status = 'REFUNDED'; c.refundAmount = q.refund; c.refundAt = nowStr()
  addLog(c, '退卡', `退还 ${yuan(q.refund)}；${rf.reason.trim()}`); audit('card:issue', `退卡 ${yuan(q.refund)}：${rf.reason.trim()}`, tgt(c))
  ElMessage.success('已退卡，退还 ' + yuan(q.refund))
}

// ---- 延期
const ex = reactive({ open: false, c: null, days: 7, reason: '' })
const exError = computed(() => (!Number.isInteger(ex.days) || ex.days < 1 ? '请填写大于 0 的整数天数' : ex.days > 90 ? '单次最多延期 90 天' : ex.c && dAdd(ex.c.expire, ex.days) < today ? '延期后仍早于今天，请加大天数' : ''))
const askExtend = (c) => Object.assign(ex, { open: true, c, days: 7, reason: '' })
async function doExtend() {
  const c = ex.c; const old = c.expire
  await request(400)
  c.expire = dAdd(c.expire, ex.days); if (c.status === 'EXPIRED') c.status = 'ACTIVE'
  addLog(c, '延期', `${old} → ${c.expire}；${ex.reason.trim()}`); audit('card:issue', `延期 ${ex.days} 天：${ex.reason.trim()}`, tgt(c))
  ElMessage.success('已延期到 ' + md(c.expire))
}

// ---- 撤销扣次：原因必填，次数退回
const rv = reactive({ open: false, l: null, reason: '' })
function askRevoke(l) {
  const c = state.db.cards.find((x) => x.no === l.cardNo)
  if (!c) return ElMessage.error('找不到这张卡')
  if (['REFUNDED', 'VOID'].includes(c.status)) return ElMessage.error(`这张卡已${c.status === 'VOID' ? '作废' : '退卡'}，不能撤销扣次`)
  Object.assign(rv, { open: true, l, reason: '' })
}
async function doRevoke() {
  const l = rv.l; const c = state.db.cards.find((x) => x.no === l.cardNo)
  await request(400)
  l.revoked = true; c.used = Math.max(0, c.used - 1)
  addLog(c, '撤销扣次', `撤销 ${md(l.at)} 的扣次：${rv.reason.trim()}`); audit('card:issue', `撤销扣次（${md(l.at)}）：${rv.reason.trim()}`, tgt(c))
  ElMessage.success('已撤销，次数已退回')
}

// ---- 人工发卡（会员页的“发卡”也来这里，带着会员）
const iss = reactive({ open: false, uid: null, tid: null, pay: '现金' })
const issUsers = computed(() => state.db.users.filter((u) => u.status === 'ENABLED'))
const issTypes = computed(() => state.db.cardTypes.filter((t) => t.status === 'ON'))
function askIssue(uid) {
  if (!issTypes.value.length) return ElMessage.error('现在没有上架的卡种可以发')
  Object.assign(iss, { open: true, uid: issUsers.value.some((u) => u.id === uid) ? uid : issUsers.value[0].id, tid: issTypes.value[0].id, pay: '现金' })
}
async function doIssue() {
  await request(400)
  const u = state.db.users.find((x) => x.id === iss.uid); const ty = state.db.cardTypes.find((t) => t.id === iss.tid)
  const held = state.db.cards.filter((c) => c.userId === u.id && c.typeId === ty.id && cardState(c) === 'ACTIVE').length
  if (held >= 2) throw new Error(`发卡失败：该会员已持有 ${held} 张生效中的「${ty.name}」，每人最多持有 2 张`)
  if (scene.value === 'issue-limit') throw new Error('发卡失败：该会员的储值与会员卡合计已超过预付上限 ¥5,000.00，没有发卡。请先让会员消费，或改发价格更低的卡种')
  const id = Math.max(0, ...state.db.cards.map((c) => c.id)) + 1
  const made = { id, no: cardNoOf(id), userId: u.id, userName: u.name, typeId: ty.id, typeName: ty.name, kind: ty.kind, bought: today, expire: dAdd(today, ty.days), total: ty.times ? ty.times + ty.gift : 0, used: 0, status: 'ACTIVE', frozenDays: 0, slot: ty.slot || '', price: ty.price, pay: iss.pay, transfers: 0, frozenTotal: 0 }
  state.db.cards.unshift(made)
  addLog(made, '开卡', (iss.pay === '现金' ? '前台现金收款 ' : '线上支付 ') + yuan(ty.price))
  audit('card:issue', `人工发卡「${ty.name}」，${iss.pay} ${yuan(ty.price)}`, tgt(made))
  filter.status = 'ACTIVE'
  ElMessage.success(`已发卡 ${made.no}，会员的会员卡已同步`)
}

// ---- 卡种设置：新建、编辑、上下架。只影响之后新发的卡
const types = computed(() => state.db.cardTypes)
const ty = reactive({ open: false, t: null, f: {} })
const tyForm = ref(null)
const KINDS = ['期限卡', '次卡', '时段卡']
const num = (v) => typeof v === 'number'
const tyRules = {
  name: [{ validator: (_, v, cb) => cb(!v || v.trim().length < 2 ? new Error('名称至少 2 个字') : state.db.cardTypes.some((o) => o !== ty.t && o.name === v.trim()) ? new Error('已经有同名的卡种') : undefined), trigger: 'blur' }],
  price: [{ validator: (_, v, cb) => cb(!num(v) || v <= 0 ? new Error('价格要大于 0') : v > 5000 ? new Error('单张价格不能超过 5000 元（预付上限）') : undefined), trigger: 'blur' }],
  days: [{ validator: (_, v, cb) => cb(!Number.isInteger(v) || v < 1 || v > 365 ? new Error('请填写 1 到 365 的整数') : undefined), trigger: 'blur' }],
  times: [{ validator: (_, v, cb) => cb(ty.f.kind === '次卡' && (!Number.isInteger(v) || v < 1 || v > 200) ? new Error('次卡要填 1 到 200 的整数次数') : undefined), trigger: 'blur' }],
  gift: [{ validator: (_, v, cb) => cb(ty.f.kind === '次卡' && (v || 0) > Math.floor((ty.f.times || 0) * 0.3) ? new Error(`赠送不能超过购买次数的 30%（最多 ${Math.floor((ty.f.times || 0) * 0.3)} 次）`) : undefined), trigger: 'blur' }],
  slot: [{ validator: (_, v, cb) => cb(ty.f.kind === '时段卡' && (!ty.f.slot0 || !ty.f.slot1 || ty.f.slot1 <= ty.f.slot0) ? new Error('请选择开始和结束时间，结束要晚于开始') : undefined), trigger: 'change' }],
}
function askType(t) {
  const d = t || { name: '', kind: '次卡', price: 0, days: 30, times: 10, gift: 0, daily: 0, slot: '', status: 'OFF' }
  const [s0, s1] = (d.slot || '11:00–13:30').split('–')
  Object.assign(ty, { open: true, t, f: { name: d.name, kind: d.kind, price: d.price ? d.price / 100 : undefined, days: d.days, times: d.times || undefined, gift: d.gift || 0, daily: d.daily || undefined, slot0: s0, slot1: s1, status: d.status } })
  tyForm.value?.clearValidate()
}
async function doType() {
  await tyForm.value.validate().catch(() => { throw new Error('请先改正标红的项') })
  await request(400)
  const f = ty.f; const isNew = !ty.t
  const body = { name: f.name.trim(), kind: f.kind, price: Math.round(f.price * 100), days: f.days, times: f.kind === '次卡' ? f.times : 0, gift: f.kind === '次卡' ? f.gift || 0 : 0, daily: f.daily || 0, status: f.status, slot: f.kind === '时段卡' ? f.slot0 + '–' + f.slot1 : '' }
  body.desc = f.kind === '次卡' ? `${body.times} 次${body.gift ? '加赠 ' + body.gift + ' 次' : ''}，${f.days} 天内有效` : f.kind === '时段卡' ? `仅 ${body.slot} 可用，${f.days} 天有效` : `${f.days} 天内每天可用 ${body.daily || 1} 次`
  if (isNew) state.db.cardTypes.push({ id: Math.max(0, ...state.db.cardTypes.map((o) => o.id)) + 1, ...body }); else Object.assign(ty.t, body)
  audit('card:config', (isNew ? '新建' : '修改') + `卡种「${body.name}」`, '卡种 ' + body.name)
  ElMessage.success(isNew ? '已创建卡种 ' + body.name : '已保存 ' + body.name)
}
function askToggleType(t) {
  const n = state.db.cards.filter((c) => c.typeId === t.id && ['ACTIVE', 'FROZEN'].includes(cardState(c))).length; const on = t.status === 'ON'
  askConfirm(on ? '下架 ' + t.name : '上架 ' + t.name, on ? `「${t.name}」下架后，小程序和后台不能再购买或发这个卡种；已经发出的 ${n} 张卡不受影响，照常使用。` : `「${t.name}」上架后可以继续购买和发卡。`, on ? '确认下架' : '确认上架', async () => {
    await request(400)
    t.status = on ? 'OFF' : 'ON'; audit('card:config', (on ? '下架' : '上架') + `卡种「${t.name}」`, '卡种 ' + t.name); ElMessage.success((on ? '已下架 ' : '已上架 ') + t.name)
  }, on)
}

// ---- 扣次记录
const log = reactive({ range: '7', act: '', q: '' })
const RANGES = [{ label: '今天', value: 'today' }, { label: '近 7 天', value: '7' }, { label: '全部', value: 'ALL' }]
const logRows = computed(() => {
  if (scene.value === 'nodata') return []
  const since = log.range === 'today' ? today : log.range === '7' ? dAdd(today, -6) : '0000'; const q = log.q.trim()
  return state.db.cardLogs.filter((l) => ['核销扣次', '撤销扣次'].includes(l.action) && l.at.slice(0, 10) >= since && (!log.act || l.action === log.act) && (!q || l.cardNo.includes(q) || l.userName.includes(q)))
})
const logPager = usePager('card-logs')
const logPage = logPager.slice(logRows)
watch(() => ({ ...log }), () => logPager.reset())
watch(tab, () => { issuedPager.reset(); logPager.reset() })
const logStatus = computed(() => (phase.value !== 'ok' ? phase.value : logRows.value.length ? 'ok' : 'empty'))

// ---- 导出：当前筛选的范围，中文名
function askExport(kind, rowsN, name) {
  askConfirm('导出' + kind, `导出范围：当前筛选结果，共 ${rowsN} 条；表头是中文，状态已翻译，不含内部编号和空列。`, '开始导出', async () => {
    await request(700)
    const file = `${name}_${today}.xlsx`
    state.db.exportTasks.unshift({ id: state.db.exportTasks.length + 1, name: file, kind, rows: rowsN, status: 'DONE', at: nowStr(), by: actor() })
    audit('export', '导出' + kind, file); ElMessage.success(`已生成「${file}」，共 ${rowsN} 条`)
  })
}
const exportIssued = () => askExport('会员卡', filtered.value.length, `会员卡_${STATUS_TABS.find((t) => t[0] === filter.status)[1]}`)
const exportLogs = () => askExport('会员卡扣次', logRows.value.length, `扣次记录_${RANGES.find((r) => r.value === log.range).label}`)

// ---- detail: overview with the actions, use records, operation records
const detail = reactive({ open: false, id: null, tab: 'info' })
const dc = computed(() => state.db.cards.find((c) => c.id === detail.id) || null)
const openDetail = (c) => Object.assign(detail, { open: true, id: c.id, tab: 'info' })
const dUser = computed(() => (dc.value ? state.db.users.find((u) => u.id === dc.value.userId) : null))
const dLogs = computed(() => (dc.value ? logsOf(dc.value) : []))
const dAudit = computed(() => (dc.value ? state.db.audit.filter((a) => a.target === tgt(dc.value)) : []))
const dState = computed(() => (dc.value ? cardState(dc.value) : 'ACTIVE'))
const LOG_TAG = { 核销扣次: 'success', 撤销扣次: 'warning' }

const onMore = (cmd, c) => ({
  freeze: askFreeze, unfreeze: askUnfreeze, lose: askLose, unlose, reissue: askReissue, transfer: askTransfer, refund: askRefund, extend: askExtend,
})[cmd](c)

onMounted(async () => {
  await load()
  const uid = Number(route.query.issue)
  if (uid) {
    router.replace({ query: { ...route.query, issue: undefined } })
    if (!isAdmin.value) return ElMessage.error('前台没有发卡权限')
    const u = state.db.users.find((x) => x.id === uid)
    if (u && u.status === 'DISABLED') return ElMessage.error(`${u.name} 已禁用，不能发卡`)
    askIssue(uid)
  }
})
</script>

<template>
  <div class="lz-page">
    <div class="lz-toolbar">
      <span class="grow" />
      <el-button :icon="Refresh" @click="load">刷新</el-button>
      <el-button v-if="isAdmin && tab === 'issued'" :icon="Download" @click="exportIssued">导出</el-button>
      <el-button v-if="isAdmin" type="primary" :icon="Plus" @click="askIssue()">人工发卡</el-button>
    </div>

    <div class="cards-layout">
      <el-card shadow="never" class="lz-card" aria-label="会员卡">
        <el-tabs v-model="tab">
          <el-tab-pane label="已发卡" name="issued" />
          <el-tab-pane v-if="isAdmin" label="卡种设置" name="types" />
          <el-tab-pane v-if="isAdmin" label="扣次记录" name="logs" />
        </el-tabs>

        <!-- 已发卡 -->
        <template v-if="tab === 'issued'">
          <div class="lz-toolbar filters">
            <el-input v-model="filter.q" clearable placeholder="卡号、姓名或手机号后四位" :prefix-icon="Search" style="width: 250px" aria-label="搜索会员卡" />
            <el-select v-model="filter.type" clearable placeholder="全部卡种" style="width: 130px" aria-label="卡种"><el-option v-for="t in types" :key="t.id" :value="t.id" :label="t.name" /></el-select>
            <el-select v-model="filter.exp" clearable placeholder="到期时间不限" style="width: 148px" aria-label="到期时间"><el-option value="7" label="7 天内到期" /><el-option value="30" label="30 天内到期" /></el-select>
            <el-select v-model="filter.avail" clearable placeholder="今日是否可用" style="width: 138px" aria-label="今日是否可用"><el-option value="Y" label="今日可用" /><el-option value="N" label="今日不可用" /></el-select>
            <div class="range-box"><el-date-picker v-model="filter.buy" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="购买开始" end-placeholder="购买结束" style="width: 100%" aria-label="购买时间" /></div>
            <el-button v-if="dirty" text type="primary" @click="resetFilter">重置筛选</el-button>
          </div>
          <el-tabs v-model="filter.status" class="status-tabs">
            <el-tab-pane v-for="[code, label] in STATUS_TABS" :key="code" :name="code">
              <template #label>{{ label }}<span class="tab-count num" :class="{ zero: !count(code) }">{{ count(code) }}</span></template>
            </el-tab-pane>
          </el-tabs>
          <div v-if="picked.length" class="lz-toolbar batch">
            <span class="num">已选 {{ picked.length }} 张</span><span class="grow" />
            <el-button @click="askBatchDeduct(cards.filter((c) => picked.includes(c.id)))">批量扣次</el-button>
            <el-button text @click="clearPick">取消选择</el-button>
          </div>
          <LzState :status="issuedStatus" empty-title="没有符合条件的会员卡" error-hint="会员卡列表没有加载出来，请检查网络后重试" @retry="load">
            <template #empty-action><el-button v-if="dirty" type="primary" @click="resetFilter">重置筛选</el-button></template>
            <el-table ref="table" :data="rows" size="large" row-key="id" @selection-change="(l) => (picked = l.map((c) => c.id))">
              <el-table-column type="selection" width="46" />
              <el-table-column label="会员与卡" min-width="170">
                <template #default="{ row }"><div><strong>{{ row.userName }}</strong></div><div class="muted num">{{ row.typeName }} · {{ row.no }}</div></template>
              </el-table-column>
              <el-table-column label="有效期至" width="116" align="center"><template #default="{ row }"><span class="num">{{ row.expire }}</span></template></el-table-column>
              <el-table-column label="剩余与今日" width="160" align="center">
                <template #default="{ row }">
                  <template v-if="cardState(row) === 'FROZEN'">冻结至 {{ md(dAdd(frozenFromOf(row), row.frozenDays)) }}</template>
                  <span v-else-if="cardState(row) !== 'ACTIVE'" class="muted">—</span>
                  <div v-else-if="row.kind === '次卡'" class="remain"><span class="num">{{ remainText(row) }}</span><el-progress :percentage="((row.total - row.used) / row.total) * 100" :show-text="false" :stroke-width="6" :aria-label="remainText(row)" /></div>
                  <div v-else class="remain"><el-tag :type="usedToday(row) ? 'info' : 'success'" effect="light">{{ usedToday(row) ? '今日已用' : '今日可用' }}</el-tag><span class="muted num">{{ row.slot ? row.slot + ' · ' : '' }}{{ remainText(row) }}</span></div>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="92" align="center"><template #default="{ row }"><LzStatusTag :type="CARD_STATUS[cardState(row)][0]" :text="CARD_STATUS[cardState(row)][1]" /></template></el-table-column>
              <el-table-column label="操作" :width="isAdmin ? 214 : 170" align="center" :fixed="narrow ? false : 'right'">
                <template #default="{ row }">
                  <el-button text type="primary" :aria-label="'给 ' + row.userName + ' 的 ' + row.no + ' 扣次'" @click="askDeduct(row)">扣次</el-button>
                  <el-button text :aria-label="'查看会员卡 ' + row.no" @click="openDetail(row)">查看</el-button>
                  <el-dropdown v-if="isAdmin" trigger="click" @command="(c) => onMore(c, row)">
                    <el-button text :icon="ArrowDown" :aria-label="'更多操作：' + row.no" />
                    <template #dropdown><el-dropdown-menu>
                      <el-dropdown-item v-if="cardState(row) === 'ACTIVE'" command="freeze">冻结（请假）</el-dropdown-item>
                      <el-dropdown-item v-if="cardState(row) === 'FROZEN'" command="unfreeze">解冻</el-dropdown-item>
                      <el-dropdown-item v-if="['ACTIVE', 'FROZEN'].includes(cardState(row))" command="lose">挂失</el-dropdown-item>
                      <el-dropdown-item v-if="cardState(row) === 'LOST'" command="unlose">解挂</el-dropdown-item>
                      <el-dropdown-item v-if="cardState(row) === 'LOST'" command="reissue">补办新卡</el-dropdown-item>
                      <el-dropdown-item v-if="cardState(row) === 'ACTIVE'" command="transfer">转让</el-dropdown-item>
                      <el-dropdown-item v-if="['ACTIVE', 'FROZEN', 'LOST'].includes(cardState(row))" command="refund">退卡试算</el-dropdown-item>
                      <el-dropdown-item v-if="['ACTIVE', 'FROZEN', 'EXPIRED'].includes(cardState(row))" command="extend">延期</el-dropdown-item>
                      <el-dropdown-item v-if="['USEDUP', 'REFUNDED', 'VOID'].includes(cardState(row))" disabled>这张卡没有可做的操作</el-dropdown-item>
                    </el-dropdown-menu></template>
                  </el-dropdown>
                </template>
              </el-table-column>
            </el-table>
            <LzPager v-model:page="issuedPager.page.value" v-model:size="issuedPager.size.value" :total="filtered.length" />
          </LzState>
        </template>

        <!-- 卡种设置 -->
        <template v-else-if="tab === 'types'">
          <div class="lz-toolbar filters">
            <span class="muted grow">卡种改动只影响之后新发的卡；已发出去的卡按购买时的内容执行，下架也不影响。</span>
            <el-button type="primary" :icon="Plus" @click="askType(null)">新建卡种</el-button>
          </div>
          <el-table :data="types" size="large" row-key="id" empty-text="还没有卡种">
            <el-table-column label="名称" prop="name" width="124" align="center" />
            <el-table-column label="类型" width="88" align="center"><template #default="{ row }"><el-tag type="primary" effect="light">{{ row.kind }}</el-tag></template></el-table-column>
            <el-table-column label="价格（元）" width="108" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.price) }}</span></template></el-table-column>
            <el-table-column label="规则" prop="desc" min-width="210" />
            <el-table-column label="已发（张）" width="100" align="right"><template #default="{ row }"><span class="num">{{ state.db.cards.filter((c) => c.typeId === row.id).length }}</span></template></el-table-column>
            <el-table-column label="状态" width="96" align="center"><template #default="{ row }"><LzStatusTag :type="row.status === 'ON' ? 'success' : 'info'" :text="row.status === 'ON' ? '上架中' : '已下架'" /></template></el-table-column>
            <el-table-column label="操作" width="140" align="center" :fixed="narrow ? false : 'right'">
              <template #default="{ row }">
                <el-button text type="primary" @click="askType(row)">编辑</el-button>
                <el-button text :type="row.status === 'ON' ? 'danger' : 'primary'" @click="askToggleType(row)">{{ row.status === 'ON' ? '下架' : '上架' }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>

        <!-- 扣次记录 -->
        <template v-else>
          <div class="lz-toolbar filters">
            <el-radio-group v-model="log.range" aria-label="时间范围"><el-radio-button v-for="r in RANGES" :key="r.value" :value="r.value">{{ r.label }}</el-radio-button></el-radio-group>
            <el-select v-model="log.act" clearable placeholder="全部动作" style="width: 130px" aria-label="动作"><el-option value="核销扣次" label="核销扣次" /><el-option value="撤销扣次" label="撤销扣次" /></el-select>
            <el-input v-model="log.q" clearable placeholder="卡号或会员姓名" :prefix-icon="Search" style="width: 200px" aria-label="搜索扣次记录" />
            <span class="grow" /><span class="muted num">共 {{ logRows.length }} 条</span>
            <el-button :icon="Download" @click="exportLogs">导出</el-button>
          </div>
          <LzState :status="logStatus" empty-title="没有符合条件的扣次记录" error-hint="扣次记录没有加载出来，请检查网络后重试" @retry="load">
            <el-table :data="logPage" size="large" row-key="id">
              <el-table-column label="时间" width="150" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
              <el-table-column label="卡号" width="112" align="center"><template #default="{ row }"><span class="num">{{ row.cardNo }}</span></template></el-table-column>
              <el-table-column label="会员" prop="userName" width="90" align="center" />
              <el-table-column label="动作" width="130" align="center"><template #default="{ row }"><el-tag :type="row.revoked ? 'info' : LOG_TAG[row.action]" effect="light">{{ row.action }}{{ row.revoked ? '（已撤销）' : '' }}</el-tag></template></el-table-column>
              <el-table-column label="操作人" prop="operator" width="96" align="center" />
              <el-table-column label="备注" prop="note" min-width="120" />
              <el-table-column label="操作" width="90" align="center" :fixed="narrow ? false : 'right'"><template #default="{ row }"><el-button v-if="row.action === '核销扣次' && !row.revoked" text type="primary" @click="askRevoke(row)">撤销</el-button><span v-else class="muted">—</span></template></el-table-column>
            </el-table>
            <LzPager v-model:page="logPager.page.value" v-model:size="logPager.size.value" :total="logRows.length" />
          </LzState>
        </template>
      </el-card>

      <!-- the rail: reminders and reference numbers, it stays in view while the list scrolls -->
      <aside class="rail" aria-label="提醒与统计">
        <el-card shadow="never" class="lz-card" aria-label="7 天内到期">
          <template #header><div class="row"><strong>7 天内到期</strong><span class="grow" /><el-tag :type="soon.length ? 'warning' : 'info'" effect="light">{{ soon.length }} 张</el-tag></div></template>
          <div v-if="soon.length" class="soon">
            <div v-for="c in soon.slice(0, 6)" :key="c.id" class="soon-row">
              <div class="grow"><strong>{{ c.userName }}</strong><div class="muted num">{{ c.typeName }} · {{ c.no.slice(-5) }}</div></div>
              <el-tag :type="dDiff(c.expire, today) <= 2 ? 'warning' : 'info'" effect="light">{{ dDiff(c.expire, today) === 0 ? '今天到期' : '还剩 ' + dDiff(c.expire, today) + ' 天' }}</el-tag>
              <el-button text type="primary" :aria-label="'查看 ' + c.userName + ' 的 ' + c.typeName" @click="openDetail(c)">查看</el-button>
            </div>
          </div>
          <span v-else class="muted">最近 7 天没有要到期的卡</span>
        </el-card>

        <el-card shadow="never" class="lz-card" aria-label="今日扣次">
          <el-statistic title="今日扣次数" :value="todayN" suffix="次" />
          <div class="row delta"><el-tag :type="todayN >= yestN ? 'success' : 'danger'" effect="light">{{ todayN >= yestN ? '多' : '少' }} {{ Math.abs(todayN - yestN) }} 次</el-tag><span class="muted">较昨日 {{ yestN }} 次，近 7 天趋势</span></div>
          <LzChart kind="line" :categories="week.map((d) => d.slice(5))" :series="spark" :height="110" unit="" label="近 7 天每天扣次数" />
        </el-card>

        <el-card shadow="never" class="lz-card" aria-label="卡种销量">
          <template #header><strong>卡种销量</strong></template>
          <div class="stack sales">
            <div v-for="x in sales" :key="x.t.id">
              <div class="row"><span class="grow">{{ x.t.name }}</span><strong class="num">{{ x.n }} 张</strong></div>
              <el-progress :percentage="x.pct" :show-text="false" :stroke-width="6" :aria-label="x.t.name + ' 已发 ' + x.n + ' 张'" />
            </div>
          </div>
        </el-card>
      </aside>
    </div>

    <!-- detail -->
    <LzDialog v-model="detail.open" :title="'会员卡详情：' + (dc?.no || '')" width="min(720px, 94vw)" no-footer>
      <el-tabs v-if="dc" v-model="detail.tab">
        <el-tab-pane label="概况" name="info">
          <div class="stack">
            <div class="d-kpis">
              <el-statistic :title="dc.kind === '次卡' ? '剩余次数' : '剩余天数'" :value="dc.kind === '次卡' ? Math.max(0, dc.total - dc.used) + ' / ' + dc.total : dState === 'ACTIVE' ? dDiff(dc.expire, today) + ' 天' : '—'" />
              <el-statistic title="今日" :value="dc.kind === '次卡' ? '次卡不限每日' : dState !== 'ACTIVE' ? '不可用' : usedToday(dc) ? '已用 ' + usedToday(dc).at.slice(11) : '可用'" />
              <el-statistic title="实付（元）" :value="yuan(priceOf(dc))" />
            </div>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="卡号"><span class="num">{{ dc.no }}</span></el-descriptions-item>
              <el-descriptions-item label="状态"><LzStatusTag :type="CARD_STATUS[dState][0]" :text="CARD_STATUS[dState][1]" /></el-descriptions-item>
              <el-descriptions-item label="持卡会员">{{ dUser ? dUser.name + '（' + maskPhone(dUser.phone) + '）' : dc.userName }}</el-descriptions-item>
              <el-descriptions-item label="卡种">{{ dc.typeName }} · {{ dc.kind }}</el-descriptions-item>
              <el-descriptions-item label="可用时段">{{ dc.slot || '全天' }}</el-descriptions-item>
              <el-descriptions-item label="购买">{{ dc.bought }}，{{ payOf(dc) === '现金' ? '前台现金收款' : '线上支付' }}</el-descriptions-item>
              <el-descriptions-item label="有效期"><span class="num">{{ dc.bought }} 至 {{ dc.expire }}</span></el-descriptions-item>
              <el-descriptions-item label="说明" :span="2">{{ typeOf(dc).desc || '—' }}</el-descriptions-item>
              <el-descriptions-item label="冻结记录" :span="2">{{ dc.frozenTotal ? `累计冻结 ${dc.frozenTotal} 天` : dc.frozenDays ? `冻结 ${dc.frozenDays} 天` : '无' }}</el-descriptions-item>
              <el-descriptions-item v-if="dc.refundAmount != null" label="退款" :span="2">{{ yuan(dc.refundAmount) }}，{{ md(dc.refundAt) }}</el-descriptions-item>
            </el-descriptions>
            <div class="row">
              <el-button type="primary" plain @click="askDeduct(dc)">扣次</el-button>
              <template v-if="isAdmin">
                <el-button v-if="dState === 'ACTIVE'" @click="askFreeze(dc)">冻结</el-button>
                <el-button v-if="dState === 'FROZEN'" @click="askUnfreeze(dc)">解冻</el-button>
                <el-button v-if="['ACTIVE', 'FROZEN'].includes(dState)" @click="askLose(dc)">挂失</el-button>
                <el-button v-if="dState === 'LOST'" @click="unlose(dc)">解挂</el-button>
                <el-button v-if="dState === 'LOST'" @click="askReissue(dc)">补办新卡</el-button>
                <el-button v-if="dState === 'ACTIVE'" @click="askTransfer(dc)">转让</el-button>
                <el-button v-if="['ACTIVE', 'FROZEN', 'LOST'].includes(dState)" @click="askRefund(dc)">退卡试算</el-button>
                <el-button v-if="['ACTIVE', 'FROZEN', 'EXPIRED'].includes(dState)" @click="askExtend(dc)">延期</el-button>
              </template>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="使用记录" name="use">
          <el-table :data="dLogs.slice(0, 40)" max-height="340" empty-text="还没有使用记录">
            <el-table-column label="时间" width="150" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
            <el-table-column label="动作" width="130" align="center"><template #default="{ row }"><el-tag :type="row.revoked ? 'info' : LOG_TAG[row.action] || 'info'" effect="light">{{ row.action }}{{ row.revoked ? '（已撤销）' : '' }}</el-tag></template></el-table-column>
            <el-table-column label="操作人" prop="operator" width="96" align="center" />
            <el-table-column label="说明" prop="note" min-width="120" />
            <el-table-column v-if="isAdmin" label="操作" width="84" align="center"><template #default="{ row }"><el-button v-if="row.action === '核销扣次' && !row.revoked" text type="primary" @click="askRevoke(row)">撤销</el-button></template></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="操作记录" name="audit">
          <el-table :data="dAudit" max-height="340" empty-text="还没有对这张卡的操作记录">
            <el-table-column label="时间" width="150" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
            <el-table-column label="操作人" prop="actor" width="90" align="center" />
            <el-table-column label="操作" prop="action" min-width="160" />
            <el-table-column label="结果" prop="result" width="80" align="center" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </LzDialog>

    <LzDialog v-model="confirmBox.open" :title="confirmBox.title" width="460px" :danger="confirmBox.danger" :confirm-text="confirmBox.ok" :on-confirm="confirmBox.run"><p>{{ confirmBox.text }}</p></LzDialog>

    <LzDialog v-model="dd.open" :title="'扣次：' + (dd.c?.userName || '')" width="440px" confirm-text="确认扣次" :on-confirm="doDeduct">
      <p>{{ ddText }}</p>
      <el-form v-if="dd.c?.kind === '时段卡'" label-position="top" @submit.prevent>
        <el-form-item :label="'核销时间（可用时段 ' + dd.c.slot + '）'"><el-select v-model="dd.at"><el-option :value="nowHM" :label="'现在 ' + nowHM" /><el-option value="12:10" label="12:10（午餐时段内）" /></el-select></el-form-item>
      </el-form>
    </LzDialog>

    <LzDialog v-model="fz.open" :title="'冻结：' + (fz.c?.userName || '') + ' 的' + (fz.c?.typeName || '')" width="460px" confirm-text="确认冻结" :confirm-disabled="!!fzError || !fz.reason.trim()" :on-confirm="doFreeze">
      <p>冻结期间不能使用，也不会到期；有效期会顺延相同的天数。</p>
      <el-form label-position="top" @submit.prevent>
        <el-form-item :label="`请假天数（单次 1 到 30 天，累计最多 60 天，还可冻结 ${fzLeft} 天）`" :error="fzError"><el-input-number v-model="fz.days" :min="1" :max="30" :precision="0" /></el-form-item>
        <el-form-item label="原因（必填）"><el-input v-model="fz.reason" type="textarea" :rows="2" maxlength="100" show-word-limit /></el-form-item>
      </el-form>
      <p v-if="!fzError && fz.c" class="num">冻结到 {{ md(dAdd(today, fz.days)) }}，有效期从 {{ md(fz.c.expire) }} 顺延到 {{ md(dAdd(fz.c.expire, fz.days)) }}。</p>
    </LzDialog>

    <LzDialog v-model="tr.open" :title="'转让会员卡：' + (tr.c?.no || '')" width="460px" confirm-text="确认转让" :confirm-disabled="!trTo || !!trError" :on-confirm="doTransfer">
      <p>转让后原持卡人不再持有，每张卡最多转让 1 次，不收手续费。对方必须已经是会员。</p>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="对方手机号" :error="trError"><el-input v-model="tr.phone" maxlength="11" inputmode="numeric" placeholder="11 位手机号" /></el-form-item>
      </el-form>
      <p class="muted">{{ /^1\d{10}$/.test(tr.phone.trim()) ? (trTo ? '对方：' + trTo.name : '') : '输入后显示对方姓名' }}</p>
    </LzDialog>

    <LzDialog v-model="rf.open" :title="'退卡试算：' + (rf.c?.userName || '') + ' 的' + (rf.c?.typeName || '')" width="min(540px, 94vw)" danger confirm-text="确认退卡" :confirm-disabled="rf.status !== 'ok' || !rf.reason.trim()" :on-confirm="doRefund">
      <LzState :status="rf.status" :rows="4" error-title="试算失败" :error-hint="rf.err" @retry="calcRefund">
        <template v-if="rf.q && rf.c">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="实付">{{ yuan(rf.q.P) }}</el-descriptions-item>
            <el-descriptions-item v-for="[k, v] in rf.q.rows" :key="k" :label="k">{{ v }}</el-descriptions-item>
            <el-descriptions-item label="手续费">{{ rf.q.fullRefund ? '付款 7 天内且未使用，全额退，不收手续费' : '−' + yuan(rf.q.fee) + '（剩余价值的 5%）' }}</el-descriptions-item>
            <el-descriptions-item label="可退金额"><strong class="num refund">{{ yuan(rf.q.refund) }}</strong></el-descriptions-item>
            <el-descriptions-item label="退回方式">{{ payOf(rf.c) === '线上' ? '原路退回，1 到 3 个工作日到账' : '线下现金退还，由前台当面办理' }}</el-descriptions-item>
          </el-descriptions>
          <p class="muted">{{ cardState(rf.c) === 'FROZEN' ? '这张卡冻结中，退卡会先按今天结束冻结再退款。' : '' }}确认后这张卡立即作废，不能恢复。</p>
          <el-form label-position="top" @submit.prevent><el-form-item label="退卡原因（必填）"><el-input v-model="rf.reason" type="textarea" :rows="2" maxlength="100" show-word-limit /></el-form-item></el-form>
        </template>
      </LzState>
    </LzDialog>

    <LzDialog v-model="ex.open" :title="'延期：' + (ex.c?.userName || '') + ' 的' + (ex.c?.typeName || '')" width="460px" confirm-text="确认延期" :confirm-disabled="!!exError || !ex.reason.trim()" :on-confirm="doExtend">
      <p>当前有效期到 {{ ex.c ? md(ex.c.expire) : '' }}。延期会写入操作记录。</p>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="延期天数（单次最多 90 天）" :error="exError"><el-input-number v-model="ex.days" :min="1" :max="90" :precision="0" /></el-form-item>
        <el-form-item label="原因（必填）"><el-input v-model="ex.reason" type="textarea" :rows="2" maxlength="100" show-word-limit /></el-form-item>
      </el-form>
      <p v-if="!exError && ex.c" class="num">延期后到 {{ md(dAdd(ex.c.expire, ex.days)) }}。</p>
    </LzDialog>

    <LzDialog v-model="rv.open" :title="'撤销扣次：' + (rv.l?.userName || '')" width="440px" danger confirm-text="确认撤销" :confirm-disabled="!rv.reason.trim()" :on-confirm="doRevoke">
      <p>会把 {{ rv.l ? md(rv.l.at) : '' }} 的这次扣次退回给会员，不能重复撤销。</p>
      <el-form label-position="top" @submit.prevent><el-form-item label="撤销原因（必填）"><el-input v-model="rv.reason" type="textarea" :rows="2" maxlength="100" show-word-limit /></el-form-item></el-form>
    </LzDialog>

    <LzDialog v-model="iss.open" title="人工发卡" width="460px" confirm-text="确认发卡" :on-confirm="doIssue">
      <p>发卡会同步到会员的会员卡，并写入审计。</p>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="会员"><el-select v-model="iss.uid" filterable><el-option v-for="u in issUsers" :key="u.id" :value="u.id" :label="`${u.name}（尾号 ${last4(u.phone)}）`" /></el-select></el-form-item>
        <el-form-item label="卡种"><el-select v-model="iss.tid"><el-option v-for="t in issTypes" :key="t.id" :value="t.id" :label="`${t.name} · ${yuan(t.price)} 元`" /></el-select></el-form-item>
        <el-form-item label="收款方式"><el-radio-group v-model="iss.pay"><el-radio value="现金">现金</el-radio><el-radio value="线上">线上</el-radio></el-radio-group></el-form-item>
      </el-form>
      <span class="muted">现金表示前台已收款；线上表示会员已在小程序付款。</span>
    </LzDialog>

    <LzDialog v-model="ty.open" :title="ty.t ? '编辑卡种：' + ty.t.name : '新建卡种'" width="min(560px, 94vw)" :confirm-text="ty.t ? '保存' : '创建'" :on-confirm="doType">
      <el-form ref="tyForm" :model="ty.f" :rules="tyRules" label-position="top" @submit.prevent>
        <el-form-item label="名称" prop="name"><el-input v-model="ty.f.name" maxlength="10" show-word-limit /></el-form-item>
        <el-form-item label="类型"><el-radio-group v-model="ty.f.kind"><el-radio-button v-for="k in KINDS" :key="k" :value="k">{{ k }}</el-radio-button></el-radio-group></el-form-item>
        <el-form-item label="价格（元）" prop="price"><el-input-number v-model="ty.f.price" :min="0" :precision="2" :step="10" :controls="false" /></el-form-item>
        <el-form-item label="有效天数" prop="days"><el-input-number v-model="ty.f.days" :min="1" :max="365" :precision="0" /></el-form-item>
        <template v-if="ty.f.kind === '次卡'">
          <el-form-item label="次数" prop="times"><el-input-number v-model="ty.f.times" :min="1" :max="200" :precision="0" /></el-form-item>
          <el-form-item label="赠送次数（不超过购买次数的 30%）" prop="gift"><el-input-number v-model="ty.f.gift" :min="0" :precision="0" /></el-form-item>
        </template>
        <el-form-item v-if="ty.f.kind === '时段卡'" label="可用时段" prop="slot">
          <div class="row"><el-time-select v-model="ty.f.slot0" start="06:00" end="22:00" step="00:30" placeholder="开始" style="width: 130px" /><span class="muted">至</span><el-time-select v-model="ty.f.slot1" start="06:00" end="22:30" step="00:30" placeholder="结束" style="width: 130px" /></div>
        </el-form-item>
        <el-form-item label="每日次数（留空表示不限，期限卡通常每天 1 次）"><el-input-number v-model="ty.f.daily" :min="1" :max="5" :precision="0" /></el-form-item>
        <el-form-item label="状态"><el-radio-group v-model="ty.f.status"><el-radio value="ON">上架</el-radio><el-radio value="OFF">下架</el-radio></el-radio-group></el-form-item>
      </el-form>
    </LzDialog>

    <LzDialog v-model="rep.open" :title="rep.title" width="460px" no-footer>
      <div class="row"><el-tag type="success" effect="light">成功 {{ rep.ok }} 张</el-tag><el-tag :type="rep.fails.length ? 'danger' : 'info'" effect="light">失败 {{ rep.fails.length }} 张</el-tag></div>
      <el-table v-if="rep.fails.length" :data="rep.fails" max-height="260" class="fails">
        <el-table-column label="会员与卡" prop="name" width="130" align="center" />
        <el-table-column label="原因" prop="reason" />
      </el-table>
      <p v-else class="muted">已全部处理完成。</p>
      <div class="right"><el-button type="primary" @click="rep.open = false">知道了</el-button></div>
    </LzDialog>
  </div>
</template>

<style scoped>
.cards-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
@media (max-width: 1100px) { .cards-layout { grid-template-columns: minmax(0, 1fr); } }
.rail { display: grid; gap: 16px; position: sticky; top: 0; }
@media (max-width: 1100px) { .rail { position: static; } }
.tab-count { margin-left: 6px; color: var(--luz-ink-2); font-weight: 400; }
.tab-count.zero { color: var(--luz-ink-3); opacity: .7; }
.filters { margin-bottom: 12px; }
.batch { margin-bottom: 12px; padding: 8px 12px; background: var(--luz-action-tint); border-radius: var(--luz-radius-control); }
.remain { display: grid; gap: 4px; justify-items: center; }
.remain :deep(.el-progress) { width: 120px; }
.soon { display: grid; gap: 4px; }
.soon-row { display: flex; align-items: center; gap: 8px; }
.delta { margin: 8px 0; }
.sales { gap: 12px; }
.d-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 16px; }
.fails { margin: 12px 0; }
.refund { font-size: 22px; }
strong { font-weight: 600; }
.range-box { flex: none; width: 250px; }
</style>
