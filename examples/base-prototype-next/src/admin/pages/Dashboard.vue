<script>
// 数据看板：营业额走势是主角，订单与客单价缩成右侧小块，会员与售后放下方（旧页面的主次布局）。
export const meta = {
  id: 'dashboard', label: '数据看板', icon: 'chart', group: '概览', order: 1, roles: ['A'],
  layout: '主次布局',
  reason: '老板进来最关心营业额走势，所以营业额趋势做 Hero 占一半以上，订单、客单价缩成右侧小块，会员与售后放下方',
  scenes: [
    { id: 'nodata', label: '所选范围没有订单' },
  ],
}
</script>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Download, Refresh } from '@element-plus/icons-vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, signed, yuan } from '../../shared/format.js'

const router = useRouter()
const scene = useScene('dashboard')
const allowed = computed(() => meta.roles.includes(state.role))
const phase = ref('loading')                                   // loading | ok | error
async function load() { phase.value = 'loading'; try { await request(450); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

// 手机宽度：对话框与描述列表按屏宽收窄
const narrow = ref(false)
const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 700px)') : null
const syncNarrow = () => { narrow.value = !!mq?.matches }
onMounted(() => { syncNarrow(); mq?.addEventListener('change', syncNarrow) })
onBeforeUnmount(() => mq?.removeEventListener('change', syncNarrow))

// ---- 数据：只算已付款的订单（待履约、已出餐、已完成）
const EARNED = ['PAID', 'FULFILLED', 'DONE']
const orders = computed(() => (scene.value === 'nodata' ? [] : state.db.orders))
const dayKey = (ago) => K.ymd(K.addDays(B.NOW(), -ago))
const perDay = computed(() => {
  const m = {}
  for (const o of orders.value) {
    if (!EARNED.includes(o.status)) continue
    const d = o.createdAt.slice(0, 10)
    ;(m[d] ||= { rev: 0, n: 0 }).rev += o.amount
    m[d].n += 1
  }
  return m
})
/** 从 off 天前起往前数 n 天的合计 */
const sum = (n, off) => { let rev = 0, cnt = 0; for (let i = off; i < off + n; i++) { const d = perDay.value[dayKey(i)]; if (d) { rev += d.rev; cnt += d.n } } return { rev, cnt, avg: cnt ? rev / cnt : 0 } }

const RANGES = [[1, '今天'], [7, '近 7 天'], [30, '近 30 天']]
const range = ref(30)
const cur = computed(() => sum(range.value, 0))
const prev = computed(() => sum(range.value, range.value))
const ratio = (a, b) => (b ? (a - b) / b : null)
// 订单数据只有最近一段时间：上一周期不完整时不比较，免得算出 +4000% 这样没有意义的变化
const firstDay = computed(() => state.db.orders.reduce((m, o) => { const d = o.createdAt.slice(0, 10); return d < m ? d : m }, '9999-12-31'))
const prevComplete = computed(() => dayKey(range.value * 2 - 1) >= firstDay.value)
const revDelta = computed(() => (prevComplete.value ? ratio(cur.value.rev, prev.value.rev) : null))
const cntDelta = computed(() => (prevComplete.value ? ratio(cur.value.cnt, prev.value.cnt) : null))
const avgDelta = computed(() => (prevComplete.value ? ratio(cur.value.avg, prev.value.avg) : null))
const prevLabel = computed(() => (range.value === 1 ? '较昨日' : '较上一周期'))

// ---- 走势：今天只有一个点，画不出折线，所以用最近 7 天做背景
const chartDays = computed(() => Array.from({ length: Math.max(range.value, 7) }, (_, i) => dayKey(Math.max(range.value, 7) - 1 - i)))
const trend = computed(() => [{ name: '营业额', data: chartDays.value.map((d) => Math.round((perDay.value[d]?.rev || 0) / 100)) }])
const peakDay = computed(() => { let best = null; chartDays.value.forEach((d) => { const v = perDay.value[d]?.rev || 0; if (!best || v > best.v) best = { d, v } }); return best })

// ---- 支付方式占比、热销排名
const payShare = computed(() => {
  const from = dayKey(range.value - 1), m = {}
  for (const o of orders.value) if (EARNED.includes(o.status) && o.createdAt.slice(0, 10) >= from) m[o.pay] = (m[o.pay] || 0) + 1
  return Object.entries(m).map(([k, v]) => ({ name: B.PAY[k], value: v })).sort((a, b) => b.value - a.value)
})
const ranking = computed(() => {
  const from = dayKey(range.value - 1), m = {}
  for (const o of orders.value) if (EARNED.includes(o.status) && o.createdAt.slice(0, 10) >= from) for (const i of o.items) m[i.name] = (m[i.name] || 0) + i.qty
  const list = Object.entries(m).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5)
  const top = list[0]?.qty || 1
  return list.map((x) => ({ ...x, pct: Math.round((x.qty / top) * 100) }))
})

// ---- 会员
const joinedBetween = (fromAgo, toAgo) => state.db.users.filter((u) => u.joined <= dayKey(toAgo) && u.joined >= dayKey(fromAgo)).length
const newMembers = computed(() => joinedBetween(range.value - 1, 0))
const newMembersBefore = computed(() => joinedBetween(range.value * 2 - 1, range.value))
const balanceTotal = computed(() => state.db.users.reduce((s, u) => s + u.balance, 0))
const balanceHolders = computed(() => state.db.users.filter((u) => u.balance > 0).length)

// ---- 售后：负向数据放在最后
const minsSince = (s) => Math.max(0, Math.round((B.NOW().getTime() - new Date(s.replace(' ', 'T') + ':00').getTime()) / 60000))
const rno = (r) => 'RF' + String(r.id).padStart(5, '0')
const waitText = (s) => { const h = Math.floor(minsSince(s) / 60); return h >= 48 ? Math.floor(h / 24) + ' 天' : h + ' 小时' }
const pending = computed(() => state.db.refunds.filter((r) => r.status === 'PENDING').sort((a, b) => (a.appliedAt < b.appliedAt ? -1 : 1)))
const overdue = computed(() => pending.value.filter((r) => minsSince(r.appliedAt) > 24 * 60))
const pendingSum = computed(() => pending.value.reduce((s, r) => s + r.amount, 0))

// ---- 异常提示：只写需要有人处理的
const alerts = computed(() => {
  const out = []
  if (revDelta.value !== null && revDelta.value <= -0.15) out.push({ title: `营业额${prevLabel.value}下降 ${Math.abs(revDelta.value * 100).toFixed(1)}%`, text: `从 ¥${yuan(prev.value.rev)} 降到 ¥${yuan(cur.value.rev)}，可到订单页看看取消与退款的订单。` })
  if (overdue.value.length) out.push({ title: `${overdue.value.length} 条退款申请超过 24 小时没有处理`, text: '最久的已等 ' + waitText(overdue.value[0].appliedAt) + '，在页面最下方的售后提醒里处理。' })
  return out
})

const status = computed(() => (phase.value !== 'ok' ? phase.value : cur.value.cnt ? 'ok' : 'empty'))

// ---- 导出
const exp = ref(false)
const expName = computed(() => '经营数据_' + RANGES.find((r) => r[0] === range.value)[1])
const doExport = async () => {
  await request(700)
  ElMessage.success(`已生成「${expName.value}」，共 ${range.value} 行日汇总`)
}
</script>

<template>
  <div class="lz-page">
    <!-- 手机宽度：库的组件整体换成大尺寸，触摸目标不小于 40 像素 -->
    <el-config-provider :size="narrow ? 'large' : 'default'">
    <LzState v-if="!allowed" status="forbidden" />
    <template v-else>
      <div class="lz-toolbar">
        <el-radio-group v-model="range" aria-label="时间范围">
          <el-radio-button v-for="[n, label] in RANGES" :key="n" :value="n">{{ label }}</el-radio-button>
        </el-radio-group>
        <span class="grow" />
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Download" :disabled="status !== 'ok'" @click="exp = true">导出</el-button>
      </div>

      <el-alert v-for="a in alerts" :key="a.title" :title="a.title" :description="a.text" type="warning" show-icon :closable="false" />

      <LzState :status="status" empty-title="所选范围没有订单" error-hint="数据没有加载出来，请检查网络后重试" :rows="8" @retry="load">
        <template #empty-action><el-button v-if="range < 30" type="primary" @click="range = 30">改看近 30 天</el-button></template>

        <!-- 主：营业额走势占一半以上，订单与客单价缩成右侧小块 -->
        <section class="hero-grid" aria-label="营业额与订单">
          <el-card shadow="never" class="lz-card hero">
            <div class="hero-head">
              <el-statistic title="营业额" :value="cur.rev / 100" :precision="2" class="hero-stat">
                <template #prefix><span class="cur">¥</span></template>
              </el-statistic>
              <div v-if="revDelta !== null" class="hero-delta">
                <span class="muted">{{ prevLabel }}</span>
                <el-tag :type="revDelta >= 0 ? 'success' : 'danger'" effect="light">{{ signed(revDelta) }}</el-tag>
              </div>
            </div>
            <LzChart kind="line" :categories="chartDays.map((d) => d.slice(5))" :series="trend" :height="320" label="营业额折线图，单位元" />
            <p v-if="peakDay && peakDay.v" class="muted note">最高的一天是 {{ peakDay.d }}，¥{{ yuan(peakDay.v) }}。{{ range === 1 ? '今天只有一个点，图里是最近 7 天。' : '' }}</p>
          </el-card>

          <div class="aside">
            <LzKpi label="订单数" :value="cur.cnt" suffix="单" :delta="cntDelta" :note="prevLabel" />
            <LzKpi label="客单价" :value="yuan(cur.avg)" suffix="元" :delta="avgDelta" :note="prevLabel" />
            <el-card v-if="payShare.length > 1" shadow="never" class="lz-card" aria-label="支付方式占比">
              <div class="card-title">支付方式占比（按单数）</div>
              <LzChart kind="pie" :series="payShare" :height="170" label="支付方式占比环图" />
            </el-card>
          </div>
        </section>

        <!-- 次：会员 -->
        <section class="lz-kpis kpis" aria-label="会员">
          <LzKpi v-if="newMembers || newMembersBefore" label="新增会员" :value="newMembers" suffix="人" :delta="ratio(newMembers, newMembersBefore)" :note="prevLabel" />
          <LzKpi label="会员余额合计" :value="yuan(balanceTotal)" suffix="元" />
          <LzKpi label="有余额的会员" :value="balanceHolders" suffix="人" />
        </section>

        <!-- 排名与售后：负向数据放最后 -->
        <section class="lz-main-rail">
          <el-card shadow="never" class="lz-card" aria-label="热销排名">
            <div class="card-title">热销排名（按售出份数）</div>
            <ol class="rank">
              <li v-for="(p, i) in ranking" :key="p.name">
                <span class="rk num">{{ i + 1 }}</span>
                <div class="grow">
                  <div class="rank-line"><span>{{ p.name }}</span><span class="num">{{ p.qty }} 份</span></div>
                  <el-progress :percentage="p.pct" :show-text="false" :stroke-width="8" :aria-label="p.name + ' 售出 ' + p.qty + ' 份'" />
                </div>
              </li>
            </ol>
          </el-card>

          <el-card shadow="never" class="lz-card" aria-label="待处理售后">
            <el-statistic title="待处理售后" :value="pending.length" class="refund-stat"><template #suffix><span class="muted">条</span></template></el-statistic>
            <template v-if="pending.length">
              <p class="muted note">待退金额合计 ¥{{ yuan(pendingSum) }}，其中 {{ overdue.length }} 条超过 24 小时。</p>
              <ul class="remind">
                <li v-for="r in pending.slice(0, 4)" :key="r.id">
                  <span class="grow"><span class="num">{{ rno(r) }}</span> {{ r.userName }}</span>
                  <span class="num">¥{{ yuan(r.amount) }}</span>
                  <el-tag :type="minsSince(r.appliedAt) > 1440 ? 'warning' : 'info'" effect="light">已等 {{ waitText(r.appliedAt) }}</el-tag>
                </li>
              </ul>
              <el-button type="primary" plain @click="router.push('/refunds')">去售后处理</el-button>
            </template>
            <el-empty v-else :image-size="56" description="没有待审批的退款，都处理完了" />
          </el-card>
        </section>
      </LzState>
    </template>

    <LzDialog v-model="exp" title="导出经营数据" :width="narrow ? '94%' : '440px'" confirm-text="开始导出" :on-confirm="doExport">
      <p>导出范围：{{ RANGES.find((r) => r[0] === range)[1] }}，按天汇总，共 <span class="num">{{ range }}</span> 行；表头是中文，金额单位为元，不含内部编号和空列。</p>
      <p class="muted">文件名：{{ expName }}.xlsx</p>
    </LzDialog>
    </el-config-provider>
  </div>
</template>

<style scoped>
@media (max-width: 700px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } }
.hero-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr); gap: 16px; align-items: start; }
@media (max-width: 1100px) { .hero-grid { grid-template-columns: minmax(0, 1fr); } }
.aside { display: grid; gap: 16px; min-width: 0; }
.hero-head { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; margin-bottom: 8px; }
.hero-stat :deep(.el-statistic__content) { font-size: 32px; font-weight: 600; font-variant-numeric: tabular-nums; }
.cur { font-size: 18px; margin-right: 2px; }
.hero-delta { display: flex; align-items: center; gap: 8px; }
.note { margin: 8px 0 0; }
.card-title { font-size: 14px; color: var(--luz-ink-2); }
.refund-stat :deep(.el-statistic__content) { font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; }
.rank, .remind { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 12px; }
.rank li { display: flex; gap: 12px; align-items: center; }
.rk { width: 22px; height: 22px; border-radius: 50%; background: var(--luz-action-tint); color: var(--luz-action-text); display: inline-flex; align-items: center; justify-content: center; font-weight: 600; flex: none; }
.rank-line { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.remind { margin-bottom: 12px; }
.remind li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
</style>
