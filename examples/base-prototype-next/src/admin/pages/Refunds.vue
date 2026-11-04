<script>
// 售后：逐条审批退款单。主区是表格与批量审批，右侧窄栏放“快超时的单、退款原因、今天退了多少”。
export const meta = {
  id: 'refunds', label: '售后', icon: 'undo', group: '交易', order: 3, roles: ['A'],
  layout: '主区加右侧窄栏',
  reason: '售后的主工作是逐条审批退款单，所以左边三分之二给表格与批量审批；右边窄栏固定不动，放“哪些单快超时、退款都因为什么、今天退了多少”这三样随时要瞟一眼的辅助信息',
  scenes: [
    { id: 'nodata', label: '没有退款单' },
    { id: 'channel-fail', label: '同意后退款失败：支付渠道没有受理' },
    { id: 'approve-conflict', label: '审批失败：会员刚撤销了申请' },
  ],
}
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ArrowDown, Download, Refresh, Search } from '@element-plus/icons-vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, maskPhone, yuan } from '../../shared/format.js'
import { usePager } from '../use-pager.js'

const scene = useScene('refunds')
const allowed = computed(() => meta.roles.includes(state.role))
const phase = ref('loading')                                   // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

// 手机宽度：表格的操作列不再固定在右边（固定列会盖住大半个屏幕）
const narrow = ref(false)
const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 700px)') : null
const syncNarrow = () => { narrow.value = !!mq?.matches }
onMounted(() => { syncNarrow(); mq?.addEventListener('change', syncNarrow) })
onBeforeUnmount(() => mq?.removeEventListener('change', syncNarrow))

// ---- 基础：状态、时间、订单
const RST = { PENDING: ['待处理', 'warning'], APPROVED: ['已同意', 'primary'], REJECTED: ['已拒绝', 'info'], DONE: ['已完成', 'success'] }
const TABS = [['PENDING', '待处理'], ['APPROVED', '已同意'], ['REJECTED', '已拒绝'], ['DONE', '已完成']]
const COUNTED = ['PAID', 'FULFILLED', 'DONE']
const me = computed(() => (state.role === 'A' ? '王海燕' : '陈晓燕'))
const nowStr = () => B.fmt(B.NOW())
const today = K.ymd(B.NOW())
const dayOf = (s) => (s || '').slice(0, 10)
const short = (s) => (s || '').slice(5)
const parse = (s) => new Date(s.replace(' ', 'T') + ':00')
const minsSince = (s) => Math.max(0, Math.round((B.NOW().getTime() - parse(s).getTime()) / 60000))
const rno = (r) => 'RF' + String(r.id).padStart(5, '0')
const waitText = (s) => { const h = Math.floor(minsSince(s) / 60); return h >= 48 ? Math.floor(h / 24) + ' 天' : h + ' 小时' }
const overdue = (r) => r.status === 'PENDING' && minsSince(r.appliedAt) > 24 * 60
const orderOf = (r) => state.db.orders.find((o) => o.no === r.orderNo)
const userOf = (o) => (o ? state.db.users.find((u) => u.id === o.userId) : null)
const payTo = (o) => (o ? '原路退回到' + B.PAY[o.pay] : '原路退回')
const refundable = (o, except) => o.amount - state.db.refunds.filter((r) => r.orderNo === o.no && r.status !== 'REJECTED' && r !== except).reduce((s, r) => s + r.amount, 0)
const nextId = (arr) => arr.reduce((m, x) => Math.max(m, x.id), 0) + 1
function audit(action, target) {
  const a = state.db.audit
  a.unshift({ id: nextId(a), at: nowStr(), actor: me.value, code: 'refund:approve', action, target, result: '成功', ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16) })
}
/** 改订单状态：记发生时间与操作记录，并维护会员的下单数与消费额（只算待履约、已出餐、已完成） */
function setOrderStatus(o, to, key, text, who) {
  const was = COUNTED.includes(o.status), will = COUNTED.includes(to)
  if (to === 'REFUNDING') o.prev = o.status
  o.status = to; (o.t = o.t || {})[key] = nowStr()
  if (was !== will) { const u = userOf(o); if (u) { u.orders += will ? 1 : -1; u.spent += will ? o.amount : -o.amount } }
  ;(o.log = o.log || []).push({ at: nowStr(), who: who || me.value, text })
}
/** 退款成功后的本地补偿：退款单置已完成；储值支付的把钱加回会员余额并记一条退款流水；是演示会员本人的发一条通知 */
function settle(r, cents, text) {
  const db = state.db, o = orderOf(r)
  r.amount = cents; r.status = 'DONE'; r.handler = me.value; r.doneAt = nowStr()
  ;(r.trail = r.trail || []).push({ at: nowStr(), who: me.value, text: text || `同意退款 ¥${yuan(cents)}，原路退回` })
  if (!o) return
  if (o.status === 'REFUNDING') setOrderStatus(o, 'REFUNDED', 'refunded', `退款完成 ¥${yuan(cents)}，原路退回`)
  const u = userOf(o)
  if (u && o.pay === 'BALANCE') {
    u.balance += cents
    db.walletLogs.unshift({ id: nextId(db.walletLogs), userId: u.id, userName: u.name, kind: '退款', amount: cents, balance: u.balance, at: nowStr(), ref: '订单 ' + o.no })
  }
  if (u && db.me && u.id === db.me.id) db.notices.unshift({ id: nextId(db.notices), kind: '订单', title: '退款已到账', body: `订单退款 ¥${yuan(cents)} 已原路退回。`, at: nowStr(), read: false })
}
/** 处理记录：会员申请、系统自动结算、本页记下的每一步，新的在上 */
function trailOf(r) {
  const o = orderOf(r), T = []
  if (!r.by) T.push({ at: r.appliedAt, who: r.userName + '（会员）', text: `提交退款申请 ¥${yuan(r.amount)}（${r.kind}，${r.reason}）` })
  if (!r.trail && r.status === 'DONE') T.push({ at: B.fmt(new Date(Math.min(B.NOW().getTime(), parse(r.appliedAt).getTime() + 125 * 60000))), who: r.handler || '系统', text: `同意退款 ¥${yuan(r.amount)}，${payTo(o)}` })
  ;(r.trail || []).forEach((t) => T.push(t))
  return T.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

// ---- 列表：默认看待处理，状态标签按处理顺序排
const src = computed(() => (scene.value === 'nodata' ? [] : state.db.refunds))
const S = reactive({ tab: 'PENDING', kind: '', reason: '', time: 'all', over: false, q: '' })
const reasons = computed(() => [...new Set(src.value.map((r) => r.reason))])
const base = computed(() => {
  const lo = { today: 0, 7: 6, 30: 29 }[S.time], cut = lo == null ? '' : K.ymd(K.addDays(B.NOW(), -lo)), q = S.q.trim().toLowerCase()
  return src.value.filter((r) => (!S.kind || r.kind === S.kind) && (!S.reason || r.reason === S.reason) && (!cut || dayOf(r.appliedAt) >= cut) && (!S.over || overdue(r))
    && (!q || rno(r).toLowerCase().includes(q) || r.orderNo.includes(q) || r.userName.toLowerCase().includes(q)))
})
const counts = computed(() => { const c = {}; base.value.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1 }); return c })
const filtered = computed(() => base.value.filter((r) => r.status === S.tab).sort((a, b) => (S.tab === 'PENDING' ? (a.appliedAt < b.appliedAt ? -1 : 1) : a.appliedAt < b.appliedAt ? 1 : -1)))
const pager = usePager('refunds')
const rows = pager.slice(filtered)
const tableRef = ref(null)
const selected = ref([])
watch(() => ({ ...S }), () => { pager.reset(); tableRef.value?.clearSelection() })
const dirty = computed(() => S.tab !== 'PENDING' || S.kind || S.reason || S.time !== 'all' || S.over || S.q)
const resetFilter = () => Object.assign(S, { tab: 'PENDING', kind: '', reason: '', time: 'all', over: false, q: '' })
const status = computed(() => (phase.value !== 'ok' ? phase.value : filtered.value.length ? 'ok' : 'empty'))
const amountSum = computed(() => filtered.value.reduce((s, r) => s + r.amount, 0))
const hasHandler = computed(() => rows.value.some((r) => r.handler))      // 整列为空的列不显示
const tabLabel = computed(() => TABS.find((t) => t[0] === S.tab)[1])
const emptyTitle = computed(() => (scene.value === 'nodata' ? '没有退款单' : '没有符合条件的退款单'))

// ---- 会员刚撤销：状态变了，要告诉审批人并刷新
function conflict(r) {
  if (scene.value !== 'approve-conflict' || r.status !== 'PENDING') return false
  r.status = 'REJECTED'; r.handler = '会员本人'; r.note = '会员撤销了申请'
  ;(r.trail = r.trail || []).push({ at: nowStr(), who: r.userName + '（会员）', text: '撤销了退款申请' })
  const o = orderOf(r)
  if (o && o.status === 'REFUNDING') setOrderStatus(o, o.prev || 'DONE', 'reverted', '会员撤销退款，订单恢复', r.userName + '（会员）')
  ElMessage.error({ message: '审批失败：会员刚刚撤销了这条申请，列表已刷新', showClose: true, duration: 6000 })
  return true
}

// ---- 同意：校验金额与状态、走渠道、本地补偿。返回 {kind: ok | keep | net | closed}，单条与批量共用
async function approveCore(r, cents, note) {
  const o = orderOf(r)
  if (r.status !== 'PENDING' && r.status !== 'APPROVED') return { kind: 'keep', why: `现在是${RST[r.status][0]}，不能再同意` }
  const max = o ? refundable(o, r) : r.amount
  if (cents <= 0 || cents > max) return { kind: 'keep', why: `金额超出可退上限 ¥${yuan(max)}` }
  try { await request(600) } catch { return { kind: 'net', why: '网络不太稳定，退款单状态没有变化，请重试' } }
  if (conflict(r)) return { kind: 'closed', why: '会员刚撤销了申请' }
  r.handler = me.value; if (note) r.note = note
  if (scene.value === 'channel-fail') {
    r.status = 'APPROVED'; r.amount = cents
    ;(r.trail = r.trail || []).push({ at: nowStr(), who: me.value, text: `同意退款 ¥${yuan(cents)}，但支付渠道没有受理，等待重试` })
    audit('同意退款（渠道未受理）', `${rno(r)}，订单 ${r.orderNo}，¥${yuan(cents)}`)
    return { kind: 'closed', why: '支付渠道没有受理，已转为“已同意”，稍后重试退款', toast: '同意后退款失败：支付渠道没有受理，退款单已转为“已同意”。款项还没有退出，请稍后点“重试退款”。' }
  }
  settle(r, cents, `同意退款 ¥${yuan(cents)}，${payTo(o)}${note ? '；意见：' + note : ''}`)
  audit('同意退款', `${rno(r)}，订单 ${r.orderNo}，¥${yuan(cents)}`)
  return { kind: 'ok' }
}

const appr = reactive({ open: false, r: null, amount: 0, note: '' })
const apprOrder = computed(() => (appr.r ? orderOf(appr.r) : null))
const apprMax = computed(() => (appr.r ? (apprOrder.value ? refundable(apprOrder.value, appr.r) : appr.r.amount) : 0))
const askApprove = (r) => Object.assign(appr, { open: true, r, amount: r.amount / 100, note: '' })
const doApprove = async () => {
  const r = appr.r, cents = Math.round(appr.amount * 100)
  const res = await approveCore(r, cents, appr.note.trim())
  if (res.kind === 'keep' || res.kind === 'net') throw new Error(res.why)      // 对话框留着，输入的内容保留
  if (res.kind === 'closed') { if (res.toast) ElMessage.error({ message: res.toast, showClose: true, duration: 8000 }); return }
  ElMessage.success(`已同意，¥${yuan(cents)} 原路退回`)
}

// ---- 拒绝、批量：一个“写原因”的对话框，提交在对话框里做，失败写在对话框里并保留输入
const ask = reactive({ open: false, title: '', text: '', impact: '', label: '', confirmText: '', danger: false, reason: '', submit: null })
const askReason = (opts) => Object.assign(ask, { open: true, danger: false, impact: '', label: '原因（必填）', confirmText: '确认', reason: '', ...opts })
const askConfirm = () => ask.submit(ask.reason.trim())

function reject(r) {
  if (r.status !== 'PENDING') { ElMessage.warning(`现在是${RST[r.status][0]}，不能再拒绝`); return }
  const o = orderOf(r)
  askReason({
    title: '拒绝退款', danger: true, confirmText: '确认拒绝', label: '拒绝原因（必填，会展示给会员）',
    text: `将拒绝 ${rno(r)}：${r.userName} 申请退款 ¥${yuan(r.amount)}。`,
    impact: `改前：待处理；改后：已拒绝。不退款${o && o.status === 'REFUNDING' ? '，订单恢复为' + B.ORDER_STATUS[o.prev || 'DONE'] : ''}。`,
    submit: async (why) => {
      await request(500)
      if (conflict(r)) return
      rejectCore(r, why, '拒绝退款：' + why)
      audit('拒绝退款', `${rno(r)}，订单 ${r.orderNo}，原因：${why}`)
      ElMessage.success('已拒绝，原因会展示给会员')
    },
  })
}
function rejectCore(r, why, text) {
  const o = orderOf(r)
  r.status = 'REJECTED'; r.handler = me.value; r.note = why
  ;(r.trail = r.trail || []).push({ at: nowStr(), who: me.value, text })
  if (o && o.status === 'REFUNDING') setOrderStatus(o, o.prev || 'DONE', 'reverted', '退款被拒绝，订单恢复')
}

// ---- 转人工
const man = reactive({ open: false, r: null, to: '店长 周敏', note: '' })
const askManual = (r) => Object.assign(man, { open: true, r, to: '店长 周敏', note: '' })
const doManual = async () => {
  const r = man.r
  await request(400)
  if (conflict(r)) return
  r.manual = { to: man.to, at: nowStr() }
  ;(r.trail = r.trail || []).push({ at: nowStr(), who: me.value, text: `转人工处理，转给 ${man.to}：${man.note.trim()}` })
  audit('退款转人工', `${rno(r)}，订单 ${r.orderNo}，转给 ${man.to}`)
  ElMessage.success(`已转给 ${man.to.split(' ')[1]} 人工处理`)
}

// ---- 批量审批
const pendingSel = computed(() => selected.value.filter((r) => r.status === 'PENDING'))
const pendingSelSum = computed(() => pendingSel.value.reduce((s, r) => s + r.amount, 0))
const report = reactive({ open: false, title: '', ok: 0, fails: [] })
function batchApprove() {
  const list = selected.value.slice(), pend = list.filter((r) => r.status === 'PENDING'), skip = list.length - pend.length
  if (!pend.length) { ElMessage.warning('选中的退款单里没有待处理的'); return }
  askReason({
    title: '批量同意退款', confirmText: `确认同意 ${pend.length} 条`, label: '处理意见（必填，记入每条退款单）',
    text: `将同意 ${pend.length} 条退款，合计 ¥${yuan(pend.reduce((s, r) => s + r.amount, 0))}，款项原路退回给会员，订单标记为已退款，无法撤销。${skip ? `另有 ${skip} 条不是待处理状态，会被跳过并写明原因。` : ''}`,
    impact: `改前：${pend.length} 条待处理；改后：已完成，合计退出 ¥${yuan(pend.reduce((s, r) => s + r.amount, 0))}。`,
    submit: async (note) => {
      const fails = list.filter((r) => r.status !== 'PENDING').map((r) => ({ label: rno(r), why: `现在是${RST[r.status][0]}，已处理过` }))
      let ok = 0
      for (const r of pend) {
        const res = await approveCore(r, r.amount, note)
        if (res.kind === 'ok') ok++
        else { fails.push({ label: rno(r), why: res.why }); if (res.kind === 'net') break }
      }
      finishBatch('批量同意', ok, fails)
    },
  })
}
function batchReject() {
  const list = selected.value.slice(), pend = list.filter((r) => r.status === 'PENDING')
  if (!pend.length) { ElMessage.warning('选中的退款单里没有待处理的'); return }
  askReason({
    title: '批量拒绝退款', danger: true, confirmText: `确认拒绝 ${pend.length} 条`, label: '拒绝原因（必填，同一条原因会展示给这些会员）',
    text: `将拒绝 ${pend.length} 条退款，合计 ¥${yuan(pend.reduce((s, r) => s + r.amount, 0))}。`,
    impact: `改前：${pend.length} 条待处理；改后：已拒绝，不退款。`,
    submit: async (why) => {
      await request(600)
      const fails = list.filter((r) => r.status !== 'PENDING').map((r) => ({ label: rno(r), why: `现在是${RST[r.status][0]}，已处理过` }))
      pend.forEach((r) => { rejectCore(r, why, '批量拒绝：' + why); audit('拒绝退款', `${rno(r)}，订单 ${r.orderNo}，原因：${why}`) })
      finishBatch('批量拒绝', pend.length, fails)
    },
  })
}
function finishBatch(verb, ok, fails) {
  nextTick(() => tableRef.value?.clearSelection())
  if (!fails.length) { ElMessage.success(`${verb} ${ok} 条`); return }
  ElMessage.warning(`${verb}：成功 ${ok} 条，失败 ${fails.length} 条`)
  Object.assign(report, { open: true, title: verb + '结果', ok, fails })
}

// ---- 详情：概况、凭证、处理记录
const det = reactive({ open: false, r: null, tab: 'ov' })
const detOrder = computed(() => (det.r ? orderOf(det.r) : null))
const detUser = computed(() => userOf(detOrder.value))
const openDetail = (r) => Object.assign(det, { open: true, r, tab: 'ov' })
const proofs = computed(() => (detOrder.value ? detOrder.value.items.map((i) => i.img).filter(Boolean).slice(0, 3) : []))

// ---- 导出：中文表头、范围等于当前筛选
const exp = ref(false)
const expName = computed(() => `售后_${tabLabel.value}`)
const doExport = async () => {
  await request(700)
  ElMessage.success(`已生成「${expName.value}」，共 ${filtered.value.length} 条`)
}

// ---- 右侧窄栏
const pending = computed(() => src.value.filter((r) => r.status === 'PENDING').sort((a, b) => (a.appliedAt < b.appliedAt ? -1 : 1)))
const overdueList = computed(() => pending.value.filter(overdue))
const onlyOverdue = () => Object.assign(S, { tab: 'PENDING', over: true })
const byReason = computed(() => {
  const m = {}; src.value.forEach((r) => { m[r.reason] = (m[r.reason] || 0) + 1 })
  return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
})
const doneToday = computed(() => src.value.filter((r) => r.status === 'DONE' && dayOf(r.doneAt || r.appliedAt) === today))
const doneTodaySum = computed(() => doneToday.value.reduce((s, r) => s + r.amount, 0))
const pendingSum = computed(() => pending.value.reduce((s, r) => s + r.amount, 0))
const onMore = (cmd, r) => ({ reject, manual: askManual })[cmd](r)
</script>

<template>
  <div class="lz-page">
    <!-- 手机宽度：库的组件整体换成大尺寸，触摸目标不小于 40 像素 -->
    <el-config-provider :size="narrow ? 'large' : 'default'">
    <LzState v-if="!allowed" status="forbidden" />
    <template v-else>
      <div class="lz-toolbar end">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Download" :disabled="!filtered.length" @click="exp = true">导出结果</el-button>
      </div>

      <div class="lz-main-rail refunds-grid">
        <!-- 主区：表格与批量审批 -->
        <el-card shadow="never" class="lz-card main" aria-label="退款单">
          <el-tabs v-model="S.tab">
            <el-tab-pane v-for="[code, label] in TABS" :key="code" :name="code">
              <template #label>{{ label }}<span class="tab-count num" :class="{ zero: !counts[code] }">{{ counts[code] || 0 }}</span></template>
            </el-tab-pane>
          </el-tabs>
          <div class="lz-toolbar filters">
            <el-select v-model="S.kind" clearable placeholder="全部类型" style="width: 132px" aria-label="退款类型"><el-option value="仅退款" label="仅退款" /><el-option value="退货退款" label="退货退款" /></el-select>
            <el-select v-model="S.reason" clearable placeholder="全部原因" style="width: 140px" aria-label="退款原因"><el-option v-for="x in reasons" :key="x" :value="x" :label="x" /></el-select>
            <el-select v-model="S.time" style="width: 132px" aria-label="申请时间"><el-option value="all" label="全部时间" /><el-option value="today" label="今天申请" /><el-option value="7" label="近 7 天" /><el-option value="30" label="近 30 天" /></el-select>
            <el-checkbox v-if="S.tab === 'PENDING' || S.over" v-model="S.over">只看超 24 小时未处理</el-checkbox>
            <el-input v-model="S.q" clearable placeholder="退款单号、订单号或会员" :prefix-icon="Search" style="width: 220px" aria-label="搜索退款单" />
            <el-button v-if="dirty" text type="primary" @click="resetFilter">重置筛选</el-button>
          </div>
          <p class="muted summary num">
            {{ tabLabel }} {{ filtered.length }} 条，金额合计 ¥{{ yuan(amountSum) }}<template v-if="S.kind">；类型：{{ S.kind }}</template><template v-if="S.reason">；原因：{{ S.reason }}</template>
          </p>

          <div v-if="selected.length" class="batch" role="region" aria-label="批量审批">
            <span class="num">已选 {{ selected.length }} 条，待处理 {{ pendingSel.length }} 条，合计 ¥{{ yuan(pendingSelSum) }}</span>
            <span class="grow" />
            <el-button type="primary" @click="batchApprove">批量同意</el-button>
            <el-button type="danger" plain @click="batchReject">批量拒绝</el-button>
            <el-button text @click="tableRef.clearSelection()">取消选择</el-button>
          </div>

          <LzState :status="status" :empty-title="emptyTitle" error-hint="退款单没有加载出来，请检查网络后重试" @retry="load">
            <template #empty-action><el-button v-if="dirty" type="primary" @click="resetFilter">重置筛选</el-button></template>
            <el-table ref="tableRef" :data="rows" size="large" row-key="id" @selection-change="(l) => (selected = l)">
              <el-table-column type="selection" width="44" />
              <el-table-column label="退款单 / 订单号" :width="narrow ? 164 : 142" align="center">
                <template #default="{ row }"><span class="num">{{ rno(row) }}</span><div class="muted num">{{ row.orderNo }}</div><div v-if="row.manual && row.status !== 'DONE'"><el-tag type="info" effect="light">人工处理中</el-tag></div></template>
              </el-table-column>
              <el-table-column label="会员" prop="userName" width="88" align="center" />
              <el-table-column label="金额（元）" width="108" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.amount) }}</span></template></el-table-column>
              <el-table-column label="原因" min-width="110"><template #default="{ row }"><span class="clamp-2">{{ row.reason }}{{ row.desc ? '：' + row.desc : '' }}</span><div v-if="!S.kind" class="muted">{{ row.kind }}</div></template></el-table-column>
              <el-table-column v-if="hasHandler" label="处理人" prop="handler" width="84" align="center" />
              <el-table-column label="申请时间" width="120" align="center">
                <template #default="{ row }">
                  <span class="num">{{ short(row.appliedAt) }}</span>
                  <div v-if="row.status === 'PENDING'"><el-tag :type="overdue(row) ? 'warning' : 'info'" effect="light">{{ overdue(row) ? '超时 ' : '已等 ' }}{{ waitText(row.appliedAt) }}</el-tag></div>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="200" align="center" :fixed="narrow ? false : 'right'">
                <template #default="{ row }">
                  <el-button v-if="row.status === 'PENDING'" text type="primary" @click="askApprove(row)">同意</el-button>
                  <el-button v-if="row.status === 'APPROVED'" text type="primary" @click="askApprove(row)">重试退款</el-button>
                  <el-button text type="primary" @click="openDetail(row)">详情</el-button>
                  <el-dropdown v-if="row.status === 'PENDING' || row.status === 'APPROVED'" trigger="click" @command="(c) => onMore(c, row)">
                    <el-button text :icon="ArrowDown" aria-label="更多操作" />
                    <template #dropdown><el-dropdown-menu>
                      <el-dropdown-item v-if="row.status === 'PENDING'" command="reject">拒绝退款</el-dropdown-item>
                      <el-dropdown-item command="manual">转人工处理</el-dropdown-item>
                    </el-dropdown-menu></template>
                  </el-dropdown>
                </template>
              </el-table-column>
            </el-table>
            <LzPager v-model:page="pager.page.value" v-model:size="pager.size.value" :total="filtered.length" />
          </LzState>
        </el-card>

        <!-- 右侧窄栏 -->
        <aside class="rail" aria-label="待审批提醒与统计">
          <el-card shadow="never" class="lz-card" aria-label="待审批提醒">
            <div class="card-head"><span class="card-title">待审批提醒</span><el-tag :type="overdueList.length ? 'warning' : 'info'" effect="light">{{ pending.length }} 条待审批</el-tag></div>
            <template v-if="pending.length">
              <p class="muted">其中 <span class="num">{{ overdueList.length }}</span> 条已超过 24 小时<template v-if="!overdueList.length">，都在时限内</template>。<el-button v-if="overdueList.length" text type="primary" @click="onlyOverdue">只看这些</el-button></p>
              <ul class="remind">
                <li v-for="r in pending.slice(0, 5)" :key="r.id">
                  <div class="grow"><span class="num">{{ rno(r) }}</span> {{ r.userName }}<span class="muted num"> ¥{{ yuan(r.amount) }}</span><div><el-tag :type="overdue(r) ? 'warning' : 'info'" effect="light">{{ overdue(r) ? '超时 ' : '已等 ' }}{{ waitText(r.appliedAt) }}</el-tag></div></div>
                  <el-button text type="primary" :aria-label="'处理 ' + rno(r)" @click="openDetail(r)">处理</el-button>
                </li>
              </ul>
            </template>
            <p v-else class="muted">没有待审批的退款，都处理完了。</p>
          </el-card>

          <el-card shadow="never" class="lz-card" aria-label="退款原因分布">
            <div class="card-head"><span class="card-title">退款原因分布</span><span class="muted">全部 {{ src.length }} 笔</span></div>
            <template v-if="byReason.length">
              <LzChart kind="pie" :series="byReason" :height="190" label="退款原因分布环图" />
              <ul class="legend">
                <li v-for="x in byReason" :key="x.name"><span class="grow">{{ x.name }}</span><span class="num">{{ x.value }} 笔 · {{ Math.round((x.value / src.length) * 100) }}%</span></li>
              </ul>
              <p class="muted">最多的原因是“{{ byReason[0].name }}”，占 {{ Math.round((byReason[0].value / src.length) * 100) }}%。</p>
            </template>
            <p v-else class="muted">还没有退款单</p>
          </el-card>

          <el-card shadow="never" class="lz-card" aria-label="今日退款额">
            <el-statistic title="今日退款额" :value="doneTodaySum / 100" :precision="2" class="today-stat"><template #prefix><span>¥</span></template></el-statistic>
            <p class="muted">今日已退款 {{ doneToday.length }} 笔；全部待处理金额 ¥{{ yuan(pendingSum) }}。</p>
          </el-card>
        </aside>
      </div>
    </template>

    <!-- 同意 / 重试：写清改前、改后与影响，处理意见必填 -->
    <LzDialog v-model="appr.open" :title="appr.r?.status === 'APPROVED' ? '重试退款' : '同意退款'" :width="narrow ? '94%' : '520px'" :confirm-text="appr.r?.status === 'APPROVED' ? '确认重试退款' : '确认同意并退款'" :confirm-disabled="!appr.note.trim() || !(appr.amount > 0)" :on-confirm="doApprove">
      <template v-if="appr.r">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="退款单">{{ rno(appr.r) }} · {{ appr.r.kind }} · {{ appr.r.reason }}</el-descriptions-item>
          <el-descriptions-item label="会员">{{ appr.r.userName }}</el-descriptions-item>
          <el-descriptions-item label="申请金额（元）"><span class="num">{{ yuan(appr.r.amount) }}</span></el-descriptions-item>
          <el-descriptions-item label="最多可退（元）"><span class="num">{{ yuan(apprMax) }}</span>（实付 {{ apprOrder ? yuan(apprOrder.amount) : yuan(appr.r.amount) }}，减去其他退款）</el-descriptions-item>
        </el-descriptions>
        <el-form label-position="top" class="form" @submit.prevent>
          <el-form-item label="同意退款金额（元）"><el-input-number v-model="appr.amount" :min="0.01" :max="apprMax / 100" :precision="2" :step="1" /></el-form-item>
          <el-form-item label="处理意见（必填）"><el-input v-model="appr.note" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="如：已核对订单与凭证，同意原路退回" /></el-form-item>
        </el-form>
        <el-alert type="info" show-icon :closable="false" :title="`改前：${RST[appr.r.status][0]}，申请 ¥${yuan(appr.r.amount)}；改后：向 ${appr.r.userName} 退款 ¥${(appr.amount || 0).toFixed(2)}，${payTo(apprOrder)}，订单 ${appr.r.orderNo} 标记为已退款，无法撤销。`" />
        <p v-if="appr.r.kind === '退货退款'" class="muted">这是一笔退货退款，请确认商品已经退回。</p>
      </template>
    </LzDialog>

    <!-- 写原因：拒绝、批量同意、批量拒绝 -->
    <LzDialog v-model="ask.open" :title="ask.title" :width="narrow ? '94%' : '480px'" :danger="ask.danger" :confirm-text="ask.confirmText" :confirm-disabled="!ask.reason.trim()" :on-confirm="askConfirm">
      <p>{{ ask.text }}</p>
      <el-alert v-if="ask.impact" :title="ask.impact" type="info" show-icon :closable="false" />
      <el-form label-position="top" class="form" @submit.prevent><el-form-item :label="ask.label"><el-input v-model="ask.reason" type="textarea" :rows="3" maxlength="200" show-word-limit /></el-form-item></el-form>
    </LzDialog>

    <LzDialog v-model="man.open" title="转人工处理" :width="narrow ? '94%' : '440px'" confirm-text="确认转交" :confirm-disabled="!man.note.trim()" :on-confirm="doManual">
      <p>{{ man.r ? rno(man.r) : '' }} 转交后仍在“{{ man.r ? RST[man.r.status][0] : '' }}”，由对方继续处理。</p>
      <el-form label-position="top" class="form" @submit.prevent>
        <el-form-item label="转给"><el-select v-model="man.to"><el-option value="店长 周敏" label="店长 周敏" /><el-option value="财务 赵建国" label="财务 赵建国" /></el-select></el-form-item>
        <el-form-item label="说明（必填）"><el-input v-model="man.note" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="写清为什么需要人工，比如要联系顾客核实" /></el-form-item>
      </el-form>
    </LzDialog>

    <LzDialog v-model="report.open" :title="report.title" :width="narrow ? '94%' : '520px'" no-footer>
      <p>成功 {{ report.ok }} 条，失败 {{ report.fails.length }} 条。失败的原因：</p>
      <el-table :data="report.fails" size="large">
        <el-table-column label="退款单" prop="label" width="130" align="center" />
        <el-table-column label="原因" prop="why" />
      </el-table>
      <div class="detail-actions"><span class="grow" /><el-button type="primary" @click="report.open = false">知道了</el-button></div>
    </LzDialog>

    <!-- 详情：居中对话框 -->
    <LzDialog v-model="det.open" :title="'退款单 ' + (det.r ? rno(det.r) : '')" :width="narrow ? '94%' : '680px'" no-footer>
      <template v-if="det.r">
        <el-tabs v-model="det.tab">
          <el-tab-pane label="概况" name="ov">
            <el-descriptions :column="narrow ? 1 : 2" border>
              <el-descriptions-item label="状态"><LzStatusTag :type="RST[det.r.status][1]" :text="RST[det.r.status][0]" /></el-descriptions-item>
              <el-descriptions-item label="类型">{{ det.r.kind }}</el-descriptions-item>
              <el-descriptions-item label="会员">{{ det.r.userName }}<span v-if="detUser" class="muted num"> · {{ maskPhone(detUser.phone) }}</span></el-descriptions-item>
              <el-descriptions-item label="申请时间"><span class="num">{{ det.r.appliedAt }}</span></el-descriptions-item>
              <el-descriptions-item label="申请退款（元）"><span class="num">{{ yuan(det.r.amount) }}</span></el-descriptions-item>
              <el-descriptions-item label="退款去向">{{ payTo(detOrder) }}</el-descriptions-item>
              <el-descriptions-item label="等待">
                <el-tag v-if="det.r.status === 'PENDING'" :type="overdue(det.r) ? 'warning' : 'info'" effect="light">{{ overdue(det.r) ? '超时 ' : '已等 ' }}{{ waitText(det.r.appliedAt) }}</el-tag>
                <span v-else class="muted">已处理</span>
              </el-descriptions-item>
              <el-descriptions-item label="最多可退（元）"><span class="num">{{ detOrder ? yuan(refundable(detOrder, det.r)) : yuan(det.r.amount) }}</span></el-descriptions-item>
              <el-descriptions-item label="退款原因" :span="2">{{ det.r.reason }}</el-descriptions-item>
              <el-descriptions-item label="补充说明" :span="2">{{ det.r.desc || '会员没有补充' }}</el-descriptions-item>
              <el-descriptions-item label="处理人">{{ det.r.handler || '尚未处理' }}</el-descriptions-item>
              <el-descriptions-item label="处理意见">{{ det.r.note || '—' }}</el-descriptions-item>
            </el-descriptions>
            <template v-if="detOrder">
              <el-descriptions :column="narrow ? 1 : 2" border title="订单信息" class="order-info">
                <el-descriptions-item label="订单号"><span class="num">{{ detOrder.no }}</span></el-descriptions-item>
                <el-descriptions-item label="订单状态"><LzStatusTag kind="order" :status="detOrder.status" /></el-descriptions-item>
                <el-descriptions-item label="下单时间"><span class="num">{{ detOrder.createdAt }}</span></el-descriptions-item>
                <el-descriptions-item label="支付方式">{{ B.PAY[detOrder.pay] }}</el-descriptions-item>
              </el-descriptions>
              <el-table :data="detOrder.items" size="large" class="items">
                <el-table-column label="商品" prop="name" min-width="110" />
                <el-table-column label="规格" prop="spec" width="64" align="center" />
                <el-table-column label="单价（元）" width="96" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.price) }}</span></template></el-table-column>
                <el-table-column label="数量" prop="qty" width="60" align="center" />
                <el-table-column label="小计（元）" width="96" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.price * row.qty) }}</span></template></el-table-column>
              </el-table>
            </template>
          </el-tab-pane>
          <el-tab-pane label="凭证" name="proof">
            <template v-if="proofs.length">
              <p class="muted">会员上传的凭证（演示用商品图占位），共 {{ proofs.length }} 张。</p>
              <div class="proofs">
                <el-image v-for="(s, i) in proofs" :key="i" :src="s" :alt="'凭证 ' + (i + 1) + '：' + det.r.reason" :preview-src-list="proofs" :initial-index="i" fit="cover" class="proof" />
              </div>
            </template>
            <el-empty v-else description="会员没有上传凭证" />
          </el-tab-pane>
          <el-tab-pane label="处理记录" name="rec">
            <el-timeline>
              <el-timeline-item v-for="(t, i) in trailOf(det.r)" :key="i" :timestamp="short(t.at) + ' · ' + t.who">{{ t.text }}</el-timeline-item>
            </el-timeline>
          </el-tab-pane>
        </el-tabs>
        <div class="detail-actions">
          <span class="grow" />
          <el-button v-if="det.r.status === 'PENDING' || det.r.status === 'APPROVED'" @click="askManual(det.r)">转人工</el-button>
          <el-button v-if="det.r.status === 'PENDING'" type="danger" plain @click="reject(det.r)">拒绝</el-button>
          <el-button v-if="det.r.status === 'PENDING'" type="primary" @click="askApprove(det.r)">同意退款</el-button>
          <el-button v-if="det.r.status === 'APPROVED'" type="primary" @click="askApprove(det.r)">重试退款</el-button>
        </div>
      </template>
    </LzDialog>

    <LzDialog v-model="exp" title="导出售后" :width="narrow ? '94%' : '440px'" confirm-text="开始导出" :on-confirm="doExport">
      <p>导出范围：当前筛选结果，共 <span class="num em">{{ filtered.length }}</span> 条；表头是中文，类型、状态已翻译，金额单位为元，不含内部编号和空列。</p>
      <p class="muted">文件名：{{ expName }}.xlsx</p>
    </LzDialog>
    </el-config-provider>
  </div>
</template>

<style scoped>
.main { min-width: 0; }
.end { justify-content: flex-end; }
.refunds-grid { grid-template-columns: minmax(0, 1fr) 300px; }
@media (max-width: 1100px) { .refunds-grid { grid-template-columns: minmax(0, 1fr); } }
.tab-count { margin-left: 6px; color: var(--luz-ink-2); font-weight: 400; }
.tab-count.zero { color: var(--luz-ink-3); opacity: .7; }
.filters { margin-bottom: 8px; }
.summary { margin: 0 0 12px; }
.batch { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 12px; margin-bottom: 12px; background: var(--luz-action-tint); border-radius: var(--luz-radius-control); }
.rail { display: grid; gap: 16px; min-width: 0; align-content: start; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.card-title { font-weight: 600; }
.em { font-weight: 600; }
.remind, .legend { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.remind li, .legend li { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.today-stat :deep(.el-statistic__content) { font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; }
.form { margin-top: 12px; }
.order-info { margin-top: 16px; }
.items { margin-top: 12px; }
.proofs { display: flex; flex-wrap: wrap; gap: 12px; }
.proof { width: 160px; height: 120px; border-radius: var(--luz-radius-control); }
.detail-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
</style>
