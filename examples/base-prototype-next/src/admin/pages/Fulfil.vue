<script>
// 履约看板：今天的订单按“待支付、待出餐、已出餐、已完成”分列，待出餐是视觉重心，超过 15 分钟的卡片标橙。
export const meta = {
  id: 'fulfil', label: '履约看板', icon: 'kanban', group: '交易', order: 2, roles: ['A', 'F'],
  layout: '看板分列',
  reason: '前台盯的是今天每一单走到了哪一步，订单天然按“待支付、待出餐、已出餐、已完成”流转，所以用看板分列，把最需要动手的“待出餐”列做成视觉重心，超过 15 分钟的卡片标橙',
  scenes: [
    { id: 'nodata', label: '今天还没有订单' },
    { id: 'fulfil-conflict', label: '移动失败：订单已被同事处理' },
    { id: 'pay-notfound', label: '确认收款失败：渠道没查到这笔付款' },
  ],
}
</script>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, maskPhone, yuan } from '../../shared/format.js'

const router = useRouter()
const scene = useScene('fulfil')
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

// ---- 时间与状态：和订单页同一套规则（改状态记发生时间与操作记录，并维护会员的下单数与消费额）
const COLS = [['UNPAID', '待支付'], ['PAID', '待出餐'], ['FULFILLED', '已出餐'], ['DONE', '已完成']]
const COUNTED = ['PAID', 'FULFILLED', 'DONE']
const SLOW = 15
const today = K.ymd(B.NOW())
const nowStr = () => B.fmt(B.NOW())
const parse = (s) => new Date(s.replace(' ', 'T') + ':00')
const minsSince = (s) => Math.max(0, Math.round((B.NOW().getTime() - parse(s).getTime()) / 60000))
const hhmm = (s) => (s || '').slice(11)
const fmtMin = (m) => (m < 120 ? m + ' 分钟' : Math.floor(m / 60) + ' 小时' + (m % 60 ? ' ' + (m % 60) + ' 分钟' : ''))
const me = computed(() => (state.role === 'A' ? '王海燕' : '陈晓燕'))
const itemsText = (o) => o.items.map((i) => `${i.name}×${i.qty}`).join('、')
const userOf = (o) => state.db.users.find((u) => u.id === o.userId)

/** 每个状态的发生时间：本页操作过的取 o.t，没有的按下单与付款时间推一个不晚于现在的值 */
function times(o) {
  const t = o.t || {}, n = +o.no.slice(-3), end = B.NOW().getTime(), base = parse(o.paidAt || o.createdAt).getTime(), s = o.status
  const at = (m) => B.fmt(new Date(Math.min(end, base + m * 60000)))
  return {
    created: o.createdAt, paid: o.paidAt || '',
    fulfilled: t.fulfilled || (s === 'FULFILLED' || s === 'DONE' ? at(9 + (n % 6)) : ''),
    done: t.done || (s === 'DONE' ? at(16 + (n % 9)) : ''),
  }
}
/** 现在这一步已经等了多少分钟：待支付从下单算，待出餐从付款算，已出餐从出餐算，已完成不算 */
function waitOf(o) {
  const T = times(o)
  return o.status === 'UNPAID' ? minsSince(o.createdAt) : o.status === 'PAID' ? minsSince(T.paid || o.createdAt) : o.status === 'FULFILLED' ? minsSince(T.fulfilled || o.createdAt) : 0
}
const isSlow = (o) => o.status !== 'DONE' && waitOf(o) > SLOW
function setStatus(o, to, key, text, who) {
  const from = o.status, was = COUNTED.includes(from), will = COUNTED.includes(to)
  o.status = to; (o.t = o.t || {})[key] = nowStr()
  if (to === 'PAID' && !o.paidAt) o.paidAt = nowStr()
  if (was !== will) { const u = userOf(o); if (u) { u.orders += will ? 1 : -1; u.spent += will ? o.amount : -o.amount } }
  ;(o.log = o.log || []).push({ at: nowStr(), who: who || me.value, text })
}
function audit(action, target) {
  const a = state.db.audit
  a.unshift({ id: a.reduce((m, x) => Math.max(m, x.id), 0) + 1, at: nowStr(), actor: me.value, code: 'order:fulfil', action, target, result: '成功', ip: '10.0.0.8', trace: 'tr' + Math.floor(Math.random() * 1e8).toString(16) })
}

/** 看板规则：返回不能这样移动的原因，空串表示可以 */
function moveRule(from, to) {
  if (from === to) return '订单已经在这一列'
  if (from === 'DONE') return '已完成的订单不能再移动'
  if (to === 'UNPAID') return '已付款的订单不能退回待支付'
  if (from === 'FULFILLED' && to === 'PAID') return '已出餐的订单不能退回待出餐，需要处理请走退款'
  if (from === 'UNPAID' && (to === 'FULFILLED' || to === 'DONE')) return '待支付的订单要先确认收款，再出餐'
  if (from === 'PAID' && to === 'DONE') return '请先出餐，再标记完成'
  return ''
}
const NEXT = { UNPAID: ['PAID', '确认收款'], PAID: ['FULFILLED', '出餐'], FULFILLED: ['DONE', '完成'] }

// ---- 看板数据：今天下的单；“今天还没有订单”场景下只有本页刚模拟出来的
const fresh = ref([])
const list = computed(() => state.db.orders.filter((o) => o.createdAt.slice(0, 10) === today && COLS.some((c) => c[0] === o.status) && (scene.value !== 'nodata' || fresh.value.includes(o.no))))
const sorted = (arr, st) => arr.slice().sort((a, b) => (st === 'DONE' ? (a.createdAt < b.createdAt ? 1 : -1) : (a.createdAt < b.createdAt ? -1 : 1)))
const DONE_CAP = 10
const cols = computed(() => COLS.map(([id, title]) => {
  const all = sorted(list.value.filter((o) => o.status === id), id)
  return { id, title, total: all.length, cards: id === 'DONE' ? all.slice(0, DONE_CAP) : all }
}))
const status = computed(() => (phase.value !== 'ok' ? phase.value : list.value.length ? 'ok' : 'empty'))

const strip = computed(() => {
  const paid = list.value.filter((o) => o.status === 'PAID')
  const waits = paid.map(waitOf)
  return {
    wait: paid.length,
    longest: waits.length ? Math.max(...waits) : 0,
    avg: waits.length ? Math.round(waits.reduce((s, x) => s + x, 0) / waits.length) : null,
    slow: list.value.filter((o) => (o.status === 'PAID' || o.status === 'FULFILLED') && waitOf(o) > SLOW).length,
    done: list.value.filter((o) => o.status === 'DONE').length,
  }
})

// ---- 移动：先过规则，再按需要确认，再改订单；失败时订单留在原列并写清原因
const busy = ref('')
const CONFLICT = { FULFILLED: ['出餐', 'fulfilled', '这单刚被其他同事出餐了'], DONE: ['完成', 'done', '这单刚被其他同事处理完成了'] }
async function step(o, to) {
  busy.value = o.no
  try {
    await request(300)
    if (scene.value === 'fulfil-conflict' && CONFLICT[to]) {
      const [verb, key, why] = CONFLICT[to]
      setStatus(o, to, key, '同事已' + verb, '其他同事')
      throw new Error(`移动失败：${why}，已刷新为最新状态`)
    }
    if (to === 'FULFILLED') { setStatus(o, 'FULFILLED', 'fulfilled', '出餐'); audit('订单出餐', '订单 ' + o.no); ElMessage.success('已出餐，取餐号 ' + o.pickup) }
    else { setStatus(o, 'DONE', 'done', '顾客取餐，订单完成'); audit('订单完成', '订单 ' + o.no); ElMessage.success('订单已完成') }
  } catch (e) { ElMessage.error(e.message) } finally { busy.value = '' }
}
async function move(o, to) {
  const why = moveRule(o.status, to)
  if (why) { ElMessage.warning(why); return }
  if (o.status === 'UNPAID') { Object.assign(pay, { open: true, o, ok: false }); return }
  await step(o, to)
}

const pay = reactive({ open: false, o: null, ok: false })
const doPay = async () => {
  const o = pay.o
  if (o.status !== 'UNPAID') throw new Error('订单现在不是待支付，不能确认收款，请刷新后查看')
  await request(500, { fail: scene.value === 'pay-notfound' ? new Error('确认收款失败：渠道没查到这笔付款，订单仍是待支付，请让顾客重新支付或稍后再查') : null })
  setStatus(o, 'PAID', 'paid', '前台确认收款 ¥' + yuan(o.amount))
  audit('确认收款', `订单 ${o.no}，¥${yuan(o.amount)}`)
  ElMessage.success('已确认收款，订单进入待出餐')
}

// ---- 拖动：和卡片上的按钮走同一条规则
const drag = reactive({ no: '', over: '' })
function onDragStart(e, o) { if (o.status === 'DONE') { e.preventDefault(); return } drag.no = o.no; e.dataTransfer.setData('text/plain', o.no); e.dataTransfer.effectAllowed = 'move' }
function onDrop(to) {
  const o = state.db.orders.find((x) => x.no === drag.no)
  Object.assign(drag, { no: '', over: '' })
  if (o) move(o, to)
}

// ---- 模拟来一单（演示用）与自动刷新
function newOrder() {
  const db = state.db, r = Math.random, prods = db.products.filter((p) => p.status === 'ON'), n = 1 + Math.floor(r() * 2), items = []
  for (let i = 0; i < n; i++) {
    const p = prods[Math.floor(r() * prods.length)], sp = p.specs[0].opts[Math.floor(r() * p.specs[0].opts.length)], q = 1 + Math.floor(r() * 2)
    items.push({ pid: p.id, name: p.name, spec: sp.n, qty: q, price: p.price + sp.d, img: p.img })
  }
  const u = db.users[Math.floor(r() * db.users.length)], sub = items.reduce((s, x) => s + x.price * x.qty, 0), paid = r() < 0.7
  const used = new Set(db.orders.filter((o) => o.createdAt.slice(0, 10) === today).map((o) => o.pickup))
  let pk; do { pk = 'A' + String(10 + Math.floor(r() * 80)) } while (used.has(pk) && used.size < 80)
  let seq = 1, no; do { no = '26' + today.replace(/-/g, '').slice(2) + String(500000 + seq++ * 137) } while (db.orders.some((o) => o.no === no))
  db.orders.unshift({ no, userId: u.id, userName: u.name, items, subtotal: sub, discount: 0, amount: sub, pay: ['WECHAT', 'WECHAT', 'BALANCE', 'CARD'][Math.floor(r() * 4)], status: paid ? 'PAID' : 'UNPAID', createdAt: nowStr(), paidAt: paid ? nowStr() : '', remark: '', pickup: pk, coupon: '' })
  fresh.value.push(no)
  if (paid) { u.orders++; u.spent += sub }
  ElMessage.success(`新订单 ${pk} 进入「${paid ? '待出餐' : '待支付'}」`)
}
const auto = ref(false)
let timer = null
watch(auto, (on) => {
  clearInterval(timer); timer = null
  if (on) { timer = setInterval(newOrder, 20000); ElMessage.info('已开启自动刷新示意：每 20 秒来一张新订单') } else ElMessage.info('已关闭自动刷新')
})
onBeforeUnmount(() => clearInterval(timer))

// ---- 详情：概况与操作记录
const detail = reactive({ open: false, o: null, tab: 'ov' })
const openDetail = (o) => Object.assign(detail, { open: true, o, tab: 'ov' })
const flow = computed(() => {
  const o = detail.o; if (!o) return { active: 0, steps: [] }
  const T = times(o)
  return { active: { UNPAID: 1, PAID: 2, FULFILLED: 3, DONE: 4 }[o.status] || 1, steps: [['下单', T.created], ['支付', T.paid], ['出餐', T.fulfilled], ['完成', T.done]] }
})
const records = computed(() => {
  const o = detail.o; if (!o) return []
  const T = times(o), logged = new Set(Object.keys(o.t || {})), R = [{ at: T.created, who: o.userName + '（会员）', text: '提交订单' }]
  if (T.paid && !logged.has('paid')) R.push({ at: T.paid, who: '系统', text: `收到${B.PAY[o.pay]}付款 ¥${yuan(o.amount)}` })
  ;[['fulfilled', '出餐'], ['done', '顾客取餐，订单完成']].forEach(([k, t]) => { if (T[k] && !logged.has(k)) R.push({ at: T[k], who: '前台', text: t }) })
  ;(o.log || []).forEach((l) => R.push(l))
  return R.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
})
function toOrders() { detail.open = false; router.push('/orders') }
</script>

<template>
  <div class="lz-page">
    <!-- 手机宽度：库的组件整体换成大尺寸，触摸目标不小于 40 像素 -->
    <el-config-provider :size="narrow ? 'large' : 'default'">
    <LzState v-if="!allowed" status="forbidden" />
    <template v-else>
      <div class="lz-toolbar">
        <el-switch v-model="auto" aria-label="自动刷新示意" />
        <span>自动刷新示意（每 20 秒来一张新订单）</span>
        <span class="grow" />
        <el-button @click="newOrder">模拟来一单</el-button>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </div>

      <LzState :status="status" empty-title="今天还没有订单" error-hint="看板没有加载出来，请检查网络后重试" :rows="8" @retry="load">
        <template #empty-action><el-button type="primary" @click="newOrder">模拟来一单</el-button></template>

        <section class="lz-kpis kpis" aria-label="今日履约摘要">
          <LzKpi label="待出餐" :value="strip.wait" suffix="单" />
          <LzKpi label="平均等待（只算待出餐）" :value="strip.avg === null ? '—' : fmtMin(strip.avg)" />
          <LzKpi :label="'超时（超过 ' + SLOW + ' 分钟）'" :value="strip.slow" suffix="单" />
          <LzKpi label="今天已完成" :value="strip.done" suffix="单" />
        </section>
        <p v-if="strip.wait" class="muted note">待出餐里最久的已等 {{ fmtMin(strip.longest) }}。拖动卡片或点卡片上的按钮，把订单移到下一步。</p>

        <section class="board" aria-label="订单看板">
          <section
            v-for="c in cols" :key="c.id" class="kcol" :class="{ hot: c.id === 'PAID', over: drag.over === c.id }" :aria-label="c.title + ' ' + c.total + ' 单'"
            @dragover.prevent="drag.over = c.id" @dragleave="drag.over = ''" @drop.prevent="onDrop(c.id)"
          >
            <div class="kcol-head"><span class="kcol-title">{{ c.title }}</span><el-tag :type="c.id === 'PAID' ? 'primary' : 'info'" effect="light" round :class="{ zero: !c.total }">{{ c.total }}</el-tag></div>
            <el-empty v-if="!c.cards.length" :image-size="40" description="没有订单" class="kcol-empty" />
            <el-card
              v-for="o in c.cards" :key="o.no" shadow="never" class="kcard" :class="{ slow: isSlow(o) }"
              :draggable="o.status !== 'DONE'" :aria-label="'取餐号 ' + o.pickup + '，' + c.title" @dragstart="onDragStart($event, o)" @dragend="Object.assign(drag, { no: '', over: '' })"
            >
              <div class="kc-head"><span class="kc-no">取餐号 {{ o.pickup }}</span><span class="num">¥{{ yuan(o.amount) }}</span></div>
              <div class="kc-items clamp-2" :title="itemsText(o)">{{ itemsText(o) }}</div>
              <div class="kc-meta">
                <span v-if="o.status === 'DONE'" class="muted num">已完成 {{ hhmm(times(o).done) }}</span>
                <el-tag v-else :type="isSlow(o) ? 'warning' : 'info'" effect="light">已等 {{ fmtMin(waitOf(o)) }}{{ isSlow(o) ? '，超时' : '' }}</el-tag>
                <span class="muted">{{ o.userName }} · {{ hhmm(o.createdAt) }} 下单</span>
              </div>
              <div class="kc-actions">
                <el-button v-if="NEXT[o.status]" type="primary" plain :loading="busy === o.no" @click="move(o, NEXT[o.status][0])">{{ NEXT[o.status][1] }}</el-button>
                <el-button @click="openDetail(o)">详情</el-button>
              </div>
            </el-card>
            <p v-if="c.total > c.cards.length" class="muted note">还有 {{ c.total - c.cards.length }} 单较早完成的，在订单页查看。</p>
          </section>
        </section>
      </LzState>
    </template>

    <!-- 确认收款：不能撤销，要勾选核实 -->
    <LzDialog v-model="pay.open" title="确认收款" :width="narrow ? '94%' : '440px'" confirm-text="确认收款" :confirm-disabled="!pay.ok" :on-confirm="doPay">
      <template v-if="pay.o">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="订单">取餐号 {{ pay.o.pickup }} · {{ pay.o.userName }}</el-descriptions-item>
          <el-descriptions-item label="应收金额（元）"><span class="num">{{ yuan(pay.o.amount) }}</span>（{{ B.PAY[pay.o.pay] }}）</el-descriptions-item>
          <el-descriptions-item label="改前 → 改后">待支付 → 待出餐</el-descriptions-item>
        </el-descriptions>
        <el-checkbox v-model="pay.ok" class="pay-check">我已核实收到这笔款项</el-checkbox>
        <p class="muted">确认后订单进入「待出餐」，不能撤销；系统会先向支付渠道查一次这笔付款。</p>
      </template>
    </LzDialog>

    <!-- 详情：居中对话框，不用抽屉 -->
    <LzDialog v-model="detail.open" :title="'订单 ' + (detail.o?.no || '')" :width="narrow ? '94%' : '640px'" no-footer>
      <template v-if="detail.o">
        <el-steps :active="flow.active" finish-status="success" align-center class="flow">
          <el-step v-for="[label, at] in flow.steps" :key="label" :title="label" :description="at ? at.slice(5) : '未到这一步'" />
        </el-steps>
        <el-tabs v-model="detail.tab">
          <el-tab-pane label="概况" name="ov">
            <el-descriptions :column="narrow ? 1 : 2" border>
              <el-descriptions-item label="状态"><LzStatusTag kind="order" :status="detail.o.status" /></el-descriptions-item>
              <el-descriptions-item label="取餐号">{{ detail.o.pickup }}</el-descriptions-item>
              <el-descriptions-item label="会员">{{ detail.o.userName }}</el-descriptions-item>
              <el-descriptions-item label="手机号"><span class="num">{{ maskPhone(userOf(detail.o)?.phone) }}</span></el-descriptions-item>
              <el-descriptions-item label="支付方式">{{ B.PAY[detail.o.pay] }}</el-descriptions-item>
              <el-descriptions-item label="实付金额（元）"><span class="num">{{ yuan(detail.o.amount) }}</span></el-descriptions-item>
              <el-descriptions-item label="顾客备注" :span="2">{{ detail.o.remark || '无' }}</el-descriptions-item>
            </el-descriptions>
            <el-table :data="detail.o.items" size="large" class="items">
              <el-table-column label="商品" prop="name" min-width="110" />
              <el-table-column label="规格" prop="spec" width="64" align="center" />
              <el-table-column label="数量" prop="qty" width="60" align="center" />
              <el-table-column label="小计（元）" width="100" align="right"><template #default="{ row }"><span class="num">{{ yuan(row.price * row.qty) }}</span></template></el-table-column>
            </el-table>
            <p class="right num">商品 ¥{{ yuan(detail.o.subtotal) }}，优惠 −¥{{ yuan(detail.o.discount) }}，实付 ¥{{ yuan(detail.o.amount) }}</p>
          </el-tab-pane>
          <el-tab-pane label="操作记录" name="rec">
            <el-timeline>
              <el-timeline-item v-for="(r, i) in records" :key="i" :timestamp="r.at.slice(5) + ' · ' + r.who">{{ r.text }}</el-timeline-item>
            </el-timeline>
          </el-tab-pane>
        </el-tabs>
        <div class="detail-actions">
          <span v-if="['UNPAID', 'PAID'].includes(detail.o.status) && state.role === 'A'" class="muted">需要取消订单，请到订单页处理。</span>
          <span class="grow" />
          <el-button v-if="['UNPAID', 'PAID'].includes(detail.o.status) && state.role === 'A'" @click="toOrders">去订单页</el-button>
          <el-button v-if="NEXT[detail.o.status]" type="primary" @click="move(detail.o, NEXT[detail.o.status][0])">{{ NEXT[detail.o.status][1] }}</el-button>
        </div>
      </template>
    </LzDialog>
    </el-config-provider>
  </div>
</template>

<style scoped>
.note { margin: 0; }
@media (max-width: 700px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } }
.board { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 1100px) { .board { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .board { grid-template-columns: minmax(0, 1fr); } }
.kcol { display: grid; gap: 12px; align-content: start; min-width: 0; min-height: 160px; padding: 12px; background: var(--luz-surface); border: 1px solid var(--luz-line); border-radius: var(--luz-radius-card); }
.kcol.hot { background: var(--luz-action-tint); border-color: transparent; }
.kcol.over { outline: 2px dashed var(--luz-action); outline-offset: -2px; }
.kcol-head { display: flex; align-items: center; justify-content: space-between; }
.kcol-title { font-weight: 600; }
.zero { opacity: .7; }
.kcol-empty { padding: 8px 0; }
.kcard { border-radius: var(--luz-radius-control); cursor: grab; }
.kcard.slow { border-left: 3px solid var(--luz-warning); }
.kcard :deep(.el-card__body) { display: grid; gap: 8px; padding: 12px; }
.kc-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.kc-no { font-weight: 600; }
.kc-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; }
.kc-actions { display: flex; gap: 8px; }
.pay-check { margin: 12px 0 4px; }
.flow { margin-bottom: 8px; }
.items { margin: 12px 0; }
.detail-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
</style>
