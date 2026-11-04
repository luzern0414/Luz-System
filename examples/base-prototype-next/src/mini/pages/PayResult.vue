<script>
// 支付结果（主次布局）：结果是占满首屏的主角，订单信息和取餐码是配角；每种失败只给一两个一步到位的出路。
// 地址参数：?no=订单号（没有时看最近一笔已支付的订单）。支付调起之后按 1、2、4、6、8 秒的节奏向“服务端”查结果。
export const meta = {
  id: 'pay-result', label: '支付结果', title: '支付结果', group: '点单', order: 6,
  layout: '主次布局',
  reason: '用户这时只想知道一件事：钱付成功没有。所以结果（成功、处理中、失败、迟到）是占满首屏的主角，订单信息和取餐码是配角；每种失败只给一两个一步到位的出路，不让人猜',
  scenes: [
    { id: 'success', label: '支付成功' },
    { id: 'pending', label: '处理中，超时后稍后在订单里查看' },
    { id: 'slow', label: '处理中，第 3 次查询后成功' },
    { id: 'cancel', label: '失败：用户取消支付' },
    { id: 'nofund', label: '失败：储值余额不足' },
    { id: 'channel', label: '失败：支付渠道故障' },
    { id: 'late', label: '迟到支付：订单已关闭，款项原路退回' },
  ],
}
</script>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { money } from '../../shared/format.js'
import { useNav } from '../nav.js'
import { availBalance, demoOrder, methodName, methodOf, mineOrders, orderByNo, payOrder, queryOrder, splitOf, sweep } from './Checkout.vue'
import { storeOf } from './Cart.vue'

const { go, replace, toTab } = useNav()
const route = useRoute()
const scene = useScene('pay-result')
const toast = (message, o = {}) => showToast({ message, teleport: '#phone-overlay', ...o })
const DELAYS = [1000, 2000, 4000, 6000, 8000]
const SIM = ['success', 'pending', 'slow', 'cancel', 'nofund', 'channel', 'late']
const FAIL = {
  cancel: { icon: 'close', title: '你取消了支付', text: '订单还为你保留着，倒计时结束前可以继续支付，没有扣款。' },
  nofund: { icon: 'balance-o', title: '储值余额不够', text: '支付时余额不足，这笔订单没有扣款。可以充值后再付，或改用微信支付。' },
  channel: { icon: 'warning-o', title: '微信支付暂时不可用', text: '支付渠道繁忙，这笔订单没有扣款。稍等一会儿重新支付，或改用储值余额。' },
}

/* 订单：地址里的订单号；选了演示场景时造一张对应的演示订单（从结算页带着同一场景过来的，用真实订单） */
const noRef = ref(String(route.query.no || ''))
let simFor = null
function pickDemo(s) {
  if (SIM.includes(s) && route.query.s !== s && simFor !== s) { simFor = s; noRef.value = demoOrder(s).no }
}
watch(scene, pickDemo, { immediate: true })
const guest = computed(() => state.role === 'guest')
const order = computed(() => (noRef.value ? orderByNo(noRef.value) : mineOrders().find((x) => ['PAID', 'FULFILLED', 'DONE'].includes(x.status)) || mineOrders()[0]))

/* 查询：处理中 → 成功、失败、超时、已关闭、迟到支付 */
const P = reactive({ n: 0, state: 'processing', reason: '', err: false })
let timer = 0, run = 0
function begin() {
  clearTimeout(timer); run++; P.n = 0; P.err = false
  const o = order.value; if (!o) return
  if (o.status !== 'UNPAID') { const r0 = queryOrder(o, 0); P.state = r0.state; P.reason = r0.reason || ''; return }
  P.state = 'processing'; schedule()
}
function schedule() {
  clearTimeout(timer)
  const o = order.value; if (!o || P.state !== 'processing') return
  const my = run, balanceOnly = o.paySplit && !o.paySplit.wechat
  timer = setTimeout(() => step(my), P.n === 0 && balanceOnly ? 400 : DELAYS[Math.min(P.n, DELAYS.length - 1)])
}
async function step(my) {
  if (P.state !== 'processing' || my !== run) return
  P.n++
  try {
    await request(120)
    if (my !== run) return
    const r = queryOrder(order.value, P.n); P.err = false
    if (r.state !== 'processing') { P.state = r.state; P.reason = r.reason || ''; return }
  } catch { P.err = true }
  if (P.n >= DELAYS.length) { P.state = 'timeout'; return }
  schedule()
}
watch(() => order.value && order.value.no, begin, { immediate: true })
onBeforeUnmount(() => { clearTimeout(timer); run++ })
const refresh = () => begin()
async function doPay(method) {
  const r = await payOrder(order.value, method)
  if (r === 'closed') toast('订单已超时关闭')
  begin()
}
function expire() { sweep(); P.state = 'closed' }

/* 页面内容 */
const o = computed(() => order.value)
const store = computed(() => storeOf(o.value.storeId))
const count = computed(() => o.value.items.reduce((s, i) => s + i.qty, 0))
const itemsText = computed(() => o.value.items.map((i) => i.name + ' ×' + i.qty).join('、'))
const split = computed(() => splitOf(o.value))
const refund = computed(() => state.db.refunds.find((r) => r.orderNo === o.value.no))
const refundDone = computed(() => !!refund.value && refund.value.stage === 'DONE')
const refundStep = computed(() => (refundDone.value ? 3 : refund.value && refund.value.stage !== 'REVIEW' ? 2 : 1))
const fail = computed(() => FAIL[P.reason] || FAIL.cancel)
const leftMs = computed(() => Math.max(0, (o.value.deadlineAt || 0) - Date.now()))
const lateAt = computed(() => (refund.value && refund.value.doneAt ? refund.value.doneAt.slice(5, 16) : ''))
const hero = computed(() => {
  const x = o.value
  switch (P.state) {
    case 'paid': return { tone: 'ok', icon: 'checked', title: '支付成功', text: '门店已收到订单，正在为你备餐' }
    case 'processing': return { tone: 'info', icon: '', title: '正在确认支付结果', text: P.err ? '网络不太稳定，正在重试…' : '请稍候，不要重复支付' }
    case 'timeout': return { tone: 'warn', icon: 'clock-o', title: '支付结果确认中', text: '暂时还没查到结果，款项可能还在处理。请不要重复支付，结果出来后会通知你。' }
    case 'failed': return { tone: 'bad', icon: fail.value.icon, title: fail.value.title, text: fail.value.text }
    case 'closed': return { tone: 'warn', icon: 'clock-o', title: '订单已超时关闭', text: '超过 30 分钟没有完成支付，订单已自动关闭，用掉的优惠券已退回。没有扣款。' }
    default: return { tone: 'warn', icon: 'info-o', title: refundDone.value ? '款项已原路退回' : '订单已关闭，款项将原路退回', text: '订单超时未支付已自动关闭，你在关闭后完成了支付 ' + money(x.late ? x.late.amount : x.amount) + '，系统已自动发起全额退款。' }
  }
})

/* 取餐码：二维码示意（按订单号生成固定的方块图）加 4-4 数字码 */
const code = computed(() => { let n = 0; for (const c of o.value.no) n = (n * 31 + c.charCodeAt(0)) >>> 0; const s = String(10000000 + ((n * 7919 + 4096) % 90000000)); return s.slice(0, 4) + ' ' + s.slice(4, 8) })
const qrPath = computed(() => {
  const N = 25; let seed = 0; for (const c of code.value.replace(' ', '')) seed = (seed * 131 + c.charCodeAt(0)) >>> 0
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const m = Array.from({ length: N }, () => Array.from({ length: N }, () => rnd() > 0.52))
  const finder = (x, y) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) { const a = x + i, b = y + j; if (a < 0 || b < 0 || a >= N || b >= N) continue; const edge = i === 0 || j === 0 || i === 6 || j === 6, core = i >= 2 && i <= 4 && j >= 2 && j <= 4; m[b][a] = i >= 0 && j >= 0 && i <= 6 && j <= 6 && (edge || core) } }
  finder(0, 0); finder(N - 7, 0); finder(0, N - 7)
  let d = ''; m.forEach((row, y) => { let x = 0; while (x < N) { if (!row[x]) { x++; continue } let w = 1; while (x + w < N && row[x + w]) w++; d += 'M' + x + ' ' + y + 'h' + w + 'v1h-' + w + 'z'; x += w } })
  return d
})
const live = computed(() => ['PAID', 'FULFILLED'].includes(o.value.status))

/* 改用其他方式 */
const showMethods = ref(false)
const methodActions = computed(() => {
  const bal = availBalance(), a = o.value.amount, cur = methodOf(o.value)
  return [
    { name: '微信支付', subname: '推荐，支付 ' + money(a), value: 'wechat', color: cur === 'wechat' ? 'var(--luz-action-text)' : undefined },
    { name: '储值余额', subname: bal >= a ? '余额 ' + money(bal) + '，支付后剩 ' + money(bal - a) : '余额 ' + money(bal) + '，不够支付', value: 'balance', disabled: bal < a, color: cur === 'balance' ? 'var(--luz-action)' : undefined },
    { name: '储值余额 + 微信支付', subname: bal > 0 && bal < a ? '余额抵扣 ' + money(bal) + '，再微信支付 ' + money(a - bal) : bal >= a ? '余额足够，不需要组合' : '没有可用余额', value: 'mix', disabled: !(bal > 0 && bal < a), color: cur === 'mix' ? 'var(--luz-action)' : undefined },
  ]
})
const pickMethod = (a) => { showMethods.value = false; doPay(a.value) }
function copyNo() { try { navigator.clipboard.writeText(o.value.no) } catch { /* 演示环境没有剪贴板权限也提示已复制 */ } toast('订单号已复制') }
</script>

<template>
  <div class="mp-page result">
    <MiniState :status="guest ? 'forbidden' : !o ? 'empty' : 'ok'" empty-text="没有找到这笔订单，订单可能已被删除">
      <template #empty-action><van-button round type="primary" size="small" @click="toTab('orders')">查看订单</van-button></template>
      <template #forbidden-action><van-button round type="primary" size="small" @click="go('login', { redirect: 'back' })">去登录</van-button></template>

      <template v-if="o">
        <section class="hero" :class="'is-' + hero.tone" aria-live="polite">
          <div class="hero-ic"><van-loading v-if="P.state === 'processing'" type="spinner" size="40" /><van-icon v-else :name="hero.icon" size="44" /></div>
          <h2>{{ hero.title }}</h2>
          <p class="hero-t">{{ hero.text }}</p>
          <template v-if="P.state === 'paid'">
            <MiniPrice :cents="o.amount" :size="28" />
            <p v-if="split.balance" class="hero-sub">其中储值余额 {{ money(split.balance) }}，剩余 {{ money(state.db.me.balance) }}</p>
          </template>
          <template v-else-if="P.state === 'processing'">
            <van-progress :percentage="Math.round((P.n / DELAYS.length) * 100)" :show-pivot="false" stroke-width="6" class="hero-bar" />
            <p class="hero-sub">{{ P.n ? '已向微信查询 ' + P.n + ' 次（最多 ' + DELAYS.length + ' 次）' : '马上开始查询' }}</p>
          </template>
          <p v-else-if="P.state === 'failed'" class="hero-keep">订单为你保留 <van-count-down :key="o.no + P.n + P.state" :time="leftMs" format="mm:ss" class="cd" @finish="expire" /></p>
          <p v-else-if="P.state === 'late'" class="hero-keep">{{ refundDone ? '已于 ' + lateAt + ' 到账' : '预计 1–3 个工作日退回支付账户' }}</p>
        </section>

        <van-cell-group v-if="P.state === 'late'" inset title="退款进度">
          <div class="steps"><van-steps :active="refundStep"><van-step>订单关闭</van-step><van-step>收到支付</van-step><van-step>发起退款</van-step><van-step>退款到账</van-step></van-steps></div>
        </van-cell-group>

        <van-cell-group v-if="P.state === 'paid'" inset title="取餐码">
          <div class="pick" :class="{ dead: !live }">
            <svg class="qr" viewBox="-1 -1 27 27" role="img" aria-label="取餐二维码"><path :d="qrPath" fill="currentColor" /></svg>
            <div class="pick-info">
              <p class="muted">取餐码</p>
              <b class="code num" :aria-label="'取餐码 ' + code.split('').join(' ')">{{ code }}</b>
              <p v-if="o.pickup">取餐号 <span class="strong num">{{ o.pickup }}</span></p>
              <p class="muted">{{ live ? '请向店员出示' : o.status === 'DONE' ? '已取餐，取餐码已失效' : '取餐码已失效' }}</p>
            </div>
          </div>
        </van-cell-group>

        <van-cell-group inset title="订单信息">
          <div class="thumbs"><van-image v-for="(it, i) in o.items.slice(0, 4)" :key="i" :src="it.img" width="48" height="48" fit="cover" radius="8" :alt="it.name" /><span v-if="o.items.length > 4" class="more num">+{{ o.items.length - 4 }}</span></div>
          <van-cell :title="store.name" :label="'共 ' + count + ' 件 · ' + itemsText" />
          <van-cell title="订单号" :label="o.no" center>
            <template #right-icon><van-button size="small" plain icon="description-o" aria-label="复制订单号" @click="copyNo">复制</van-button></template>
          </van-cell>
          <van-cell title="应付金额" :value="money(o.amount)" value-class="num" />
          <van-cell v-if="(split.balance || split.wechat) && o.status !== 'CANCELLED'" title="支付方式" :value="methodName(methodOf(o))" />
        </van-cell-group>

        <van-cell-group v-if="P.state === 'processing' || P.state === 'timeout'" inset>
          <van-cell title="支付结果以微信返回的为准，页面会自动更新" icon="info-o" />
        </van-cell-group>
        <van-cell-group v-if="P.state === 'failed'" inset>
          <van-cell title="暂不支付，去订单查看" is-link @click="toTab('orders')" />
        </van-cell-group>
      </template>
    </MiniState>

    <van-action-bar v-if="o && !guest && P.state !== 'processing'" placeholder>
      <template v-if="P.state === 'paid' || P.state === 'late'">
        <van-action-bar-button type="primary" text="查看订单" @click="replace('order-detail', { id: o.no })" />
        <van-action-bar-button :text="P.state === 'paid' ? '继续点单' : '重新点单'" @click="toTab('menu')" />
      </template>
      <template v-else-if="P.state === 'timeout'">
        <van-action-bar-button type="primary" text="刷新结果" @click="refresh" />
        <van-action-bar-button text="稍后在订单里查看" @click="toTab('orders')" />
      </template>
      <template v-else-if="P.state === 'closed'">
        <van-action-bar-button type="primary" text="重新下单" @click="replace('cart')" />
        <van-action-bar-button text="查看订单" @click="replace('order-detail', { id: o.no })" />
      </template>
      <template v-else-if="P.reason === 'nofund'">
        <van-action-bar-button type="primary" text="去充值" @click="go('wallet')" />
        <van-action-bar-button text="改用微信支付" @click="doPay('wechat')" />
      </template>
      <template v-else>
        <van-action-bar-button type="primary" :text="P.reason === 'channel' ? '重新支付' : '继续支付 ' + money(o.amount)" @click="doPay(methodOf(o))" />
        <van-action-bar-button text="改用其他方式" @click="showMethods = true" />
      </template>
    </van-action-bar>

    <van-action-sheet v-model:show="showMethods" :actions="methodActions" title="选择支付方式" cancel-text="取消" close-on-click-action @select="pickMethod" />
  </div>
</template>

<style scoped>
.hero { display: grid; justify-items: center; gap: 8px; padding: 24px 16px; text-align: center; background: var(--van-background-2); border: 1px solid var(--luz-line); border-radius: var(--luz-radius-card); }
.hero h2 { margin: 0; font-size: var(--t18); line-height: 26px; font-weight: 600; }
.hero-t, .hero-sub { margin: 0; color: var(--luz-ink-2); }
.hero-ic { display: grid; place-items: center; width: 72px; height: 72px; border-radius: 50%; }
.is-ok .hero-ic { background: var(--luz-success-tint); color: var(--luz-success); }
.is-info .hero-ic { background: var(--luz-action-tint); color: var(--luz-action-text); }
.is-warn .hero-ic { background: var(--luz-warning-tint); color: var(--luz-warning); }
.is-bad .hero-ic { background: var(--luz-danger-tint); color: var(--luz-danger); }
.hero-bar { width: 60%; }
.hero-keep { display: flex; align-items: center; gap: 4px; margin: 0; color: var(--luz-ink-2); }
.cd { color: var(--luz-ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.steps { padding: 4px 8px 12px; background: var(--van-background-2); }
.pick { display: flex; align-items: center; gap: 16px; padding: 16px; background: var(--van-background-2); color: var(--luz-ink); }
.pick.dead { opacity: .5; }
.qr { flex: none; width: 132px; height: 132px; }
.pick-info p { margin: 0; }
.strong { font-weight: 600; }
.code { display: block; font-size: var(--t22); line-height: 32px; font-weight: 600; letter-spacing: 2px; }
.thumbs { display: flex; align-items: center; gap: 8px; padding: 12px 16px 4px; background: var(--van-background-2); }
.more { color: var(--luz-ink-2); }
</style>
