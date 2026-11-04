<script>
// 会员：横带分层。先看盘子（指标）、再看增长与等级（图），最后在明细里找人处理。默认只显示正常会员。
export const meta = {
  id: 'members', label: '会员', icon: 'users', group: '会员', order: 1, roles: ['A', 'F'],
  layout: '横带分层',
  reason: '运营先看会员盘子有多大、最近有没有增长、等级怎么分布，再去明细里找人处理：三条带从结论走到明细，数字带里只有会员总数用展示字号，其余缩成小数字',
  scenes: [
    { id: 'nodata', label: '所选范围没有会员' },
    { id: 'disable-conflict', label: '禁用失败：会员有支付中的订单' },
    { id: 'points-busy', label: '积分调整失败：积分正被订单锁定' },
    { id: 'coupon-soldout', label: '发券失败：券已发完' },
    { id: 'export-busy', label: '导出失败：导出任务排队过多' },
  ],
}
</script>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, Download, Refresh, Search } from '@element-plus/icons-vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, maskPhone, yuan } from '../../shared/format.js'
import { usePager } from '../use-pager.js'

const router = useRouter()
const scene = useScene('members')
const mq = window.matchMedia('(max-width: 700px)')          // on a phone the table's action column scrolls with the rest
const narrow = ref(mq.matches)
const onMq = (e) => { narrow.value = e.matches }
mq.addEventListener('change', onMq)
onUnmounted(() => mq.removeEventListener('change', onMq))
const phase = ref('loading')                                    // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

// ---- small helpers: dates are strings (2026-11-04), money is cents
const today = K.ymd(B.NOW())
const pad = K.pad
const parse = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
const dAdd = (s, n) => K.ymd(K.addDays(parse(s), n))
const dDiff = (a, b) => Math.round((parse(a) - parse(b)) / 864e5)
const weekStart = (s) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return K.ymd(d) }
const last4 = (p) => p.slice(-4)
const signed = (c) => (c < 0 ? '−' : '+') + yuan(Math.abs(c))
const actor = () => (state.role === 'F' ? '陈晓燕' : '王海燕')
const audit = (code, action, target, result = '成功') => {
  const db = state.db
  db.audit.unshift({ id: db.audit.length + 1, at: B.fmt(B.NOW()), actor: actor(), code, action, target, result, ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16) })
}
const targetOf = (u) => `会员 ${u.name}（编号 ${u.id}）`
const isAdmin = computed(() => state.role === 'A')                 // 前台没有：导出、禁用、调整积分、发券、发卡
const LEVELS = ['普通', '银卡', '金卡']
const LEVEL_TAG = { 金卡: 'warning', 银卡: 'primary', 普通: 'info' }
const CARD_STATUS = { ACTIVE: ['success', '生效中'], FROZEN: ['info', '已冻结'], LOST: ['warning', '已挂失'], EXPIRED: ['info', '已过期'], USEDUP: ['info', '已用完'], REFUNDED: ['info', '已退卡'], VOID: ['info', '已作废'] }
const cardState = (c) => (['REFUNDED', 'VOID', 'LOST', 'FROZEN'].includes(c.status) ? c.status : c.expire < today ? 'EXPIRED' : c.kind === '次卡' && c.total && c.used >= c.total ? 'USEDUP' : 'ACTIVE')
const holdsCard = (uid) => state.db.cards.some((c) => c.userId === uid && ['ACTIVE', 'FROZEN'].includes(cardState(c)))
const cardCount = (uid) => state.db.cards.filter((c) => c.userId === uid && ['ACTIVE', 'FROZEN'].includes(cardState(c))).length
const orderOf = (uid) => state.db.orders.filter((o) => o.userId === uid)
const pendingOf = (uid) => orderOf(uid).filter((o) => ['UNPAID', 'PAID'].includes(o.status)).length
const couponOwner = (m) => m.userId ?? state.db.me.id                // the seed coupons belong to the signed-in demo member
const couponLive = (c) => c.status === 'ON' && !(c.validType === 'fixed' && c.to < today)
const holds = (u, cid) => state.db.myCoupons.filter((m) => couponOwner(m) === u.id && m.couponId === cid).length

// ---- point records: the shared demo data has none, so they are made once per data set; their sum is the member's points
const seeded = new WeakSet()
function seedPointLogs() {
  const r = B.rng(97); const logs = []; const src = ['下单获得', '下单获得', '签到奖励', '活动奖励']
  state.db.users.forEach((u) => {
    const redeem = u.points > 400 && r() < 0.5 ? Math.round((u.points * (0.1 + r() * 0.2)) / 10) * 10 : 0
    const n = 2 + Math.floor(r() * 4); let left = u.points + redeem; const parts = []
    for (let i = 0; i < n; i++) { const p = i === n - 1 ? left : Math.min(left, Math.max(0, Math.round((left * (0.25 + r() * 0.4)) / 10) * 10)); parts.push(p); left -= p }
    const span = Math.max(1, dDiff(today, u.joined))
    const ev = parts.filter((p) => p > 0).map((p, i) => ({ d: p, why: i === 0 ? '注册赠送' : src[Math.floor(r() * src.length)] }))
    if (redeem) ev.push({ d: -redeem, why: '积分兑换' })
    ev.forEach((e, i) => { e.at = dAdd(u.joined, Math.floor((span * (i + 1)) / (ev.length + 1))) + ' ' + pad(9 + Math.floor(r() * 11)) + ':' + pad(Math.floor(r() * 60)) })
    let bal = 0
    ev.forEach((e) => { bal += e.d; logs.push({ id: 0, userId: u.id, at: e.at, delta: e.d, balance: bal, reason: e.why, by: '系统' }) })
  })
  logs.sort((a, b) => (a.at < b.at ? -1 : 1)).forEach((l, i) => (l.id = i + 1))
  state.db.pointLogs = logs.reverse()
}
function ensurePointLogs() {
  const key = toRaw(state.db.users)
  if (!state.db.pointLogs || !seeded.has(key)) { seedPointLogs(); seeded.add(key) }
}
ensurePointLogs()
watch(() => state.db.users, ensurePointLogs)

// ---- band 1: the numbers
const users = computed(() => (scene.value === 'nodata' ? [] : state.db.users))
const ratio = (a, b) => (b ? (a - b) / b : null)
const activeIn = (from, to) => {
  const ids = new Set(users.value.map((u) => u.id)); const cnt = {}
  state.db.orders.forEach((o) => { const d = o.createdAt.slice(0, 10); if (ids.has(o.userId) && ['PAID', 'FULFILLED', 'DONE'].includes(o.status) && d > from && d <= to) cnt[o.userId] = (cnt[o.userId] || 0) + 1 })
  return Object.values(cnt).filter((n) => n >= 2).length
}
const stats = computed(() => {
  const us = users.value; const d30 = dAdd(today, -30); const d60 = dAdd(today, -60)
  const fresh = us.filter((u) => u.joined > d30).length; const prev = us.filter((u) => u.joined > d60 && u.joined <= d30).length
  return {
    total: us.length, disabled: us.filter((u) => u.status === 'DISABLED').length, fresh, prev,
    active: activeIn(dAdd(today, -7), today), activePrev: activeIn(dAdd(today, -14), dAdd(today, -7)),
    balance: us.reduce((s, u) => s + u.balance, 0), points: us.reduce((s, u) => s + u.points, 0),
  }
})

// ---- band 2: new members per week, and the level split
const weeks = (() => { const w0 = weekStart(dAdd(today, -77)); return Array.from({ length: 12 }, (_, i) => dAdd(w0, i * 7)) })()
const weekly = computed(() => weeks.map((w) => users.value.filter((u) => u.joined >= w && u.joined < dAdd(w, 7)).length))
const trend = computed(() => [{ name: '新增会员', data: weekly.value }])
const trendNote = computed(() => {
  const sum = weekly.value.reduce((a, b) => a + b, 0); const top = Math.max(...weekly.value)
  return sum ? `近 12 周共新增 ${sum} 人，最多的一周是 ${weeks[weekly.value.indexOf(top)].slice(5)} 起，新增 ${top} 人。` : '近 12 周没有新增会员。'
})
const levels = computed(() => LEVELS.map((n) => ({ name: n, value: users.value.filter((u) => u.level === n).length })))

// ---- band 3: the list. The default view is the members who can still order (正常); 已禁用 and 全部 are tabs.
const SORTS = [['joined', '最近注册'], ['spent', '消费从高到低'], ['balance', '余额从高到低'], ['points', '积分从高到低']]
const TABS = [['ENABLED', '正常'], ['DISABLED', '已禁用'], ['ALL', '全部']]
const blank = () => ({ tab: 'ENABLED', q: '', level: '', join: null, card: '', sort: 'joined' })
const filter = reactive(blank())
const match = (u, skipTab) => {
  const q = filter.q.trim()
  if (!skipTab && filter.tab !== 'ALL' && u.status !== filter.tab) return false
  if (filter.level && u.level !== filter.level) return false
  if (filter.join && (u.joined < filter.join[0] || u.joined > filter.join[1])) return false
  if (filter.card === 'HAS' && !holdsCard(u.id)) return false
  if (filter.card === 'NONE' && holdsCard(u.id)) return false
  if (q && !(/^\d{4}$/.test(q) ? last4(u.phone) === q : u.name.includes(q))) return false
  return true
}
const count = (code) => users.value.filter((u) => match(u, true) && (code === 'ALL' || u.status === code)).length
const SORT_KEY = { joined: (u) => u.joined + pad(u.id), spent: (u) => u.spent, balance: (u) => u.balance, points: (u) => u.points }
const filtered = computed(() => users.value.filter((u) => match(u)).sort((a, b) => (SORT_KEY[filter.sort](a) < SORT_KEY[filter.sort](b) ? 1 : -1)))
const pager = usePager('members')
const rows = pager.slice(filtered)
const dirty = computed(() => ['q', 'level', 'join', 'card'].some((k) => filter[k]) || filter.tab !== 'ENABLED' || filter.sort !== 'joined')
const resetFilter = () => Object.assign(filter, blank())
const tabStatus = computed(() => (phase.value !== 'ok' ? phase.value : filtered.value.length ? 'ok' : 'empty'))
const picked = ref([])
const table = ref(null)
const clearPick = () => { picked.value = []; table.value?.clearSelection() }
watch(() => ({ ...filter }), () => { pager.reset(); clearPick() })

// ---- shared pieces: a confirm dialog and the result of a batch
const ask = reactive({ open: false, title: '', text: '', ok: '确认', danger: false, run: null })
const askConfirm = (title, text, ok, run, danger = false) => Object.assign(ask, { open: true, title, text, ok, run, danger })
const rep = reactive({ open: false, title: '', ok: 0, fails: [] })
const report = (title, ok, fails) => Object.assign(rep, { open: true, title, ok, fails })

// ---- disable (one or many): a reason is required, a member with a payment in progress is refused with the reason
const dis = reactive({ open: false, list: [], reason: '' })
const askDisable = (list) => Object.assign(dis, { open: true, list, reason: '' })
async function doDisable() {
  const list = dis.list; const one = list.length === 1
  await request(500)
  if (one && scene.value === 'disable-conflict') throw new Error(`禁用失败：${list[0].name} 有 1 笔订单正在支付中，请等支付结果出来后再试`)
  let ok = 0; const fails = []
  list.forEach((u) => {
    if (u.status === 'DISABLED') return fails.push({ name: u.name, reason: '本来就是禁用状态' })
    if (scene.value === 'disable-conflict' && u.id % 3 === 0) return fails.push({ name: u.name, reason: '有订单正在支付中，等支付结果出来后再试' })
    u.status = 'DISABLED'; ok += 1
    audit('member:edit', (one ? '禁用会员：' : '批量禁用会员：') + dis.reason.trim(), targetOf(u))
  })
  clearPick()
  if (one) ElMessage.success(`已禁用 ${list[0].name}`)
  else report('批量禁用结果', ok, fails)
}
const askEnable = (u) => askConfirm('启用会员', `启用后 ${u.name} 可以正常下单、领券和使用会员卡。`, '确认启用', async () => {
  await request(400)
  u.status = 'ENABLED'; audit('member:edit', '启用会员', targetOf(u)); ElMessage.success(`已启用 ${u.name}`)
})

// ---- points: shows before and after, the sum can never go below zero
const pt = reactive({ open: false, u: null, dir: 'add', n: 100, reason: '' })
const askPoints = (u) => Object.assign(pt, { open: true, u, dir: 'add', n: 100, reason: '' })
const ptDelta = computed(() => (pt.dir === 'sub' ? -1 : 1) * (pt.n || 0))
const ptError = computed(() => (!pt.u ? '' : !Number.isInteger(pt.n) || pt.n < 1 ? '请填写大于 0 的整数' : pt.n > 5000 ? '单次最多调整 5000 分' : pt.dir === 'sub' && pt.n > pt.u.points ? `扣减后积分不能为负，当前只有 ${pt.u.points} 分` : ''))
async function doPoints() {
  const u = pt.u; const delta = ptDelta.value
  await request(450, { fail: scene.value === 'points-busy' ? new Error('积分调整失败：该会员的积分正被一笔订单锁定，请稍后再试，积分没有变化') : null })
  u.points += delta
  state.db.pointLogs.unshift({ id: state.db.pointLogs.length + 1, userId: u.id, at: B.fmt(B.NOW()), delta, balance: u.points, reason: '人工调整：' + pt.reason.trim(), by: actor() })
  audit('member:edit', `积分${delta < 0 ? '扣减' : '增加'} ${Math.abs(delta)}：${pt.reason.trim()}`, targetOf(u))
  ElMessage.success(`积分已调整为 ${u.points}`)
}

// ---- coupons (one member or many)
const cp = reactive({ open: false, list: [], cid: null, n: 1, reason: '' })
const liveCoupons = computed(() => state.db.coupons.filter((c) => couponLive(c)))
const cpCoupon = computed(() => liveCoupons.value.find((c) => c.id === cp.cid))
const cpOne = computed(() => cp.list.length === 1)
const cpError = computed(() => {
  const c = cpCoupon.value; if (!c) return '现在没有进行中的券可以发'
  if (!Number.isInteger(cp.n) || cp.n < 1 || cp.n > 5) return '每人 1 到 5 张'
  if (!cpOne.value) return ''
  const u = cp.list[0]; const has = holds(u, c.id)
  if (u.status === 'DISABLED') return '这位会员已禁用，不能发券'
  if (has + cp.n > c.perUser) return `${u.name} 已领 ${has} 张，超过本券每人限领 ${c.perUser} 张`
  if (c.claimed + cp.n > c.stock) return `库存只剩 ${c.stock - c.claimed} 张`
  return ''
})
function askCoupon(list) {
  if (!liveCoupons.value.length) return ElMessage.error('现在没有进行中的券可以发')
  Object.assign(cp, { open: true, list, cid: liveCoupons.value[0].id, n: 1, reason: '' })
}
async function doCoupon() {
  const c = cpCoupon.value; const list = cp.list; const n = cp.n
  await request(list.length > 1 ? 600 : 360, { fail: scene.value === 'coupon-soldout' ? new Error(`发券失败：「${c.name}」已经发完了，没有发出任何券，请换一张券或补充库存后再试`) : null })
  let ok = 0; const fails = []
  list.forEach((u) => {
    const has = holds(u, c.id)
    if (u.status === 'DISABLED') return fails.push({ name: u.name, reason: '会员已禁用，不能发券' })
    if (has + n > c.perUser) return fails.push({ name: u.name, reason: `已领 ${has} 张，超过每人限领 ${c.perUser} 张` })
    if (c.claimed + n > c.stock) return fails.push({ name: u.name, reason: '券的库存不够了' })
    for (let i = 0; i < n; i++) state.db.myCoupons.unshift({ id: Math.max(0, ...state.db.myCoupons.map((m) => m.id)) + 1, userId: u.id, couponId: c.id, name: c.name, kind: c.kind, threshold: c.threshold, value: c.value, expire: c.validType === 'fixed' ? c.to : dAdd(today, c.days), state: 'UNUSED', at: B.fmt(B.NOW()), source: '后台发放' })
    c.claimed += n; ok += 1
    audit('coupon:edit', `发券「${c.name}」×${n}${cp.reason.trim() ? '：' + cp.reason.trim() : ''}`, targetOf(u))
  })
  clearPick()
  if (list.length > 1 || fails.length) report('发券结果', ok, fails)
  else ElMessage.success(`已发放「${c.name}」×${n}`)
}

// ---- export: Chinese headers, desensitised phones, the range written in the name
const exp = reactive({ open: false })
const scopeName = computed(() => [TABS.find((t) => t[0] === filter.tab)[1], filter.level, filter.card === 'HAS' ? '持有有效卡' : filter.card === 'NONE' ? '没有卡' : '', filter.join ? filter.join.join('至') : ''].filter(Boolean).join('、'))
async function doExport() {
  await request(700, { fail: scene.value === 'export-busy' ? new Error('导出失败：当前已有 3 个导出任务在排队，请 5 分钟后再试，或缩小筛选范围') : null })
  const file = `会员列表_脱敏_${scopeName.value}_${today}.xlsx`
  state.db.exportTasks.unshift({ id: state.db.exportTasks.length + 1, name: file, kind: '会员', rows: filtered.value.length, status: 'DONE', at: B.fmt(B.NOW()), by: actor() })
  audit('export', '导出会员', file)
  ElMessage.success(`已生成「${file}」，共 ${filtered.value.length} 人`)
}

// ---- detail: one dialog, seven tabs
const detail = reactive({ open: false, id: null, tab: 'overview', revealed: false })
const du = computed(() => state.db.users.find((u) => u.id === detail.id) || null)
const openDetail = (u) => Object.assign(detail, { open: true, id: u.id, tab: 'overview', revealed: false })
function reveal() { detail.revealed = true; audit('member:view', '查看完整手机号', targetOf(du.value)); ElMessage.success('已显示完整手机号，并记入审计') }
const dOrders = computed(() => (du.value ? orderOf(du.value.id) : []))
const dCards = computed(() => (du.value ? state.db.cards.filter((c) => c.userId === du.value.id) : []))
const dWallet = computed(() => (du.value ? state.db.walletLogs.filter((l) => l.userId === du.value.id) : []))
const dCoupons = computed(() => (du.value ? state.db.myCoupons.filter((m) => couponOwner(m) === du.value.id) : []))
const dPoints = computed(() => (du.value ? state.db.pointLogs.filter((l) => l.userId === du.value.id) : []))
const dAudit = computed(() => (du.value ? state.db.audit.filter((a) => a.target.includes(`（编号 ${du.value.id}）`)) : []))
const COUPON_STATE = { UNUSED: ['success', '未使用'], USED: ['info', '已使用'], EXPIRED: ['warning', '已过期'] }
const remainOf = (c) => (c.kind === '次卡' ? `${Math.max(0, c.total - c.used)}/${c.total} 次` : `剩 ${Math.max(0, dDiff(c.expire, today))} 天`)

const onMore = (cmd, u) => ({
  coupon: () => askCoupon([u]), points: () => askPoints(u), card: () => router.push({ path: '/cards', query: { issue: u.id } }),
  disable: () => askDisable([u]), enable: () => askEnable(u),
})[cmd]()
</script>

<template>
  <div class="lz-page">
    <div class="lz-toolbar">
      <span class="grow" />
      <el-button :icon="Refresh" @click="load">刷新</el-button>
      <el-button v-if="isAdmin" :icon="Download" @click="exp.open = true">导出会员</el-button>
    </div>

    <!-- band 1 -->
    <section aria-label="会员概览" class="lz-kpis">
      <LzKpi label="会员总数" :value="stats.total" suffix="人" :delta="ratio(stats.total, stats.total - stats.fresh)" note="较 30 天前" />
      <LzKpi label="近 30 天新增" :value="stats.fresh" suffix="人" :delta="ratio(stats.fresh, stats.prev)" note="较前 30 天" />
      <LzKpi label="活跃会员（7 天 2 单以上）" :value="stats.active" suffix="人" :delta="ratio(stats.active, stats.activePrev)" note="较前 7 天" />
      <LzKpi label="会员余额合计" :value="(stats.balance / 100).toFixed(2)" suffix="元" />
      <LzKpi label="积分合计" :value="stats.points" suffix="分" />
    </section>

    <!-- band 2 -->
    <section class="lz-main-rail" aria-label="新增与等级">
      <el-card shadow="never" class="lz-card" aria-label="近 12 周新增会员">
        <LzChart kind="line" :categories="weeks.map((w) => w.slice(5))" :series="trend" :height="220" unit=" 人" label="近 12 周按周新增会员" />
        <p class="muted note">{{ trendNote }}</p>
      </el-card>
      <el-card shadow="never" class="lz-card" aria-label="会员等级分布">
        <LzChart kind="pie" :series="levels" :height="220" label="会员等级分布" />
        <p class="muted note">{{ levels.map((l) => `${l.name} ${l.value} 人`).join('，') }}</p>
      </el-card>
    </section>

    <!-- band 3 -->
    <el-card shadow="never" class="lz-card" aria-label="会员明细">
      <el-tabs v-model="filter.tab">
        <el-tab-pane v-for="[code, label] in TABS" :key="code" :name="code">
          <template #label>{{ label }}<span class="tab-count num" :class="{ zero: !count(code) }">{{ count(code) }}</span></template>
        </el-tab-pane>
      </el-tabs>
      <div class="lz-toolbar filters">
        <el-input v-model="filter.q" clearable placeholder="姓名或手机号后四位" :prefix-icon="Search" style="width: 220px" aria-label="搜索会员" />
        <el-select v-model="filter.level" clearable placeholder="全部等级" style="width: 120px" aria-label="等级"><el-option v-for="l in LEVELS" :key="l" :value="l" :label="l" /></el-select>
        <el-select v-model="filter.card" clearable placeholder="会员卡不限" style="width: 140px" aria-label="会员卡"><el-option value="HAS" label="持有有效卡" /><el-option value="NONE" label="没有卡" /></el-select>
        <div class="range-box"><el-date-picker v-model="filter.join" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="注册开始" end-placeholder="注册结束" style="width: 100%" aria-label="注册时间" /></div>
        <el-select v-model="filter.sort" style="width: 148px" aria-label="排序"><el-option v-for="[v, l] in SORTS" :key="v" :value="v" :label="l" /></el-select>
        <el-button v-if="dirty" text type="primary" @click="resetFilter">重置筛选</el-button>
        <span class="grow" /><span class="muted num">共 {{ filtered.length }} 人</span>
      </div>

      <div v-if="picked.length" class="lz-toolbar batch">
        <span class="num">已选 {{ picked.length }} 人</span>
        <span class="grow" />
        <el-button @click="askCoupon(users.filter((u) => picked.includes(u.id)))">批量发券</el-button>
        <el-button type="danger" plain @click="askDisable(users.filter((u) => picked.includes(u.id)))">批量禁用</el-button>
        <el-button text @click="clearPick">取消选择</el-button>
      </div>

      <LzState :status="tabStatus" empty-title="所选范围没有会员" error-hint="会员列表没有加载出来，请检查网络后重试" @retry="load">
        <template #empty-action><el-button v-if="dirty" type="primary" @click="resetFilter">重置筛选</el-button></template>
        <el-table ref="table" :data="rows" size="large" row-key="id" @selection-change="(l) => (picked = l.map((u) => u.id))">
          <el-table-column v-if="isAdmin" type="selection" width="46" />
          <el-table-column label="姓名" width="104" align="center"><template #default="{ row }"><strong>{{ row.name }}</strong></template></el-table-column>
          <el-table-column label="手机号" width="124" align="center"><template #default="{ row }"><span class="num">{{ maskPhone(row.phone) }}</span></template></el-table-column>
          <el-table-column label="等级" width="84" align="center"><template #default="{ row }"><el-tag :type="LEVEL_TAG[row.level]" effect="light">{{ row.level }}</el-tag></template></el-table-column>
          <el-table-column label="积分" width="86" align="right"><template #default="{ row }"><span class="num">{{ row.points }}</span></template></el-table-column>
          <el-table-column label="余额（元）" width="108" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.balance) }}</span></template></el-table-column>
          <el-table-column label="累计消费（元）" width="140" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.spent) }}</span></template></el-table-column>
          <el-table-column label="会员卡" width="84" align="center"><template #default="{ row }">{{ cardCount(row.id) ? cardCount(row.id) + ' 张' : '无' }}</template></el-table-column>
          <el-table-column label="注册日期" width="116" align="center"><template #default="{ row }"><span class="num">{{ row.joined }}</span></template></el-table-column>
          <el-table-column label="状态" width="92" align="center"><template #default="{ row }"><LzStatusTag :type="row.status === 'ENABLED' ? 'success' : 'info'" :text="row.status === 'ENABLED' ? '正常' : '已禁用'" /></template></el-table-column>
          <el-table-column label="操作" :width="isAdmin ? 150 : 88" align="center" :fixed="narrow ? false : 'right'">
            <template #default="{ row }">
              <el-button text type="primary" :aria-label="'查看会员 ' + row.name" @click="openDetail(row)">查看</el-button>
              <el-dropdown v-if="isAdmin" trigger="click" @command="(c) => onMore(c, row)">
                <el-button text :icon="ArrowDown" :aria-label="'更多操作：' + row.name" />
                <template #dropdown><el-dropdown-menu>
                  <el-dropdown-item command="coupon">发券</el-dropdown-item>
                  <el-dropdown-item command="points">调整积分</el-dropdown-item>
                  <el-dropdown-item command="card">发卡</el-dropdown-item>
                  <el-dropdown-item v-if="row.status === 'ENABLED'" command="disable" divided>禁用会员</el-dropdown-item>
                  <el-dropdown-item v-else command="enable" divided>启用会员</el-dropdown-item>
                </el-dropdown-menu></template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
        <LzPager v-model:page="pager.page.value" v-model:size="pager.size.value" :total="filtered.length" />
      </LzState>
    </el-card>

    <!-- detail: a centred dialog with the member's records in tabs -->
    <LzDialog v-model="detail.open" :title="'会员详情：' + (du?.name || '')" width="min(780px, 94vw)" no-footer>
      <el-tabs v-if="du" v-model="detail.tab">
        <el-tab-pane label="概况" name="overview">
          <div class="stack">
            <div class="d-kpis">
              <el-statistic title="积分" :value="du.points" suffix="分" />
              <el-statistic title="储值余额（元）" :value="yuan(du.balance)" />
              <el-statistic title="累计消费（元）" :value="yuan(du.spent)" />
              <el-statistic title="订单数" :value="du.orders" suffix="单" />
            </div>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="姓名">{{ du.name }}</el-descriptions-item>
              <el-descriptions-item label="等级"><el-tag :type="LEVEL_TAG[du.level]" effect="light">{{ du.level }}</el-tag></el-descriptions-item>
              <el-descriptions-item label="手机号">
                <span class="num">{{ detail.revealed ? du.phone : maskPhone(du.phone) }}</span>
                <el-tag v-if="detail.revealed" type="info" effect="plain" class="gap">已记入审计</el-tag>
                <el-button v-else text type="primary" @click="reveal">查看完整手机号</el-button>
              </el-descriptions-item>
              <el-descriptions-item label="状态"><LzStatusTag :type="du.status === 'ENABLED' ? 'success' : 'info'" :text="du.status === 'ENABLED' ? '正常' : '已禁用'" /></el-descriptions-item>
              <el-descriptions-item label="注册日期"><span class="num">{{ du.joined }}</span></el-descriptions-item>
              <el-descriptions-item label="持有会员卡">{{ dCards.length ? `${dCards.length} 张（${cardCount(du.id)} 张生效中或冻结中）` : '无' }}</el-descriptions-item>
              <el-descriptions-item label="待处理订单" :span="2">{{ pendingOf(du.id) ? pendingOf(du.id) + ' 笔待支付或待履约' : '无' }}</el-descriptions-item>
            </el-descriptions>
            <div v-if="isAdmin" class="row">
              <el-button @click="askCoupon([du])">发券</el-button>
              <el-button @click="askPoints(du)">调整积分</el-button>
              <el-button @click="router.push({ path: '/cards', query: { issue: du.id } })">发卡</el-button>
              <el-button v-if="du.status === 'ENABLED'" type="danger" plain @click="askDisable([du])">禁用会员</el-button>
              <el-button v-else @click="askEnable(du)">启用会员</el-button>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="订单" name="orders">
          <el-table :data="dOrders.slice(0, 30)" max-height="340" empty-text="还没有订单">
            <el-table-column label="订单号" width="170" align="center"><template #default="{ row }"><span class="num">{{ row.no }}</span></template></el-table-column>
            <el-table-column label="下单时间" width="150" align="center"><template #default="{ row }"><span class="num">{{ row.createdAt }}</span></template></el-table-column>
            <el-table-column label="金额（元）" width="104" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.amount) }}</span></template></el-table-column>
            <el-table-column label="支付方式" width="108" align="center"><template #default="{ row }">{{ B.PAY[row.pay] }}</template></el-table-column>
            <el-table-column label="状态" width="96" align="center"><template #default="{ row }"><LzStatusTag kind="order" :status="row.status" /></template></el-table-column>
          </el-table>
          <p v-if="dOrders.length > 30" class="muted">仅显示最近 30 条，共 {{ dOrders.length }} 条</p>
        </el-tab-pane>
        <el-tab-pane label="会员卡" name="cards">
          <el-table :data="dCards" max-height="340" empty-text="没有持有会员卡">
            <el-table-column label="卡号" width="120" align="center"><template #default="{ row }"><span class="num">{{ row.no }}</span></template></el-table-column>
            <el-table-column label="卡种" prop="typeName" width="120" align="center" />
            <el-table-column label="有效期至" width="120" align="center"><template #default="{ row }"><span class="num">{{ row.expire }}</span></template></el-table-column>
            <el-table-column label="剩余" width="110" align="center"><template #default="{ row }"><span class="num">{{ remainOf(row) }}</span></template></el-table-column>
            <el-table-column label="状态" width="96" align="center"><template #default="{ row }"><LzStatusTag :type="CARD_STATUS[cardState(row)][0]" :text="CARD_STATUS[cardState(row)][1]" /></template></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="储值流水" name="wallet">
          <el-table :data="dWallet" max-height="340" empty-text="还没有储值流水">
            <el-table-column label="时间" width="150" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
            <el-table-column label="类型" prop="kind" width="90" align="center" />
            <el-table-column label="金额（元）" width="112" align="right"><template #default="{ row }"><span class="num">{{ signed(row.amount) }}</span></template></el-table-column>
            <el-table-column v-if="dWallet.some((l) => l.balance)" label="余额（元）" width="112" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.balance) }}</span></template></el-table-column>
            <el-table-column label="关联" prop="ref" min-width="130" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="优惠券" name="coupons">
          <el-table :data="dCoupons" max-height="340" empty-text="没有领取过优惠券">
            <el-table-column label="券" prop="name" min-width="160" />
            <el-table-column label="来源" width="100" align="center"><template #default="{ row }">{{ row.source || '领取' }}</template></el-table-column>
            <el-table-column v-if="dCoupons.some((m) => m.at)" label="领取时间" width="150" align="center"><template #default="{ row }"><span class="num">{{ row.at || '' }}</span></template></el-table-column>
            <el-table-column label="有效期至" width="120" align="center"><template #default="{ row }"><span class="num">{{ row.expire }}</span></template></el-table-column>
            <el-table-column label="状态" width="96" align="center"><template #default="{ row }"><LzStatusTag :type="COUPON_STATE[row.state][0]" :text="COUPON_STATE[row.state][1]" /></template></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="积分记录" name="points">
          <el-table :data="dPoints" max-height="340" empty-text="还没有积分记录">
            <el-table-column label="时间" width="150" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
            <el-table-column label="变动（分）" width="104" align="right"><template #default="{ row }"><span class="num">{{ row.delta > 0 ? '+' : '−' }}{{ Math.abs(row.delta) }}</span></template></el-table-column>
            <el-table-column label="变动后（分）" width="112" align="right"><template #default="{ row }"><span class="num">{{ row.balance }}</span></template></el-table-column>
            <el-table-column label="原因" prop="reason" min-width="130" />
            <el-table-column label="操作人" prop="by" width="90" align="center" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="操作记录" name="audit">
          <el-table :data="dAudit" max-height="340" empty-text="还没有对这位会员的操作记录">
            <el-table-column label="时间" width="150" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
            <el-table-column label="操作人" prop="actor" width="90" align="center" />
            <el-table-column label="操作" prop="action" min-width="160" />
            <el-table-column label="结果" prop="result" width="80" align="center" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </LzDialog>

    <LzDialog v-model="ask.open" :title="ask.title" width="440px" :danger="ask.danger" :confirm-text="ask.ok" :on-confirm="ask.run"><p>{{ ask.text }}</p></LzDialog>

    <LzDialog v-model="dis.open" :title="dis.list.length > 1 ? `批量禁用 ${dis.list.length} 名会员` : '禁用会员：' + (dis.list[0]?.name || '')" width="460px" danger confirm-text="确认禁用" :confirm-disabled="!dis.reason.trim()" :on-confirm="doDisable">
      <p v-if="dis.list.length === 1">禁用后该会员不能下单，也不能领券；已支付的订单照常履约<template v-if="pendingOf(dis.list[0].id)">（目前有 {{ pendingOf(dis.list[0].id) }} 笔待支付或待履约订单）</template>。</p>
      <p v-else>禁用后这些会员不能下单、不能领券；已禁用的会跳过，每人的结果会逐条列出。</p>
      <el-form label-position="top" @submit.prevent><el-form-item label="禁用原因（必填）"><el-input v-model="dis.reason" type="textarea" :rows="3" maxlength="100" show-word-limit /></el-form-item></el-form>
    </LzDialog>

    <LzDialog v-model="pt.open" :title="'调整积分：' + (pt.u?.name || '')" width="460px" confirm-text="确认调整" :confirm-disabled="!!ptError || !pt.reason.trim()" :on-confirm="doPoints">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="方向"><el-radio-group v-model="pt.dir"><el-radio-button value="add">增加积分</el-radio-button><el-radio-button value="sub">扣减积分</el-radio-button></el-radio-group></el-form-item>
        <el-form-item label="积分数（单次最多 5000）" :error="ptError"><el-input-number v-model="pt.n" :min="1" :max="5000" :step="10" :precision="0" /></el-form-item>
        <el-form-item label="调整原因（必填）"><el-input v-model="pt.reason" type="textarea" :rows="2" maxlength="100" show-word-limit /></el-form-item>
      </el-form>
      <p class="num">调整前 {{ pt.u?.points }} 分，调整后 <strong>{{ (pt.u?.points || 0) + ptDelta }}</strong> 分；会记入积分记录和操作记录。</p>
    </LzDialog>

    <LzDialog v-model="cp.open" :title="cpOne ? '给 ' + cp.list[0].name + ' 发券' : `给 ${cp.list.length} 名会员发券`" width="480px" confirm-text="确认发放" :confirm-disabled="!!cpError || (!cpOne && !cp.reason.trim())" :on-confirm="doCoupon">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="券"><el-select v-model="cp.cid"><el-option v-for="c in liveCoupons" :key="c.id" :value="c.id" :label="`${c.name}（剩余 ${c.stock - c.claimed} 张）`" /></el-select></el-form-item>
        <el-form-item label="每人张数（1 到 5）"><el-input-number v-model="cp.n" :min="1" :max="5" :precision="0" /></el-form-item>
        <el-form-item :label="cpOne ? '发放原因（选填）' : '发放原因（必填）'"><el-input v-model="cp.reason" type="textarea" :rows="2" maxlength="100" show-word-limit /></el-form-item>
      </el-form>
      <el-alert v-if="cpError" :title="cpError" type="warning" show-icon :closable="false" />
      <p v-else-if="!cpOne" class="muted">已禁用的会员和已达每人限领的会员会被跳过，结果逐条列出。</p>
    </LzDialog>

    <LzDialog v-model="rep.open" :title="rep.title" width="460px" no-footer>
      <div class="row"><el-tag type="success" effect="light">成功 {{ rep.ok }} 人</el-tag><el-tag :type="rep.fails.length ? 'danger' : 'info'" effect="light">失败 {{ rep.fails.length }} 人</el-tag></div>
      <el-table v-if="rep.fails.length" :data="rep.fails" max-height="260" class="fails">
        <el-table-column label="会员" prop="name" width="110" align="center" />
        <el-table-column label="原因" prop="reason" />
      </el-table>
      <p v-else class="muted">已全部处理完成。</p>
      <div class="right"><el-button type="primary" @click="rep.open = false">知道了</el-button></div>
    </LzDialog>

    <LzDialog v-model="exp.open" title="导出会员" width="460px" confirm-text="开始导出" :on-confirm="doExport">
      <p>导出范围：当前筛选结果（{{ scopeName }}），共 <strong class="num">{{ filtered.length }}</strong> 人。表头是中文，手机号已脱敏，不含内部编号和空列。</p>
    </LzDialog>
  </div>
</template>

<style scoped>
.tab-count { margin-left: 6px; color: var(--luz-ink-2); font-weight: 400; }
.tab-count.zero { color: var(--luz-ink-3); opacity: .7; }
.filters { margin-bottom: 12px; }
.batch { margin-bottom: 12px; padding: 8px 12px; background: var(--luz-action-tint); border-radius: var(--luz-radius-control); }
.note { margin: 8px 0 0; }
.d-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 16px; }
.gap { margin-left: 8px; }
.fails { margin: 12px 0; }
strong { font-weight: 600; }
.range-box { flex: none; width: 250px; }
</style>
