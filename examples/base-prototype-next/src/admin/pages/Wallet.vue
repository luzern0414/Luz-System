<script>
// 储值：横带分层。财务和店长先看钱有多少、对不对得上，再往下看流水、方案和对账。读写 state.db 的 walletLogs / walletPlans / users.balance，
// 以及本页补充的 walletOpening（期初余额）与 walletDiffs（待对账差异）。
export const meta = {
  id: 'wallet', label: '储值', icon: 'wallet', group: '会员', order: 3, roles: ['A'],
  layout: '横带分层',
  reason: '财务和店长看储值要先知道钱有多少、这个月进出多少、对不对得上，再往下翻流水和对账；所以三条带从余额与差异数字，到 30 天进出走势，再到流水、方案、对账明细，不把它们摊成等大的卡片',
  scenes: [
    { id: 'nodata', label: '所选范围没有储值流水' },
    { id: 'adjust-lock', label: '调整失败：会员有退款在审核，余额已冻结' },
    { id: 'recon-fail', label: '对账失败：支付渠道对账单还没生成' },
    { id: 'plan-fail', label: '保存方案失败：赠送比例超过上限' },
    { id: 'export-busy', label: '导出失败：导出任务排队过多' },
  ],
}
</script>

<script setup>
import { computed, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { ArrowDown, ArrowUp, Coin, Download, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, maskPhone, yuan } from '../../shared/format.js'
import { usePager } from '../use-pager.js'

const scene = useScene('wallet')
const allowed = computed(() => state.role === 'A')
const phase = ref('loading')                                    // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }

// ---- demo data this page adds to state.db: plan status and order, opening balances, two open reconciliation differences
const today = K.ymd(B.NOW())
const dAdd = (d, n) => K.ymd(K.addDays(new Date(d + 'T00:00:00'), n))
const dayOf = (l) => l.at.slice(0, 10)
const md = (s) => s.slice(5)
const signed = (c) => (c >= 0 ? '+' : '−') + yuan(Math.abs(c))
const money = (c) => '¥' + yuan(c)
const sg = (c) => (c ? (c > 0 ? '+' : '−') + '¥' + yuan(Math.abs(c)) : '¥0.00')

function ensure() {
  const d = state.db
  d._luzSeed ||= {}
  if (toRaw(d._luzSeed.wallet) === toRaw(d.walletLogs)) return
  d.walletPlans.forEach((p, i) => { if (!p.status) p.status = 'ON'; if (!p.sort) p.sort = i + 1 })
  const byTime = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id)
  const opening = {}
  d.users.forEach((u) => {                                       // the opening balance keeps the member's balance when the ledger allows it, and never lets a running balance go below 0
    const mine = d.walletLogs.filter((l) => l.userId === u.id).sort(byTime)
    let run = 0, low = 0
    mine.forEach((l) => { run += l.amount; low = Math.min(low, run) })
    const o = Math.max(-low, u.balance - run)
    opening[u.id] = o; u.balance = o + run
    let acc = o; mine.forEach((l) => { acc += l.amount; l.balance = acc })
  })
  const cand = d.users.filter((u) => u.status === 'ENABLED' && u.balance >= 3000)
  const diffs = []
  const add = (u, amount, date, why) => { if (!u) return; u.balance += amount; diffs.push({ id: diffs.length + 1, userId: u.id, userName: u.name, date, amount, why, status: 'OPEN' }) }
  add(cand[0], 2000, dAdd(today, -3), '疑似线下现金充值，已给会员加了余额但没有录入流水')
  add(cand[1], -650, dAdd(today, -1), '疑似一笔消费被重复扣款，会员余额比流水少')
  d.walletOpening = opening; d.walletDiffs = diffs
  d._luzSeed.wallet = d.walletLogs
}
ensure()
watch(() => state.db.walletLogs, ensure)

const nodata = computed(() => scene.value === 'nodata')
const logs = computed(() => (nodata.value ? [] : state.db.walletLogs))
const diffsAll = computed(() => (nodata.value ? [] : state.db.walletDiffs))
const openDiffs = computed(() => diffsAll.value.filter((x) => x.status === 'OPEN'))
const userOf = (id) => state.db.users.find((u) => u.id === id)
const ledgerBal = (uid) => (state.db.walletOpening[uid] || 0) + state.db.walletLogs.filter((l) => l.userId === uid).reduce((a, l) => a + l.amount, 0)
const audit = (code, action, target) => state.db.audit.unshift({ id: Math.max(0, ...state.db.audit.map((a) => a.id)) + 1, at: B.fmt(B.NOW()), actor: '王海燕', code, action, target, result: '成功', ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16) })
const kindTag = { 充值: 'success', 赠送: 'primary', 消费: 'info', 退款: 'warning', 调整: 'danger' }

// ---- band 1: the numbers (last 30 days, the window the ledger covers)
const from30 = dAdd(today, -29)
const sum30 = (kind) => logs.value.filter((l) => l.kind === kind && dayOf(l) >= from30).reduce((a, l) => a + l.amount, 0)
const totalBalance = computed(() => state.db.users.reduce((a, u) => a + u.balance, 0))
const withBalance = computed(() => state.db.users.filter((u) => u.balance > 0).length)
const charge30 = computed(() => sum30('充值'))
const gift30 = computed(() => sum30('赠送'))
const consume30 = computed(() => -sum30('消费'))
const refund30 = computed(() => sum30('退款'))
const diffTotal = computed(() => openDiffs.value.reduce((a, x) => a + Math.abs(x.amount), 0))
const insight = computed(() => {
  const parts = [`${withBalance.value} 位会员有余额`, '充值额不含赠送']
  if (charge30.value) parts.push(`赠送占充值的 ${((gift30.value / charge30.value) * 100).toFixed(1)}%`)
  if (charge30.value + gift30.value) parts.push(`消费占到账的 ${((consume30.value / (charge30.value + gift30.value)) * 100).toFixed(1)}%`)
  parts.push(openDiffs.value.length ? `${openDiffs.value.length} 笔差异合计 ${money(diffTotal.value)}，待对账处理` : '账目一致，没有待处理的差异')
  return parts.join('；') + '。'
})

// ---- band 2: the last 30 days
const days = Array.from({ length: 30 }, (_, i) => dAdd(today, i - 29))
const inSeries = computed(() => days.map((d) => logs.value.filter((l) => l.kind === '充值' && dayOf(l) === d).reduce((a, l) => a + l.amount, 0) / 100))
const outSeries = computed(() => days.map((d) => -logs.value.filter((l) => l.kind === '消费' && dayOf(l) === d).reduce((a, l) => a + l.amount, 0) / 100))
const trend = computed(() => [{ name: '充值', data: inSeries.value }, { name: '消费', data: outSeries.value }])
const trendNote = computed(() => {
  const top = Math.max(...outSeries.value), topDay = days[outSeries.value.indexOf(top)]
  return `近 30 天充值 ${money(charge30.value)}，消费 ${money(consume30.value)}` + (top ? `；单日消费最高是 ${md(topDay)}，${money(top * 100)}` : '') + '。'
})

// ---- band 3: ledger / plans / reconciliation
const tab = ref('ledger')
const flash = ref(null)
const ledgerRef = ref(null), plansRef = ref(null)
const KINDS = ['充值', '赠送', '消费', '退款', '调整']
const filter = reactive({ kind: '', uid: '', range: [], q: '' })
const filtered = computed(() => {
  const q = filter.q.trim(), [a, b] = filter.range || []
  return logs.value.filter((l) => (!filter.kind || l.kind === filter.kind) && (!filter.uid || l.userId === filter.uid) && (!a || dayOf(l) >= a) && (!b || dayOf(l) <= b) && (!q || l.userName.includes(q) || l.ref.includes(q)))
})
const pager = usePager('wallet-ledger')
const rows = pager.slice(filtered)
watch(() => ({ ...filter }), () => pager.reset())
const dirty = computed(() => filter.kind || filter.uid || filter.range?.length || filter.q)
const resetFilter = () => Object.assign(filter, { kind: '', uid: '', range: [], q: '' })
const ledgerStatus = computed(() => (phase.value !== 'ok' ? phase.value : filtered.value.length ? 'ok' : 'empty'))
const rangeText = computed(() => (filter.range?.length ? `${filter.range[0]} 至 ${filter.range[1]}` : '近 30 天'))
const memberOptions = computed(() => state.db.users.map((u) => ({ value: u.id, label: `${u.name}（尾号 ${u.phone.slice(-4)}）` })))

// ledger detail
const detail = reactive({ open: false, l: null })
const detailUser = computed(() => (detail.l ? userOf(detail.l.userId) : null))
const detailAudit = computed(() => (detail.l ? state.db.audit.filter((a) => a.target.startsWith('储值流水 #' + detail.l.id + '（')) : []))
const openLog = (l) => { detail.l = l; detail.open = true }

// manual adjustment: the dialog is the confirmation, with before, after, the effect and a required reason
const adj = reactive({ open: false, uid: null, dir: 'add', amt: 10, reason: '' })
const adjUser = computed(() => userOf(adj.uid))
const adjDelta = computed(() => (adj.dir === 'sub' ? -1 : 1) * Math.round((adj.amt || 0) * 100))
const adjAfter = computed(() => (adjUser.value ? adjUser.value.balance + adjDelta.value : 0))
const askAdjust = () => Object.assign(adj, { open: true, uid: adj.uid || state.db.users[0].id, dir: 'add', amt: 10, reason: '' })
async function doAdjust() {
  const u = adjUser.value, cents = Math.round((adj.amt || 0) * 100), delta = adjDelta.value
  if (cents <= 0) throw new Error('金额要大于 0')
  if (cents > 50000) throw new Error('单次最多调整 ¥500.00，超过的请分次或走财务流程')
  if (u.balance + delta < 0) throw new Error(`扣减后余额不能为负，${u.name} 当前余额 ${money(u.balance)}，请调小金额`)
  await request(500, { fail: scene.value === 'adjust-lock' ? new Error(`调整失败：${u.name} 有一笔储值退款正在审核，余额已冻结，审核结束后才能调整，本次没有改动余额`) : null })
  const id = Math.max(0, ...state.db.walletLogs.map((l) => l.id)) + 1
  const log = { id, userId: u.id, userName: u.name, kind: '调整', amount: delta, balance: ledgerBal(u.id) + delta, at: B.fmt(B.NOW()), ref: '调整单 A' + today.slice(5).replace('-', '') + id, reason: adj.reason.trim(), by: '王海燕' }
  u.balance += delta
  state.db.walletLogs.unshift(log)
  audit('wallet:adjust', `储值${delta < 0 ? '扣减 ' : '增加 '}${yuan(Math.abs(delta))}：${log.reason}`, `储值流水 #${id}（${u.name}）`)
  ElMessage.success(`已调整，${u.name} 的余额变为 ${money(u.balance)}`)
  tab.value = 'ledger'; resetFilter(); pager.reset(); flash.value = id
  setTimeout(() => ledgerRef.value?.setCurrentRow(state.db.walletLogs[0]), 0)
}

// plans
const plans = computed(() => state.db.walletPlans.slice().sort((a, b) => a.sort - b.sort))
const bought = (p) => logs.value.filter((l) => l.kind === '充值' && l.amount === p.amount).length
const planName = (p) => `充 ¥${p.amount / 100}` + (p.gift ? ` 送 ¥${p.gift / 100}` : '')
const busyPlan = ref(null)
async function move(p, dir) {
  const list = plans.value, o = list[list.indexOf(p) + dir]
  if (!o) return
  busyPlan.value = p.id
  try {
    await request(300)
    ;[p.sort, o.sort] = [o.sort, p.sort]
    audit('wallet:adjust', (dir < 0 ? '上移' : '下移') + '充值方案 ' + yuan(p.amount), '充值方案 ' + yuan(p.amount))
    ElMessage.success('顺序已调整，小程序按新顺序展示')
  } catch (e) { ElMessage.error(e.message) } finally { busyPlan.value = null }
}
async function beforeToggle(p) {
  try {
    if (p.status === 'ON') await ElMessageBox.confirm(`停用「${planName(p)}」后，小程序不再展示这个档位；已经充值的余额不受影响。`, '停用方案', { type: 'warning', confirmButtonText: '确认停用', cancelButtonText: '取消' })
    await request(300)
    return true
  } catch (e) {
    if (e instanceof Error) ElMessage.error(e.message + '，方案状态没有改变')
    return false
  }
}
function toggled(p, on) {
  p.status = on ? 'ON' : 'OFF'
  audit('wallet:adjust', (on ? '启用' : '停用') + '充值方案 ' + yuan(p.amount), '充值方案 ' + yuan(p.amount))
  ElMessage.success(on ? '已启用，小程序马上展示' : '已停用')
}
const plan = reactive({ open: false, p: null, amount: 100, gift: 0, status: 'ON' })
const freeAmount = () => [30, 80, 300, 800, 1000, 2000].find((a) => !state.db.walletPlans.some((o) => o.amount === a * 100)) || 10
const askPlan = (p) => Object.assign(plan, { open: true, p, amount: p ? p.amount / 100 : freeAmount(), gift: p ? p.gift / 100 : 0, status: p ? p.status : 'ON' })
const planChange = computed(() => (plan.p ? `改前：${planName(plan.p)}，${plan.p.status === 'ON' ? '启用' : '停用'}；改后：充 ${plan.amount ?? 0} 送 ${plan.gift ?? 0}，${plan.status === 'ON' ? '启用' : '停用'}。已经充值的余额不受影响，小程序马上按新方案展示。` : ''))
async function savePlan() {
  const amt = plan.amount, gift = plan.gift ?? 0
  if (!Number.isInteger(amt) || amt < 10 || amt > 5000) throw new Error('充值金额请填写 10 到 5000 的整数')
  if (!Number.isInteger(gift) || gift < 0) throw new Error('赠送金额请填写不小于 0 的整数')
  if (gift > amt * 0.3) throw new Error(`赠送比例超过 30%，最多赠送 ¥${Math.floor(amt * 0.3)}`)
  if (state.db.walletPlans.some((o) => o !== plan.p && o.amount === amt * 100)) throw new Error(`已经有 ¥${amt} 的方案了，请改金额或直接编辑它`)
  await request(450, { fail: scene.value === 'plan-fail' ? new Error('保存失败：赠送比例超过了本店的预付规则上限，请降低赠送金额后再保存') : null })
  const body = { amount: amt * 100, gift: gift * 100, status: plan.status }
  let p = plan.p
  if (p) Object.assign(p, body)
  else { p = { id: Math.max(0, ...state.db.walletPlans.map((o) => o.id)) + 1, sort: Math.max(0, ...state.db.walletPlans.map((o) => o.sort)) + 1, ...body }; state.db.walletPlans.push(p) }
  audit('wallet:adjust', (plan.p ? '修改' : '新建') + '充值方案 ' + planName(p), '充值方案 ' + yuan(p.amount))
  ElMessage.success(plan.p ? '方案已保存' : '方案已创建')
  setTimeout(() => plansRef.value?.setCurrentRow(p), 0)
}

// reconciliation: per day, the ledger total against the members' balances
const rdate = ref(today)
const reconError = ref('')
const rbusy = ref(false)
const reconDays = Array.from({ length: 30 }, (_, i) => dAdd(today, -i))
const openingSum = computed(() => Object.values(state.db.walletOpening).reduce((a, b) => a + b, 0))
function daily(d) {
  const day = logs.value.filter((l) => dayOf(l) === d), sum = (k) => day.filter((l) => l.kind === k).reduce((a, l) => a + l.amount, 0)
  const end = openingSum.value + logs.value.filter((l) => dayOf(l) <= d).reduce((a, l) => a + l.amount, 0)
  const diff = diffsAll.value.filter((x) => x.date <= d && (x.status === 'OPEN' || d < x.resolvedAt)).reduce((a, x) => a + x.amount, 0)
  return { d, charge: sum('充值'), gift: sum('赠送'), consume: -sum('消费'), refund: sum('退款'), adjust: sum('调整'), end, member: end + diff, diff }
}
const dailyRows = computed(() => reconDays.map(daily))
const sel = computed(() => daily(rdate.value))
const selPrev = computed(() => daily(dAdd(rdate.value, -1)))
const formulaOk = computed(() => selPrev.value.end + sel.value.charge + sel.value.gift + sel.value.refund + sel.value.adjust - sel.value.consume === sel.value.end)
const selDiffs = computed(() => diffsAll.value.filter((x) => x.date <= rdate.value && (x.status === 'OPEN' || rdate.value < x.resolvedAt)))
const disabledDate = (d) => { const s = K.ymd(d); return s > today || s < dAdd(today, -29) }
async function recheck() {
  rbusy.value = true; reconError.value = ''
  try {
    await request(700, { fail: scene.value === 'recon-fail' ? new Error(`对账失败：支付渠道 ${md(rdate.value)} 的对账单还没有生成，请 12:00 之后再试`) : null })
    ElMessage.success(`${rdate.value} 对账完成，` + (sel.value.diff ? '有差异，请看下方明细' : '账目一致'))
  } catch (e) { reconError.value = e.message } finally { rbusy.value = false }
}
const fix = reactive({ open: false, d: null, how: 'fixBalance', reason: '' })
const fixUser = computed(() => (fix.d ? userOf(fix.d.userId) : null))
const askFix = (d, how) => Object.assign(fix, { open: true, d, how, reason: '' })
const fixRows = computed(() => {
  if (!fix.d) return []
  const u = fixUser.value, led = ledgerBal(u.id)
  return fix.how === 'fixBalance'
    ? [['处理方式', '以流水为准，校正会员余额'], ['改前', `${u.name} 的会员余额 ${money(u.balance)}`], ['改后', `${u.name} 的会员余额 ${money(led)}，与流水合计一致`], ['影响', '只改会员余额，流水不变，写入审计']]
    : [['处理方式', '以会员余额为准，补记一条调整流水'], ['改前', `流水合计 ${money(led)}，会员余额 ${money(u.balance)}`], ['改后', `补记 ${signed(fix.d.amount)} 的调整流水，流水合计变为 ${money(led + fix.d.amount)}`], ['影响', '只增加流水，会员余额不变，写入审计']]
})
async function doFix() {
  const d = fix.d, u = fixUser.value, how = fix.how
  await request(500)
  if (how === 'fixBalance') u.balance = ledgerBal(u.id)
  else {
    const id = Math.max(0, ...state.db.walletLogs.map((l) => l.id)) + 1
    state.db.walletLogs.unshift({ id, userId: u.id, userName: u.name, kind: '调整', amount: d.amount, balance: 0, at: B.fmt(B.NOW()), ref: '调整单 C' + today.slice(5).replace('-', '') + id, reason: '对账补记：' + fix.reason.trim(), by: '王海燕' })
    let run = state.db.walletOpening[u.id] || 0
    state.db.walletLogs.filter((l) => l.userId === u.id).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id)).forEach((l) => { run += l.amount; l.balance = run })
  }
  d.status = 'DONE'; d.resolvedAt = today; d.how = how
  audit('wallet:adjust', `对账差异处理（${how === 'fixBalance' ? '校正会员余额' : '补记流水'}）：${fix.reason.trim()}`, `储值对账 ${u.name} ${signed(d.amount)}`)
  ElMessage.success('差异已处理')
}

// export: the cleaned data of the current view, Chinese headers and file name
const exp = reactive({ open: false, kind: 'ledger' })
const askExport = (kind) => Object.assign(exp, { open: true, kind })
const expName = computed(() => (exp.kind === 'ledger' ? `储值流水_${rangeText.value}` : '储值对账_近 30 天'))
const expCount = computed(() => (exp.kind === 'ledger' ? filtered.value.length : 30))
async function doExport() {
  await request(700, { fail: scene.value === 'export-busy' ? new Error('导出失败：当前已有 3 个导出任务在排队，请稍后再试，筛选条件已保留') : null })
  ElMessage.success(`已生成「${expName.value}」，共 ${expCount.value} 条`)
}

onMounted(load)
</script>

<template>
  <div class="lz-page page">
    <LzState v-if="!allowed" status="forbidden" />
    <template v-else>
      <div class="lz-toolbar">
        <span class="grow" />
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Coin" @click="askAdjust">人工调整</el-button>
      </div>

      <LzState :status="phase" error-hint="储值数据没有加载出来，请检查网络后重试" @retry="load">
        <!-- band 1 -->
        <section aria-label="储值概览" class="lz-kpis kpis">
          <LzKpi label="会员储值余额合计" :value="yuan(totalBalance)" suffix="元" />
          <LzKpi label="近 30 天充值额" :value="yuan(charge30)" suffix="元" />
          <LzKpi label="近 30 天赠送额" :value="yuan(gift30)" suffix="元" />
          <LzKpi label="近 30 天消费额" :value="yuan(consume30)" suffix="元" />
          <LzKpi label="待对账差异" :value="openDiffs.length" suffix="笔" />
        </section>
        <el-text class="insight">{{ insight }}</el-text>

        <!-- band 2 -->
        <el-card shadow="never" class="lz-card" aria-label="近 30 天充值与消费">
          <LzChart v-if="logs.length" kind="line" :categories="days.map((d) => d.slice(5))" :series="trend" :height="220" unit="" label="近 30 天充值与消费折线图，单位元" />
          <LzState v-else status="empty" empty-title="近 30 天没有储值流水" />
          <el-text v-if="logs.length" class="muted">{{ trendNote }}</el-text>
        </el-card>

        <!-- band 3 -->
        <el-card shadow="never" class="lz-card" aria-label="储值明细">
          <el-tabs v-model="tab">
            <el-tab-pane name="ledger" label="流水" />
            <el-tab-pane name="plans" label="充值方案" />
            <el-tab-pane name="recon">
              <template #label>对账<el-badge v-if="openDiffs.length" :value="openDiffs.length" type="danger" class="tab-badge" /></template>
            </el-tab-pane>
          </el-tabs>

          <!-- 流水 -->
          <template v-if="tab === 'ledger'">
            <div class="lz-toolbar filters">
              <el-select v-model="filter.kind" clearable placeholder="全部类型" style="width: 128px" aria-label="类型"><el-option v-for="k in KINDS" :key="k" :value="k" :label="k" /></el-select>
              <el-select v-model="filter.uid" clearable filterable placeholder="全部会员" style="width: 190px" aria-label="会员"><el-option v-for="o in memberOptions" :key="o.value" :value="o.value" :label="o.label" /></el-select>
              <el-date-picker v-model="filter.range" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 260px" aria-label="时间范围" />
              <el-input v-model="filter.q" clearable placeholder="会员姓名或关联单号" :prefix-icon="Search" style="width: 220px" />
              <el-button v-if="dirty" text type="primary" @click="resetFilter">重置筛选</el-button>
              <span class="grow" />
              <span class="muted num">共 {{ filtered.length }} 条</span>
              <el-button :icon="Download" @click="askExport('ledger')">导出</el-button>
            </div>
            <LzState :status="ledgerStatus" empty-title="没有符合条件的储值流水" @retry="load">
              <template #empty-action><el-button v-if="dirty" @click="resetFilter">重置筛选</el-button></template>
              <el-table ref="ledgerRef" :data="rows" size="large" row-key="id" highlight-current-row empty-text="没有符合条件的储值流水">
                <el-table-column label="时间" width="128" align="center"><template #default="{ row }"><span class="num">{{ md(row.at) }}</span></template></el-table-column>
                <el-table-column label="会员" width="104" align="center" prop="userName" />
                <el-table-column label="类型" width="88" align="center"><template #default="{ row }"><LzStatusTag :type="kindTag[row.kind]" :text="row.kind" /></template></el-table-column>
                <el-table-column label="金额（元）" width="116" align="right"><template #default="{ row }"><span class="num" :class="{ neg: row.amount < 0 }">{{ signed(row.amount) }}</span></template></el-table-column>
                <el-table-column label="变动后余额（元）" width="136" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.balance) }}</span></template></el-table-column>
                <el-table-column label="关联" min-width="150" prop="ref" />
                <el-table-column label="操作" width="80" align="center" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openLog(row)">查看</el-button></template></el-table-column>
              </el-table>
              <LzPager v-model:page="pager.page.value" v-model:size="pager.size.value" :total="filtered.length" />
            </LzState>
          </template>

          <!-- 充值方案 -->
          <template v-else-if="tab === 'plans'">
            <div class="lz-toolbar filters">
              <span class="muted">小程序按这里的顺序展示启用中的方案；已充值的方案只能停用，不能删除。</span>
              <span class="grow" />
              <el-button type="primary" :icon="Plus" @click="askPlan(null)">新建方案</el-button>
            </div>
            <LzState :status="plans.length ? 'ok' : 'empty'" empty-title="还没有充值方案">
              <el-table ref="plansRef" :data="plans" size="large" row-key="id" highlight-current-row>
                <el-table-column label="顺序" width="120" align="center">
                  <template #default="{ row, $index }">
                    <el-button link :icon="ArrowUp" :disabled="$index === 0 || busyPlan === row.id" :aria-label="'上移 ' + planName(row)" @click="move(row, -1)" />
                    <span class="num order">{{ $index + 1 }}</span>
                    <el-button link :icon="ArrowDown" :disabled="$index === plans.length - 1 || busyPlan === row.id" :aria-label="'下移 ' + planName(row)" @click="move(row, 1)" />
                  </template>
                </el-table-column>
                <el-table-column label="方案" min-width="150"><template #default="{ row }"><span class="strong">{{ planName(row) }}</span></template></el-table-column>
                <el-table-column label="到账（元）" width="116" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.amount + row.gift) }}</span></template></el-table-column>
                <el-table-column label="赠送比例" width="104" align="right"><template #default="{ row }"><span class="num">{{ Math.round((row.gift / row.amount) * 100) }}%</span></template></el-table-column>
                <el-table-column label="已充值次数" width="116" align="right"><template #default="{ row }"><span class="num">{{ bought(row) }} 次</span></template></el-table-column>
                <el-table-column label="状态" width="132" align="center">
                  <template #default="{ row }">
                    <el-switch :model-value="row.status === 'ON'" :before-change="() => beforeToggle(row)" :aria-label="(row.status === 'ON' ? '停用 ' : '启用 ') + planName(row)" @change="(on) => toggled(row, on)" /><span class="muted switch-text">{{ row.status === 'ON' ? '启用' : '停用' }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="80" align="center" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="askPlan(row)">编辑</el-button></template></el-table-column>
              </el-table>
            </LzState>
          </template>

          <!-- 对账 -->
          <template v-else>
            <div class="lz-toolbar filters">
              <el-date-picker v-model="rdate" type="date" value-format="YYYY-MM-DD" :clearable="false" :disabled-date="disabledDate" style="width: 168px" aria-label="对账日期" />
              <el-button type="primary" :loading="rbusy" @click="recheck">{{ rbusy ? '对账中' : '重新对账' }}</el-button>
              <span class="grow" />
              <span class="muted">近 30 天按日汇总</span>
              <el-button :icon="Download" @click="askExport('recon')">导出</el-button>
            </div>
            <el-alert v-if="reconError" type="error" show-icon :closable="false" :title="reconError" description="上一次的对账结果仍然有效，没有被改动。下一步：对账单生成后再点「重新对账」。" class="recon-block" />
            <el-alert v-if="sel.diff" type="error" show-icon :closable="false" class="recon-block" :title="`${rdate} 对账结果：会员余额合计比流水${sel.diff > 0 ? '多' : '少'} ${money(Math.abs(sel.diff))}`" :description="`期末 ${money(sel.end)} = 上日期末 ${money(selPrev.end)} + 充值 ${money(sel.charge)} + 赠送 ${money(sel.gift)} + 退款 ${money(sel.refund)} + 调整 ${sg(sel.adjust)} − 消费 ${money(sel.consume)}${formulaOk ? '，算式成立' : '，算式不成立'}`" />
            <el-alert v-else type="success" show-icon :closable="false" class="recon-block" :title="`${rdate} 对账结果：会员余额合计与流水一致`" :description="`期末 ${money(sel.end)} = 上日期末 ${money(selPrev.end)} + 充值 ${money(sel.charge)} + 赠送 ${money(sel.gift)} + 退款 ${money(sel.refund)} + 调整 ${sg(sel.adjust)} − 消费 ${money(sel.consume)}${formulaOk ? '，算式成立' : '，算式不成立'}`" />
            <el-table v-if="selDiffs.length" :data="selDiffs" size="large" class="recon-block" row-key="id">
              <el-table-column label="会员" width="100" align="center" prop="userName" />
              <el-table-column label="发生日期" width="116" align="center"><template #default="{ row }"><span class="num">{{ row.date }}</span></template></el-table-column>
              <el-table-column label="差异（元）" width="112" align="right"><template #default="{ row }"><span class="num neg">{{ signed(row.amount) }}</span></template></el-table-column>
              <el-table-column label="流水合计 / 会员余额（元）" width="200" align="right"><template #default="{ row }"><span class="num">{{ yuan(ledgerBal(row.userId)) }} / {{ yuan(userOf(row.userId).balance) }}</span></template></el-table-column>
              <el-table-column label="可能原因" min-width="220" prop="why" />
              <el-table-column label="状态" width="120" align="center"><template #default="{ row }"><LzStatusTag :type="row.status === 'OPEN' ? 'danger' : 'success'" :text="row.status === 'OPEN' ? '待处理' : '已处理 ' + md(row.resolvedAt)" /></template></el-table-column>
              <el-table-column label="处理" width="170" align="center" fixed="right">
                <template #default="{ row }">
                  <template v-if="row.status === 'OPEN'"><el-button link type="primary" @click="askFix(row, 'fixBalance')">校正余额</el-button><el-button link type="primary" @click="askFix(row, 'addLog')">补记流水</el-button></template>
                </template>
              </el-table-column>
            </el-table>
            <el-table :data="dailyRows" size="large" row-key="d" max-height="520" highlight-current-row :current-row-key="rdate">
              <el-table-column label="日期" min-width="140" align="center"><template #default="{ row }"><el-button link type="primary" :aria-label="'查看 ' + row.d + ' 的对账结果'" @click="rdate = row.d"><span class="num">{{ md(row.d) }}{{ row.d === today ? '（今天）' : '' }}</span></el-button></template></el-table-column>
              <el-table-column label="充值（元）" width="108" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.charge) }}</span></template></el-table-column>
              <el-table-column label="赠送（元）" width="108" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.gift) }}</span></template></el-table-column>
              <el-table-column label="消费（元）" width="108" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.consume) }}</span></template></el-table-column>
              <el-table-column label="退款（元）" width="108" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.refund) }}</span></template></el-table-column>
              <el-table-column label="调整（元）" width="108" align="right"><template #default="{ row }"><span class="num">{{ row.adjust ? signed(row.adjust) : yuan(0) }}</span></template></el-table-column>
              <el-table-column label="期末余额总额（元）" width="156" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.end) }}</span></template></el-table-column>
              <el-table-column label="会员余额合计（元）" width="156" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.member) }}</span></template></el-table-column>
              <el-table-column label="差异（元）" width="112" align="right" fixed="right"><template #default="{ row }"><span v-if="row.diff" class="num neg">{{ signed(row.diff) }}</span><span v-else class="muted">一致</span></template></el-table-column>
            </el-table>
          </template>
        </el-card>
      </LzState>

      <!-- details: centred dialogs -->
      <LzDialog v-model="detail.open" :title="'储值流水 #' + (detail.l?.id || '')" width="560px" no-footer>
        <template v-if="detail.l">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="类型"><LzStatusTag :type="kindTag[detail.l.kind]" :text="detail.l.kind" /></el-descriptions-item>
            <el-descriptions-item label="金额（元）"><span class="num">{{ signed(detail.l.amount) }}</span></el-descriptions-item>
            <el-descriptions-item label="变动后余额（元）"><span class="num">{{ yuan(detail.l.balance) }}</span></el-descriptions-item>
            <el-descriptions-item label="时间"><span class="num">{{ detail.l.at }}</span></el-descriptions-item>
            <el-descriptions-item label="会员">{{ detail.l.userName }}<span v-if="detailUser" class="muted num">（{{ maskPhone(detailUser.phone) }}）</span></el-descriptions-item>
            <el-descriptions-item label="当前会员余额（元）"><span class="num">{{ detailUser ? yuan(detailUser.balance) : '—' }}</span></el-descriptions-item>
            <el-descriptions-item label="关联" :span="2">{{ detail.l.ref }}</el-descriptions-item>
            <el-descriptions-item label="操作人">{{ detail.l.by || '系统' }}</el-descriptions-item>
            <el-descriptions-item label="原因">{{ detail.l.reason || '—' }}</el-descriptions-item>
          </el-descriptions>
          <p class="section-title">操作记录</p>
          <el-timeline v-if="detailAudit.length" class="trail">
            <el-timeline-item v-for="a in detailAudit" :key="a.id" :timestamp="a.at + ' · ' + a.actor">{{ a.action }}</el-timeline-item>
          </el-timeline>
          <el-text v-else class="muted">这条流水是系统自动产生的，没有人工操作记录。</el-text>
        </template>
      </LzDialog>

      <LzDialog v-model="adj.open" title="储值人工调整" width="520px" confirm-text="确认调整" :confirm-disabled="!adj.reason.trim() || !adj.amt" :on-confirm="doAdjust">
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="会员">
            <el-select v-model="adj.uid" filterable style="width: 100%">
              <el-option v-for="u in state.db.users" :key="u.id" :value="u.id" :label="`${u.name}（尾号 ${u.phone.slice(-4)}，余额 ${money(u.balance)}）`" />
            </el-select>
          </el-form-item>
          <el-form-item label="方向"><el-radio-group v-model="adj.dir"><el-radio-button value="add">增加余额</el-radio-button><el-radio-button value="sub">扣减余额</el-radio-button></el-radio-group></el-form-item>
          <el-form-item label="金额（元，单次最多 500）"><el-input-number v-model="adj.amt" :min="0.01" :max="500" :precision="2" :step="10" /></el-form-item>
          <el-form-item label="原因（必填）"><el-input v-model="adj.reason" type="textarea" :rows="2" maxlength="100" show-word-limit placeholder="例如：出餐超时补偿" /></el-form-item>
        </el-form>
        <el-descriptions v-if="adjUser" :column="1" border size="small" class="change">
          <el-descriptions-item label="改前">余额 {{ money(adjUser.balance) }}</el-descriptions-item>
          <el-descriptions-item label="改后">余额 {{ money(adjAfter) }}（{{ signed(adjDelta) }} 元）</el-descriptions-item>
          <el-descriptions-item label="影响">同时写入会员余额、储值流水和操作日志；更正只能用反向调整，不改历史流水</el-descriptions-item>
        </el-descriptions>
      </LzDialog>

      <LzDialog v-model="plan.open" :title="plan.p ? '编辑充值方案' : '新建充值方案'" width="480px" :confirm-text="plan.p ? '保存' : '创建'" :on-confirm="savePlan">
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="充值金额（元，10 到 5000 的整数）"><el-input-number v-model="plan.amount" :min="10" :max="5000" :step="10" :precision="0" /></el-form-item>
          <el-form-item label="赠送金额（元，不超过充值金额的 30%）"><el-input-number v-model="plan.gift" :min="0" :max="1500" :step="10" :precision="0" /></el-form-item>
          <el-form-item label="状态"><el-radio-group v-model="plan.status"><el-radio-button value="ON">启用</el-radio-button><el-radio-button value="OFF">停用</el-radio-button></el-radio-group></el-form-item>
        </el-form>
        <el-alert v-if="plan.p" type="info" show-icon :closable="false" :title="planChange" />
      </LzDialog>

      <LzDialog v-model="fix.open" :title="fix.how === 'fixBalance' ? '校正会员余额' : '补记一条流水'" width="520px" confirm-text="确认处理" :confirm-disabled="!fix.reason.trim()" :on-confirm="doFix">
        <el-descriptions :column="1" border size="small"><el-descriptions-item v-for="[k, v] in fixRows" :key="k" :label="k">{{ v }}</el-descriptions-item></el-descriptions>
        <el-form label-position="top" class="change" @submit.prevent><el-form-item label="处理说明（必填）"><el-input v-model="fix.reason" type="textarea" :rows="2" maxlength="100" show-word-limit /></el-form-item></el-form>
      </LzDialog>

      <LzDialog v-model="exp.open" :title="exp.kind === 'ledger' ? '导出储值流水' : '导出储值对账'" width="440px" confirm-text="开始导出" :on-confirm="doExport">
        <p>导出范围：{{ exp.kind === 'ledger' ? '当前筛选结果' : '近 30 天按日汇总' }}，共 <span class="strong num">{{ expCount }}</span> 条；表头是中文，类型已翻译，金额单位是元，不含内部编号和空列。</p>
        <p class="muted">文件名：{{ expName }}</p>
      </LzDialog>
    </template>
  </div>
</template>

<style scoped>
.page { grid-template-columns: minmax(0, 1fr); }
.filters { margin-bottom: 12px; }
@media (max-width: 700px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } }
.insight { display: block; color: var(--luz-ink-2); }
.tab-badge { margin-left: 6px; }
.neg { color: var(--luz-danger); }
.strong { font-weight: 600; }
.switch-text { margin-left: 8px; }
.order { display: inline-block; min-width: 20px; text-align: center; }
.recon-block { margin-bottom: 12px; }
.section-title { margin: 16px 0 8px; font-weight: 600; }
.trail { padding-left: 4px; }
.change { margin-top: 12px; }
</style>
