<script>
// 优惠券：看板分列。每张券处在草稿、进行中、已结束三列之一，在列之间推进状态；顶部只留三个汇总数字。
export const meta = {
  id: 'coupons', label: '优惠券', icon: 'tag', group: '商品与营销', order: 2, roles: ['A'],
  layout: '看板分列',
  reason: '运营每天要看的是每张券处在哪个阶段、发出去多少、用掉多少，并在草稿、进行中、已结束之间推进：券按状态分三列，卡片用小进度条显示领取和使用，顶部只留三个汇总数字',
  scenes: [
    { id: 'nodata', label: '还没有任何券' },
    { id: 'publish-fail', label: '发布失败：与进行中的券互斥冲突' },
    { id: 'send-fail', label: '发放失败：发放通道繁忙' },
    { id: 'codes-fail', label: '兑换码生成失败：库存不够' },
  ],
}
</script>

<script setup>
import { computed, onMounted, reactive, ref, toRaw } from 'vue'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, money } from '../../shared/format.js'

const scene = useScene('coupons')
const phase = ref('loading')                                    // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

// ---- helpers
const today = K.ymd(B.NOW())
const parse = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
const dAdd = (s, n) => K.ymd(K.addDays(parse(s), n))
const md = (s) => (!s ? '' : s.slice(0, 4) === today.slice(0, 4) ? s.slice(5) : s)
const last4 = (p) => p.slice(-4)
const nowStr = () => B.fmt(B.NOW())
const actor = () => (state.role === 'F' ? '陈晓燕' : '王海燕')
const audit = (code, action, target, result = '成功') => {
  const db = state.db
  db.audit.unshift({ id: db.audit.length + 1, at: nowStr(), actor: actor(), code, action, target, result, ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16) })
}
const tgt = (c) => '优惠券 ' + c.name
const memberTgt = (u) => `会员 ${u.name}（编号 ${u.id}）`
const ownerOf = (m) => m.userId ?? state.db.me.id                 // the seed coupons belong to the signed-in demo member
const userOf = (id) => state.db.users.find((u) => u.id === id)
const validTypeOf = (c) => c.validType || 'days'
const ruleText = (c) => (c.kind === '满减' ? `满 ${money(c.threshold)} 减 ${money(c.value)}` : c.kind === '折扣' ? `${c.value / 10} 折${c.threshold ? `，满 ${money(c.threshold)} 可用` : ''}，最高减 ${money(c.cap || 0)}` : '兑换：' + String(c.scope).replace('指定商品：', ''))
const validText = (c) => (validTypeOf(c) === 'fixed' ? `${md(c.from)} 至 ${md(c.to)}` : `领取后 ${c.days} 天内有效`)
const col = (c) => (c.status === 'DRAFT' ? 'DRAFT' : c.status === 'OFF' || (validTypeOf(c) === 'fixed' && c.to < today) ? 'ENDED' : 'ON')
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)

// ---- the shared demo data has no drafts and no dates on the records: two drafts (one that fails the publish check) are added once per data set
const seeded = new WeakSet()
function seedDemo() {
  const T = state.db.coupons; let next = Math.max(0, ...T.map((c) => c.id)) + 1
  if (!T.some((c) => c.status === 'DRAFT')) {
    T.push(
      { id: next++, name: '周末满 100 减 15', kind: '满减', threshold: 10000, value: 1500, scope: '分类：主食', scopeKind: 'cat', validType: 'fixed', from: dAdd(today, 2), to: dAdd(today, 30), days: 0, stock: 200, claimed: 0, used: 0, perUser: 1, status: 'DRAFT', excl: '不与其他券同享', createdAt: dAdd(today, -1) + ' 16:20' },
      { id: next++, name: '新人 5 元券', kind: '满减', threshold: 300, value: 500, scope: '全部商品', scopeKind: 'all', validType: 'days', from: '', to: '', days: 14, stock: 500, claimed: 0, used: 0, perUser: 1, status: 'DRAFT', excl: '不与其他券同享', createdAt: dAdd(today, -2) + ' 11:05' },
    )
  }
  state.db.myCoupons.forEach((m, i) => { if (!m.at) { m.at = dAdd(today, -[3, 4, 12, 15][i % 4]) + ' 12:00'; m.source = '领取'; if (m.state === 'USED') m.usedAt = dAdd(today, -8) + ' 12:30' } })
  if (!state.db.couponCodes) state.db.couponCodes = []
}
const key = toRaw(state.db.coupons)
if (!seeded.has(key)) { seedDemo(); seeded.add(key) }

// ---- the board
const coupons = computed(() => (scene.value === 'nodata' ? [] : state.db.coupons))
const COLS = [['DRAFT', '草稿', '还没发布，可以编辑和删除'], ['ON', '进行中', '会员现在可以领取'], ['ENDED', '已结束', '不能再领取，已领的券用到过期']]
const inCol = (id) => coupons.value.filter((c) => col(c) === id)
const status = computed(() => (phase.value !== 'ok' ? phase.value : coupons.value.length ? 'ok' : 'empty'))
const live = computed(() => coupons.value.filter((c) => c.status !== 'DRAFT'))
const stats = computed(() => {
  const stock = live.value.reduce((a, c) => a + c.stock, 0); const claimed = live.value.reduce((a, c) => a + c.claimed, 0); const used = live.value.reduce((a, c) => a + c.used, 0)
  const orders = state.db.orders.filter((o) => o.coupon && ['PAID', 'FULFILLED', 'DONE'].includes(o.status))
  return { stock, claimed, used, orders: orders.length, rev: orders.reduce((a, o) => a + o.amount, 0), disc: orders.reduce((a, o) => a + o.discount, 0) }
})
const COL_TAG = { DRAFT: ['info', '草稿'], ON: ['success', '进行中'], ENDED: ['warning', '已结束'] }

// ---- shared pieces: a confirm dialog and a batch result
const ask = reactive({ open: false, title: '', text: '', ok: '确认', danger: false, run: null })
const askConfirm = (title, text, ok, run, danger = false) => Object.assign(ask, { open: true, title, text, ok, run, danger })
const rep = reactive({ open: false, title: '', ok: 0, fails: [] })

// ---- 发布前的逐项检查
function publishIssues(c) {
  const e = []
  if (c.kind === '满减') { if (!(c.value > 0)) e.push('面额要大于 0'); if (c.threshold < c.value) e.push(`门槛 ${money(c.threshold)} 低于面额 ${money(c.value)}，门槛不能小于面额`) }
  if (c.kind === '折扣') { if (!(c.cap > 0)) e.push('折扣券需要设置封顶金额'); if (c.value < 10 || c.value > 99) e.push('折扣要在 1 折到 9.9 折之间') }
  if (!(c.stock >= 1)) e.push('库存要不少于 1 张')
  if (c.stock < c.claimed) e.push(`库存不能低于已领取的 ${c.claimed} 张`)
  if (!(c.perUser >= 1)) e.push('每人限领至少 1 张')
  if (validTypeOf(c) === 'fixed' && c.to < today) e.push('有效期已经过去，请改成今天之后')
  if (validTypeOf(c) === 'days' && !(c.days >= 1)) e.push('领取后的有效天数要不少于 1 天')
  return e
}
const pub = reactive({ open: false, c: null, issues: [] })
function askPublish(c) {
  const issues = publishIssues(c)
  if (issues.length) return Object.assign(pub, { open: true, c, issues })
  askConfirm('发布优惠券', `发布后会员马上可以领取。发布后券的类型和有效期类型不能再改，库存不能低于已领数量，每人限领只能放宽。确认发布「${c.name}」？`, '确认发布', async () => {
    await request(450, { fail: scene.value === 'publish-fail' ? new Error(`发布失败：「${c.name}」与进行中的「满 30 减 3」适用范围和时间重叠，互斥规则冲突，券仍是草稿，请先调整范围或有效期`) : null })
    c.status = 'ON'; audit('coupon:edit', '发布优惠券', tgt(c)); ElMessage.success(`已发布「${c.name}」`)
  })
}
function askEnd(c) {
  const left = state.db.myCoupons.filter((m) => m.couponId === c.id && m.state === 'UNUSED').length
  askConfirm('结束优惠券', `结束「${c.name}」后会员不能再领取。已经领取、还没使用的 ${left} 张券仍然可以使用到各自的有效期结束，不会被收回。`, '确认结束', async () => {
    await request(400)
    c.status = 'OFF'; audit('coupon:edit', `结束优惠券（已领未用 ${left} 张照常可用）`, tgt(c)); ElMessage.success(`已结束「${c.name}」`)
  }, true)
}
function askReopen(c) {
  if (c.status !== 'OFF') return ElMessage.error(`「${c.name}」的有效期已过，请先编辑有效期再开启`)
  askConfirm('重新开启', `重新开启后会员又可以领取「${c.name}」。`, '确认开启', async () => {
    await request(400)
    c.status = 'ON'; audit('coupon:edit', '重新开启优惠券', tgt(c)); ElMessage.success('已重新开启')
  })
}
function askDelete(c) {
  if (c.claimed > 0) return ElMessage.error(`这张券已有 ${c.claimed} 条领取记录，不能删除，只能结束`)
  askConfirm('删除优惠券', `将删除优惠券「${c.name}」，删除后不能恢复。`, '确认删除', async () => {
    await request(400)
    state.db.coupons.splice(state.db.coupons.indexOf(c), 1); audit('coupon:edit', '删除优惠券', tgt(c)); ElMessage.success(`已删除「${c.name}」`)
    if (detail.id === c.id) detail.open = false
  }, true)
}

// ---- 新建与编辑
const ed = reactive({ open: false, c: null, locked: false, f: {} })
const form = ref(null)
const cats = B.CATS
const prods = computed(() => state.db.products)
function askEdit(c0) {
  const c = c0 || { name: '', kind: '满减', threshold: 0, value: 0, cap: 0, scope: '全部商品', scopeKind: 'all', validType: 'days', from: '', to: '', days: 7, stock: 100, claimed: 0, used: 0, perUser: 1, status: 'DRAFT', excl: '不与其他券同享' }
  const sk = c.scopeKind || (c.scope === '全部商品' ? 'all' : String(c.scope).startsWith('指定商品') ? 'product' : 'cat')
  const ref0 = sk === 'cat' ? (cats.find((x) => '分类：' + x.name === c.scope) || cats[0]).id : sk === 'product' ? (prods.value.find((p) => String(c.scope).endsWith(p.name)) || prods.value[0]).id : null
  const vt = validTypeOf(c)
  Object.assign(ed, {
    open: true, c: c0, locked: !!c0 && c0.status !== 'DRAFT',
    f: { name: c.name, kind: c.kind, threshold: c.threshold ? c.threshold / 100 : c.kind === '满减' ? undefined : 0, amount: c.kind === '满减' && c.value ? c.value / 100 : undefined, rate: c.kind === '折扣' ? c.value / 10 : undefined, cap: c.cap ? c.cap / 100 : undefined, item: c.kind === '兑换' ? ref0 : prods.value[0].id, stock: c.stock, perUser: c.perUser, vtype: vt, range: vt === 'fixed' ? [c.from, c.to] : null, days: c.days || 7, scopeKind: sk, scopeRef: ref0, excl: c.excl || '不与其他券同享' },
  })
  form.value?.clearValidate()
}
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi
const rules = {
  name: [{ validator: (_, v, cb) => cb(!v || v.trim().length < 2 ? new Error('名称至少 2 个字') : state.db.coupons.some((o) => o !== ed.c && o.name === v.trim()) ? new Error('已经有同名的券') : undefined), trigger: 'blur' }],
  amount: [{ validator: (_, v, cb) => cb(ed.f.kind === '满减' && !(v > 0) ? new Error('请填写面额') : undefined), trigger: 'blur' }],
  threshold: [{ validator: (_, v, cb) => cb(ed.f.kind === '满减' && (v == null || v < 0) ? new Error('请填写使用门槛') : ed.f.kind === '满减' && ed.f.amount > 0 && v < ed.f.amount ? new Error(`门槛不能小于面额（面额 ${ed.f.amount} 元）`) : undefined), trigger: 'blur' }],
  rate: [{ validator: (_, v, cb) => cb(ed.f.kind === '折扣' && !(v >= 1 && v <= 9.9) ? new Error('折扣要在 1 到 9.9 折之间') : undefined), trigger: 'blur' }],
  cap: [{ validator: (_, v, cb) => cb(ed.f.kind === '折扣' && !(v > 0) ? new Error('折扣券要设置最高优惠，否则无法发布') : undefined), trigger: 'blur' }],
  stock: [{ validator: (_, v, cb) => cb(!isInt(v, 1, 100000) ? new Error('请填写 1 到 100000 的整数') : ed.c && v < ed.c.claimed ? new Error(`总量不能低于已领取的 ${ed.c.claimed} 张`) : undefined), trigger: 'blur' }],
  perUser: [{ validator: (_, v, cb) => cb(!isInt(v, 1, 10) ? new Error('每人限领 1 到 10 张') : ed.locked && v < ed.c.perUser ? new Error(`发布后每人限领只能放宽，当前是 ${ed.c.perUser} 张`) : undefined), trigger: 'blur' }],
  range: [{ validator: (_, v, cb) => cb(validTypeLocked() === 'fixed' && (!v || !v[0] || !v[1]) ? new Error('请选择开始和结束日期') : validTypeLocked() === 'fixed' && v[1] < today ? new Error('结束日期不能早于今天') : undefined), trigger: 'change' }],
  days: [{ validator: (_, v, cb) => cb(validTypeLocked() === 'days' && !isInt(v, 1, 365) ? new Error('请填写 1 到 365 的整数天数') : undefined), trigger: 'blur' }],
  scopeRef: [{ validator: (_, v, cb) => cb(ed.f.kind !== '兑换' && ed.f.scopeKind !== 'all' && v == null ? new Error('请选择范围对象') : undefined), trigger: 'change' }],
}
const validTypeLocked = () => (ed.locked ? validTypeOf(ed.c) : ed.f.vtype)
const kindNow = computed(() => (ed.locked ? ed.c.kind : ed.f.kind))
const scopeOptions = computed(() => (ed.f.scopeKind === 'cat' ? cats.map((x) => [x.id, x.name]) : prods.value.map((p) => [p.id, p.name])))
function onScopeKind() { ed.f.scopeRef = ed.f.scopeKind === 'all' ? null : scopeOptions.value[0][0] }
async function doEdit() {
  await form.value.validate().catch(() => { throw new Error('请先改正标红的项') })
  await request(400)
  const x = ed.f; const k = kindNow.value; const vt = validTypeLocked(); const isNew = !ed.c
  const body = { name: x.name.trim(), kind: k, stock: x.stock, perUser: x.perUser, validType: vt, from: vt === 'fixed' ? x.range[0] : '', to: vt === 'fixed' ? x.range[1] : '', days: vt === 'days' ? x.days : 0, excl: x.excl }
  body.threshold = k === '满减' ? Math.round(x.threshold * 100) : k === '折扣' ? Math.round((x.threshold || 0) * 100) : 0
  body.value = k === '满减' ? Math.round(x.amount * 100) : k === '折扣' ? Math.round(x.rate * 10) : 0
  body.cap = k === '折扣' ? Math.round(x.cap * 100) : 0
  if (k === '兑换') { body.scopeKind = 'product'; body.scope = '指定商品：' + prods.value.find((p) => p.id === x.item).name }
  else { body.scopeKind = x.scopeKind; body.scope = x.scopeKind === 'all' ? '全部商品' : x.scopeKind === 'cat' ? '分类：' + cats.find((q) => q.id === x.scopeRef).name : '指定商品：' + prods.value.find((p) => p.id === x.scopeRef).name }
  let c = ed.c
  if (isNew) { c = { id: Math.max(0, ...state.db.coupons.map((o) => o.id)) + 1, claimed: 0, used: 0, status: 'DRAFT', createdAt: nowStr(), ...body }; state.db.coupons.push(c) } else Object.assign(c, body)
  audit('coupon:edit', (isNew ? '新建优惠券（草稿）' : '修改优惠券') + '：' + ruleText(c), tgt(c))
  ElMessage.success(isNew ? `已创建草稿「${c.name}」` : `已保存「${c.name}」`)
}

// ---- 发放：批量、指定会员、兑换码
const dist = reactive({ open: false, c: null, mode: 'batch', level: 'ALL', n: 1, reason: '', uid: null, codes: 20 })
const LEVELS = [['ALL', '全部会员'], ['普通', '普通会员'], ['银卡', '银卡会员'], ['金卡', '金卡会员']]
const left = computed(() => (dist.c ? dist.c.stock - dist.c.claimed : 0))
const holds = (u, c) => state.db.myCoupons.filter((m) => ownerOf(m) === u.id && m.couponId === c.id).length
const distTargets = computed(() => state.db.users.filter((u) => dist.level === 'ALL' || u.level === dist.level))
const distPreview = computed(() => {
  if (!dist.c) return ''
  const all = distTargets.value; const dis = all.filter((u) => u.status === 'DISABLED').length
  const full = all.filter((u) => u.status === 'ENABLED' && holds(u, dist.c) + (dist.n || 0) > dist.c.perUser).length
  return `范围内 ${all.length} 人：已禁用 ${dis} 人、已达每人限领 ${full} 人将被跳过；剩余库存 ${left.value} 张。`
})
const distError = computed(() => {
  const c = dist.c; if (!c) return ''
  if (dist.mode === 'codes') return !isInt(dist.codes, 1, 500) ? '一次生成 1 到 500 个' : dist.codes > left.value ? `库存只剩 ${left.value} 张，不够生成 ${dist.codes} 个码` : ''
  if (!isInt(dist.n, 1, 3)) return '每人 1 到 3 张'
  if (dist.mode === 'batch') return ''
  const u = userOf(dist.uid); if (!u) return '请选择会员'
  if (u.status === 'DISABLED') return '这位会员已禁用，不能发券'
  if (holds(u, c) + dist.n > c.perUser) return `${u.name} 已领 ${holds(u, c)} 张，超过每人限领 ${c.perUser} 张`
  if (c.claimed + dist.n > c.stock) return `库存只剩 ${left.value} 张`
  return ''
})
const distDisabled = computed(() => !!distError.value || (dist.mode === 'batch' && !dist.reason.trim()))
function askDistribute(c) {
  if (col(c) !== 'ON') return ElMessage.error('只有进行中的券可以发放')
  Object.assign(dist, { open: true, c, mode: 'batch', level: 'ALL', n: 1, reason: '', uid: state.db.users.find((u) => u.status === 'ENABLED').id, codes: 20 })
}
function grant(c, u, n) {
  for (let i = 0; i < n; i++) state.db.myCoupons.unshift({ id: Math.max(0, ...state.db.myCoupons.map((m) => m.id)) + 1, userId: u.id, couponId: c.id, name: c.name, kind: c.kind, threshold: c.threshold, value: c.value, expire: validTypeOf(c) === 'fixed' ? c.to : dAdd(today, c.days), state: 'UNUSED', at: nowStr(), source: '后台发放' })
  c.claimed += n
}
const codesDone = reactive({ open: false, c: null, made: [] })
async function doDistribute() {
  const c = dist.c; const n = dist.n
  const busy = new Error('发放失败：发放通道繁忙，没有发出任何券，请稍后再试')
  if (dist.mode === 'batch') {
    await request(700, { fail: scene.value === 'send-fail' ? busy : null })
    let ok = 0; const fails = []
    distTargets.value.forEach((u) => {
      if (u.status === 'DISABLED') return fails.push({ name: u.name, reason: '会员已禁用' })
      if (holds(u, c) + n > c.perUser) return fails.push({ name: u.name, reason: `已领 ${holds(u, c)} 张，超过每人限领 ${c.perUser} 张` })
      if (c.claimed + n > c.stock) return fails.push({ name: u.name, reason: '库存不足' })
      grant(c, u, n); ok += 1
    })
    audit('coupon:edit', `批量发放「${c.name}」×${n}，对象：${LEVELS.find((l) => l[0] === dist.level)[1]}，成功 ${ok} 人：${dist.reason.trim()}`, tgt(c))
    Object.assign(rep, { open: true, title: '批量发放结果', ok, fails })
  } else if (dist.mode === 'single') {
    await request(400, { fail: scene.value === 'send-fail' ? busy : null })
    const u = userOf(dist.uid); grant(c, u, n)
    audit('coupon:edit', `给会员发放「${c.name}」×${n}`, memberTgt(u)); ElMessage.success('已发给 ' + u.name)
  } else {
    await request(600, { fail: scene.value === 'codes-fail' ? new Error(`兑换码生成失败：库存只剩 ${left.value} 张，其中一部分已被其他批次的兑换码占用，没有生成。请先补充库存或减少数量`) : null })
    const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const made = []
    for (let i = 0; i < dist.codes; i++) { let s = ''; for (let k = 0; k < 8; k++) s += ch[Math.floor(Math.random() * ch.length)]; made.push({ code: s, couponId: c.id, state: 'UNUSED', at: nowStr() }) }
    state.db.couponCodes.push(...made); audit('coupon:edit', `生成兑换码 ${made.length} 个`, tgt(c))
    Object.assign(codesDone, { open: true, c, made })
  }
}
const distConfirmText = computed(() => (dist.mode === 'codes' ? '生成' : '确认发放'))
function askExportCodes(c, n) {
  askConfirm('导出兑换码', `将导出「${c.name}」的 ${n} 个兑换码，文件里是完整明文，请妥善保管。`, '开始导出', async () => {
    await request(600)
    const file = `兑换码_${c.name}_${today}.xlsx`
    state.db.exportTasks.unshift({ id: state.db.exportTasks.length + 1, name: file, kind: '兑换码', rows: n, status: 'DONE', at: nowStr(), by: actor() })
    audit('export', '导出兑换码', file); ElMessage.success(`已生成「${file}」`)
  })
}

// ---- 详情
const detail = reactive({ open: false, id: null, tab: 'info' })
const dc = computed(() => state.db.coupons.find((c) => c.id === detail.id) || null)
const openDetail = (c) => Object.assign(detail, { open: true, id: c.id, tab: 'info' })
const recs = computed(() => (dc.value ? state.db.myCoupons.filter((m) => m.couponId === dc.value.id) : []))
const days14 = Array.from({ length: 14 }, (_, i) => dAdd(today, i - 13))
const gotSeries = computed(() => days14.map((d) => recs.value.filter((m) => (m.at || '').slice(0, 10) === d).length))
const usedSeries = computed(() => days14.map((d) => recs.value.filter((m) => (m.usedAt || '').slice(0, 10) === d).length))
const chartData = computed(() => [{ name: '领取', data: gotSeries.value }, { name: '使用', data: usedSeries.value }])
const hasChart = computed(() => gotSeries.value.concat(usedSeries.value).reduce((a, b) => a + b, 0) >= 3)
const dCodes = computed(() => (dc.value ? state.db.couponCodes.filter((x) => x.couponId === dc.value.id) : []))
const dAudit = computed(() => (dc.value ? state.db.audit.filter((a) => a.target.startsWith('优惠券 ' + dc.value.name)) : []))
const REC_STATE = { UNUSED: ['success', '未使用'], USED: ['info', '已使用'], EXPIRED: ['warning', '已过期'] }
</script>

<template>
  <div class="lz-page">
    <div class="lz-toolbar">
      <span class="muted num">已领 {{ stats.claimed }} / 总量 {{ stats.stock }} 张；已用 {{ stats.used }} / 已领 {{ stats.claimed }} 张；{{ stats.orders }} 单使用了优惠券，让利 {{ money(stats.disc) }}</span>
      <span class="grow" />
      <el-button :icon="Refresh" @click="load">刷新</el-button>
      <el-button type="primary" :icon="Plus" @click="askEdit(null)">新建券</el-button>
    </div>

    <section aria-label="优惠券汇总" class="lz-kpis kpis">
      <LzKpi label="总领取率" :value="pct(stats.claimed, stats.stock).toFixed(1)" suffix="%" />
      <LzKpi label="使用率" :value="pct(stats.used, stats.claimed).toFixed(1)" suffix="%" />
      <LzKpi label="带来的营业额" :value="(stats.rev / 100).toFixed(2)" suffix="元" />
    </section>

    <LzState :status="status" empty-title="还没有任何券，点“新建券”创建第一张" error-hint="优惠券没有加载出来，请检查网络后重试" @retry="load">
      <div class="board">
        <el-card v-for="[id, title, hint] in COLS" :key="id" shadow="never" class="lz-card col" :aria-label="title">
          <template #header>
            <div class="row"><strong>{{ title }}</strong><el-tag :type="inCol(id).length ? COL_TAG[id][0] : 'info'" effect="light">{{ inCol(id).length }} 张</el-tag></div>
            <div class="muted">{{ hint }}</div>
          </template>
          <div v-if="inCol(id).length" class="cards">
            <el-card v-for="c in inCol(id)" :key="c.id" shadow="never" class="cp" :aria-label="c.name">
              <div class="row"><strong class="grow">{{ c.name }}</strong><el-tag type="primary" effect="light">{{ c.kind }}</el-tag><el-tag v-if="id === 'ON' && c.claimed >= c.stock" type="warning" effect="light">已领完</el-tag><el-tag v-if="id === 'ENDED' && c.status !== 'OFF'" type="info" effect="light">有效期已过</el-tag></div>
              <div class="rule">{{ ruleText(c) }}</div>
              <div class="meter"><div class="row"><span class="muted grow">领取</span><span class="num">{{ c.claimed }} / {{ c.stock }}</span></div><el-progress :percentage="c.stock ? Math.min(100, (c.claimed / c.stock) * 100) : 0" :show-text="false" :stroke-width="6" :aria-label="`${c.name} 领取 ${c.claimed} / ${c.stock}`" /></div>
              <div class="meter"><div class="row"><span class="muted grow">使用</span><span class="num">{{ c.used }} / {{ c.claimed }}</span></div><el-progress :percentage="c.claimed ? Math.min(100, (c.used / c.claimed) * 100) : 0" :show-text="false" :stroke-width="6" color="var(--luz-accent)" :aria-label="`${c.name} 使用 ${c.used} / ${c.claimed}`" /></div>
              <div class="muted">{{ c.scope }} · {{ validText(c) }}</div>
              <div class="row acts">
                <el-button text type="primary" :aria-label="'查看 ' + c.name" @click="openDetail(c)">查看</el-button>
                <template v-if="id === 'DRAFT'">
                  <el-button text type="primary" @click="askEdit(c)">编辑</el-button>
                  <el-button text type="primary" @click="askPublish(c)">发布</el-button>
                  <el-button text type="danger" @click="askDelete(c)">删除</el-button>
                </template>
                <template v-else-if="id === 'ON'">
                  <el-button text type="primary" @click="askDistribute(c)">发放</el-button>
                  <el-button text type="danger" @click="askEnd(c)">结束</el-button>
                </template>
                <el-button v-else-if="c.status === 'OFF'" text type="primary" @click="askReopen(c)">重新开启</el-button>
              </div>
            </el-card>
          </div>
          <el-empty v-else :description="id === 'DRAFT' ? '没有草稿，点“新建券”创建' : '这一列暂时没有券'" :image-size="64" />
        </el-card>
      </div>
    </LzState>

    <!-- detail -->
    <LzDialog v-model="detail.open" :title="'优惠券详情：' + (dc?.name || '')" width="min(760px, 94vw)" no-footer>
      <el-tabs v-if="dc" v-model="detail.tab">
        <el-tab-pane label="概况" name="info">
          <div class="stack">
            <div class="d-kpis">
              <el-statistic title="已领取" :value="dc.claimed" suffix="张" />
              <el-statistic title="已使用" :value="dc.used" suffix="张" />
              <el-statistic title="库存剩余" :value="dc.stock - dc.claimed" suffix="张" />
              <el-statistic title="使用率" :value="pct(dc.used, dc.claimed)" suffix="%" :precision="1" />
            </div>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="券名称">{{ dc.name }}</el-descriptions-item>
              <el-descriptions-item label="状态"><LzStatusTag :type="COL_TAG[col(dc)][0]" :text="COL_TAG[col(dc)][1]" /></el-descriptions-item>
              <el-descriptions-item label="类型与面额" :span="2">{{ dc.kind }}：{{ ruleText(dc) }}</el-descriptions-item>
              <el-descriptions-item label="适用范围">{{ dc.scope }}</el-descriptions-item>
              <el-descriptions-item label="有效期">{{ validText(dc) }}</el-descriptions-item>
              <el-descriptions-item label="每人限领">{{ dc.perUser }} 张</el-descriptions-item>
              <el-descriptions-item label="互斥规则">{{ dc.excl || '不与其他券同享' }}</el-descriptions-item>
              <el-descriptions-item label="创建时间" :span="2"><span class="num">{{ dc.createdAt || '—' }}</span></el-descriptions-item>
            </el-descriptions>
            <div class="row">
              <el-button v-if="col(dc) === 'DRAFT'" @click="askEdit(dc)">编辑</el-button>
              <el-button v-else @click="askEdit(dc)">修改限制</el-button>
              <el-button v-if="col(dc) === 'ON'" type="primary" plain @click="askDistribute(dc)">发放</el-button>
              <el-button v-if="col(dc) === 'ON'" @click="askEnd(dc)">结束</el-button>
              <el-button v-if="col(dc) === 'ENDED' && dc.status === 'OFF'" @click="askReopen(dc)">重新开启</el-button>
              <el-button v-if="col(dc) === 'DRAFT'" type="primary" plain @click="askPublish(dc)">发布</el-button>
              <el-button type="danger" plain :disabled="dc.claimed > 0" @click="askDelete(dc)">删除</el-button>
              <span v-if="dc.claimed > 0" class="muted">已有领取记录，只能结束，不能删除</span>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="领取记录" name="claims">
          <p class="muted">累计领取 {{ dc.claimed }} 张，下面列出最近的 {{ Math.min(recs.length, 40) }} 条。</p>
          <el-table :data="recs.slice(0, 40)" max-height="320" empty-text="还没有人领取">
            <el-table-column label="会员" width="100" align="center"><template #default="{ row }">{{ userOf(ownerOf(row))?.name }}</template></el-table-column>
            <el-table-column v-if="recs.some((m) => m.at)" label="领取时间" width="150" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
            <el-table-column label="来源" width="100" align="center"><template #default="{ row }">{{ row.source || '领取' }}</template></el-table-column>
            <el-table-column label="有效期至" width="120" align="center"><template #default="{ row }"><span class="num">{{ row.expire }}</span></template></el-table-column>
            <el-table-column label="状态" width="96" align="center"><template #default="{ row }"><LzStatusTag :type="REC_STATE[row.state][0]" :text="REC_STATE[row.state][1]" /></template></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="使用统计" name="stat">
          <div class="d-kpis">
            <el-statistic title="领取率" :value="pct(dc.claimed, dc.stock)" suffix="%" :precision="1" />
            <el-statistic title="使用率" :value="pct(dc.used, dc.claimed)" suffix="%" :precision="1" />
            <el-statistic title="已领未用" :value="recs.filter((m) => m.state === 'UNUSED').length" suffix="张" />
            <el-statistic title="已过期未用" :value="recs.filter((m) => m.state === 'EXPIRED').length" suffix="张" />
          </div>
          <LzChart v-if="hasChart" kind="bar" :categories="days14.map((d) => md(d))" :series="chartData" :height="200" unit=" 张" label="近 14 天领取与使用" />
          <el-empty v-else description="近 14 天的领取和使用记录太少，暂不画图" :image-size="64" />
        </el-tab-pane>
        <el-tab-pane label="兑换码" name="codes">
          <template v-if="dCodes.length">
            <el-table :data="dCodes.slice(0, 30)" max-height="280">
              <el-table-column label="兑换码" width="140" align="center"><template #default="{ row }"><span class="num">{{ row.code.slice(0, 4) }}****</span></template></el-table-column>
              <el-table-column label="生成时间" width="160" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
              <el-table-column label="状态" width="100" align="center"><template #default="{ row }">{{ row.state === 'USED' ? '已兑换' : '未兑换' }}</template></el-table-column>
            </el-table>
            <div class="right codes-act"><el-button @click="askExportCodes(dc, dCodes.length)">导出完整兑换码</el-button></div>
          </template>
          <span v-else class="muted">还没有为这张券生成过兑换码。</span>
        </el-tab-pane>
        <el-tab-pane label="操作记录" name="audit">
          <el-table :data="dAudit" max-height="320" empty-text="还没有操作记录">
            <el-table-column label="时间" width="150" align="center"><template #default="{ row }"><span class="num">{{ row.at }}</span></template></el-table-column>
            <el-table-column label="操作人" prop="actor" width="90" align="center" />
            <el-table-column label="操作" prop="action" min-width="200" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </LzDialog>

    <!-- 新建与编辑 -->
    <LzDialog v-model="ed.open" :title="ed.c ? '编辑优惠券：' + ed.c.name : '新建优惠券'" width="min(620px, 94vw)" :confirm-text="ed.c ? '保存' : '创建草稿'" :on-confirm="doEdit">
      <el-alert :title="ed.locked ? '这张券已经发布：类型和有效期类型不能再改；修改只影响之后领取的券，已领的券按领取时的规则使用。' : '先保存成草稿，检查无误后在看板上点“发布”才会生效。'" type="info" show-icon :closable="false" class="alert" />
      <el-form ref="form" :model="ed.f" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="券名称" prop="name"><el-input v-model="ed.f.name" maxlength="20" show-word-limit /></el-form-item>
        <el-form-item label="类型"><el-radio-group v-model="ed.f.kind" :disabled="ed.locked"><el-radio-button value="满减">满减</el-radio-button><el-radio-button value="折扣">折扣</el-radio-button><el-radio-button value="兑换">兑换</el-radio-button></el-radio-group></el-form-item>
        <template v-if="kindNow === '满减'">
          <el-form-item label="使用门槛（元，不能小于面额）" prop="threshold"><el-input-number v-model="ed.f.threshold" :min="0" :precision="2" :controls="false" /></el-form-item>
          <el-form-item label="面额（元）" prop="amount"><el-input-number v-model="ed.f.amount" :min="0" :precision="2" :controls="false" /></el-form-item>
        </template>
        <template v-if="kindNow === '折扣'">
          <el-form-item label="使用门槛（元，0 表示无门槛）" prop="threshold"><el-input-number v-model="ed.f.threshold" :min="0" :precision="2" :controls="false" /></el-form-item>
          <el-form-item label="折扣（几折，8.5 表示八五折）" prop="rate"><el-input-number v-model="ed.f.rate" :min="1" :max="9.9" :precision="1" :step="0.5" /></el-form-item>
          <el-form-item label="最高优惠（元，折扣券必须设置封顶）" prop="cap"><el-input-number v-model="ed.f.cap" :min="0" :precision="2" :controls="false" /></el-form-item>
        </template>
        <el-form-item v-if="kindNow === '兑换'" label="兑换商品"><el-select v-model="ed.f.item" filterable><el-option v-for="p in prods" :key="p.id" :value="p.id" :label="p.name" /></el-select></el-form-item>
        <el-form-item :label="'总量（张）' + (ed.c ? '，不能低于已领取的 ' + ed.c.claimed + ' 张' : '')" prop="stock"><el-input-number v-model="ed.f.stock" :min="1" :max="100000" :precision="0" /></el-form-item>
        <el-form-item :label="'每人限领（张）' + (ed.locked ? '，发布后只能放宽' : '')" prop="perUser"><el-input-number v-model="ed.f.perUser" :min="1" :max="10" :precision="0" /></el-form-item>
        <el-form-item label="有效期类型"><el-radio-group v-model="ed.f.vtype" :disabled="ed.locked"><el-radio-button value="fixed">固定日期区间</el-radio-button><el-radio-button value="days">领取后 N 天内有效</el-radio-button></el-radio-group></el-form-item>
        <el-form-item v-if="validTypeLocked() === 'fixed'" label="有效日期" prop="range"><el-date-picker v-model="ed.f.range" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" /></el-form-item>
        <el-form-item v-else label="领取后有效天数" prop="days"><el-input-number v-model="ed.f.days" :min="1" :max="365" :precision="0" /></el-form-item>
        <template v-if="kindNow !== '兑换'">
          <el-form-item label="适用范围"><el-radio-group v-model="ed.f.scopeKind" @change="onScopeKind"><el-radio value="all">全部商品</el-radio><el-radio value="cat">指定分类</el-radio><el-radio value="product">指定商品</el-radio></el-radio-group></el-form-item>
          <el-form-item v-if="ed.f.scopeKind !== 'all'" label="范围对象" prop="scopeRef"><el-select v-model="ed.f.scopeRef" filterable><el-option v-for="[v, l] in scopeOptions" :key="v" :value="v" :label="l" /></el-select></el-form-item>
        </template>
        <el-form-item label="互斥规则"><el-select v-model="ed.f.excl"><el-option value="不与其他券同享" label="不与其他券同享" /><el-option value="可与满减券叠加" label="可与满减券叠加" /><el-option value="与活动价互斥" label="与活动价互斥" /></el-select></el-form-item>
      </el-form>
    </LzDialog>

    <!-- 发放 -->
    <LzDialog v-model="dist.open" :title="'发放「' + (dist.c?.name || '') + '」'" width="min(500px, 94vw)" :confirm-text="distConfirmText" :confirm-disabled="distDisabled" :on-confirm="doDistribute">
      <el-tabs v-model="dist.mode">
        <el-tab-pane label="批量发放" name="batch" />
        <el-tab-pane label="指定会员" name="single" />
        <el-tab-pane label="兑换码" name="codes" />
      </el-tabs>
      <el-form label-position="top" @submit.prevent>
        <template v-if="dist.mode === 'batch'">
          <el-form-item label="发放对象"><el-select v-model="dist.level"><el-option v-for="[v, l] in LEVELS" :key="v" :value="v" :label="l" /></el-select></el-form-item>
          <el-form-item :label="`每人张数（1 到 3，本券每人限领 ${dist.c?.perUser} 张）`" :error="distError"><el-input-number v-model="dist.n" :min="1" :max="3" :precision="0" /></el-form-item>
          <el-form-item label="发放原因（必填）"><el-input v-model="dist.reason" type="textarea" :rows="2" maxlength="100" show-word-limit placeholder="例如：新品上市回馈老会员" /></el-form-item>
          <p class="muted">{{ distPreview }}</p>
        </template>
        <template v-else-if="dist.mode === 'single'">
          <el-form-item label="会员"><el-select v-model="dist.uid" filterable><el-option v-for="u in state.db.users" :key="u.id" :value="u.id" :label="`${u.name}（尾号 ${last4(u.phone)}${u.status === 'DISABLED' ? '，已禁用' : ''}）`" /></el-select></el-form-item>
          <el-form-item label="张数（1 到 3）" :error="distError"><el-input-number v-model="dist.n" :min="1" :max="3" :precision="0" /></el-form-item>
        </template>
        <template v-else>
          <el-form-item :label="`生成数量（一次最多 500 个，剩余库存 ${left} 张）`" :error="distError"><el-input-number v-model="dist.codes" :min="1" :max="500" :precision="0" /></el-form-item>
          <p class="muted">每个码只能兑换一次；完整明文只在导出文件里。</p>
        </template>
      </el-form>
    </LzDialog>

    <LzDialog v-model="pub.open" :title="'不能发布「' + (pub.c?.name || '') + '」'" width="460px" no-footer>
      <p>下面 {{ pub.issues.length }} 项没通过检查，请先编辑：</p>
      <el-alert v-for="t in pub.issues" :key="t" :title="t" type="error" show-icon :closable="false" class="issue" />
      <div class="right"><el-button @click="pub.open = false">知道了</el-button><el-button type="primary" @click="pub.open = false; askEdit(pub.c)">去编辑</el-button></div>
    </LzDialog>

    <LzDialog v-model="codesDone.open" title="兑换码已生成" width="460px" no-footer>
      <p>已为「{{ codesDone.c?.name }}」生成 <strong class="num">{{ codesDone.made.length }}</strong> 个兑换码（示例：<span class="num">{{ codesDone.made.slice(0, 3).map((x) => x.code.slice(0, 4) + '****').join('、') }}</span>）。完整明文只在导出文件里。</p>
      <div class="right"><el-button @click="codesDone.open = false">关闭</el-button><el-button type="primary" @click="codesDone.open = false; askExportCodes(codesDone.c, codesDone.made.length)">导出</el-button></div>
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

    <LzDialog v-model="ask.open" :title="ask.title" width="460px" :danger="ask.danger" :confirm-text="ask.ok" :on-confirm="ask.run"><p>{{ ask.text }}</p></LzDialog>
  </div>
</template>

<style scoped>
.kpis { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.board { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; align-items: start; }
.col :deep(.el-card__header) { display: grid; gap: 4px; }
.cards { display: grid; gap: 12px; }
.cp { border-color: var(--luz-line); }
.cp :deep(.el-card__body) { display: grid; gap: 8px; padding: 12px; }
.rule { font-weight: 600; }
.meter { display: grid; gap: 2px; }
.acts { gap: 0; margin-left: -12px; }
.alert { margin-bottom: 16px; }
.issue { margin-bottom: 8px; }
.d-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 16px; margin-bottom: 16px; }
.fails { margin: 12px 0; }
.codes-act { margin-top: 12px; }
strong { font-weight: 600; }
</style>
