<script>
export const meta = {
  id: 'order-detail', label: '订单详情', title: '订单详情', group: '订单', order: 2,
  layout: '主次布局',
  reason: '进来的人最想知道“我的订单现在怎么样了、怎么取”：首屏主角是状态头和取餐码，后面依次是进度、商品与金额拆分、门店、订单信息、操作记录；底部固定栏只放当前状态下最该做的一两件事',
  scenes: [
    { id: 'unpaid', label: '状态：待支付（倒计时）' }, { id: 'paid', label: '状态：制作中' }, { id: 'ready', label: '状态：待取餐（已出餐）' },
    { id: 'done', label: '状态：已完成，未评价' }, { id: 'done-reviewed', label: '状态：已完成，已评价' }, { id: 'cancelled', label: '状态：已取消' },
    { id: 'closed', label: '状态：已关闭（超时未支付）' }, { id: 'late', label: '状态：已关闭，迟到支付退回中' }, { id: 'refunding', label: '状态：退款中（部分退款）' },
    { id: 'refunded', label: '状态：已退款' }, { id: 'cancel-fail', label: '取消订单失败：网络异常' }, { id: 'cancel-paid', label: '取消订单失败：刚好被支付' },
  ],
}
</script>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { money } from '../../shared/format.js'
import { useNav } from '../nav.js'
import { kit } from './Orders.vue'

const { go, back, replace } = useNav()
const route = useRoute()
const router = useRouter()
const scene = useScene('order-detail')
const guest = computed(() => state.role === 'guest')

// ---- which order: ?id=, else the one the scene is about, else the most pressing one
const SCENE_ORDER = { unpaid: 'unpaid', 'cancel-fail': 'unpaid', 'cancel-paid': 'unpaid', paid: 'making', ready: 'ready', done: 'done', 'done-reviewed': 'done-reviewed', cancelled: 'cancelled', closed: 'closed', late: 'late', refunding: 'refunding', refunded: 'refunded' }
const o = ref(null)
const phase = ref('loading')                                            // loading | ok | error
async function load() {
  phase.value = 'loading'
  try {
    await request(450); kit.sweep()
    const id = route.query.id
    o.value = id ? kit.byNo(String(id)) : SCENE_ORDER[scene.value] ? kit.find(SCENE_ORDER[scene.value]) : kit.mine()[0]
    phase.value = 'ok'
  } catch { phase.value = 'error' }
}
let timer = 0
onMounted(() => { load(); timer = setInterval(kit.sweep, 1000) })
onBeforeUnmount(() => clearInterval(timer))
const status = computed(() => (guest.value ? 'forbidden' : phase.value !== 'ok' ? phase.value : !o.value || o.value.hidden ? 'empty' : 'ok'))
const kind = computed(() => (o.value ? kit.kind(o.value) : ''))
const t = computed(() => kit.times(o.value))
const sp = computed(() => kit.split(o.value))
const paid = computed(() => !!(o.value.paidAt || o.value.late))
const store = B.shop

// ---- the status block
const hero = computed(() => {
  const k = kind.value, x = o.value, act = kit.activeRefunds(x)[0], slot = x.slot && x.slot !== '尽快取餐' ? '，预约 ' + x.slot + ' 取餐' : ''
  return {
    unpaid: ['待支付', 'warn', ''],
    making: ['制作中', 'brand', '已支付成功，门店正在为你备餐' + slot],
    ready: ['待取餐', 'ok', '餐品已做好，请凭取餐码到店领取'],
    done: ['已完成', 'plain', '已取餐，感谢光临' + (x.reviewed ? '' : '，说说这顿的感受吧')],
    cancelled: ['已取消', 'plain', '你已取消订单（' + (x.cancelReason || '不想要了') + '）' + (x.couponRef ? '，优惠券已退回' : '')],
    closed: ['已关闭', 'plain', x.late ? '订单超时关闭后收到了你的支付，' + money(x.late.amount) + ' 将原路退回' : '超时未支付，订单已自动关闭' + (x.couponRef ? '，优惠券已退回' : '')],
    refunding: ['退款中', 'warn', act ? '退款' + kit.STAGE[kit.stageOf(act)][0] + '：' + money(act.amount) : '退款处理中'],
    refunded: ['已退款', 'plain', '款项已原路退回，订单已关闭'],
  }[k]
})
const left = computed(() => Math.max(0, (o.value.deadlineAt || 0) - Date.now()))
const pickLive = computed(() => ['making', 'ready', 'done'].includes(kind.value))
const T = computed(() => kit.timeline(o.value))
const stepActive = computed(() => { const i = T.value.findIndex((s) => s.state === 'now'); return i >= 0 ? i : T.value.length - 1 })
const refunds = computed(() => kit.refundsOf(o.value))
const ended = computed(() => ['done', 'cancelled', 'closed', 'refunded'].includes(kind.value))
const payNote = computed(() => '优惠后实付 ' + money(o.value.amount) + '，由' + [sp.value.balance && '储值余额 ' + money(sp.value.balance), sp.value.wechat && '微信支付 ' + money(sp.value.wechat), sp.value.card && '会员卡抵扣 ' + money(sp.value.card)].filter(Boolean).join(' + ') + '付清')
const logs = computed(() => (o.value.log || []).slice().reverse())
const logAll = ref(false)
const logShown = computed(() => (logAll.value ? logs.value : logs.value.slice(0, 4)))

// ---- one confirm dialog for the page
const cf = reactive({ show: false, title: '', message: '', ok: '确定', cancel: '取消', danger: false, resolve: null })
function ask({ title, message, ok = '确定', cancel = '取消', danger = false }) { Object.assign(cf, { show: true, title, message, ok, cancel, danger }); return new Promise((r) => { cf.resolve = r }) }
function answer(v) { if (cf.resolve) { cf.resolve(v); cf.resolve = null } }

async function remove() {
  const x = o.value
  const yes = await ask({ title: '删除这条订单记录', message: '删除订单 ' + x.no.slice(-6) + '（' + money(x.amount) + '）。删除后列表里不再显示，不影响已有的退款和发票。', ok: '删除', danger: true })
  if (yes) { x.hidden = true; kit.toast('订单已删除', 'success'); back() }
}
async function again() {
  const r = kit.reorder(o.value)
  if (!r.added.length) { const yes = await ask({ title: '这单的商品现在都买不了', message: r.skipped.map((x) => '「' + x.name + '」' + x.why).join('\n'), ok: '去点单', cancel: '知道了' }); if (yes) go('menu'); return }
  if (!r.skipped.length) { kit.toast('已把 ' + r.added.length + ' 种商品加入购物车', 'success'); go('cart'); return }
  const yes = await ask({ title: '已加入 ' + r.added.length + ' 种商品', message: '另有商品没能加入：\n' + r.skipped.map((x) => '「' + x.name + '」' + x.why).join('\n'), ok: '去购物车', cancel: '继续逛' })
  if (yes) go('cart')
}

// ---- store: call, navigate, contact
const contact = reactive({ show: false })
const contactActions = [{ name: '拨打门店电话', subname: store.phone, key: 'call' }, { name: '复制电话号码', key: 'copy' }, { name: '在线反馈或投诉', key: 'feedback' }]
const call = () => ask({ title: '拨打电话', message: store.name + '\n' + store.phone, ok: '拨打' }).then((yes) => yes && kit.toast('正在呼叫（模拟）'))
function onContact(a) { contact.show = false; if (a.key === 'call') call(); else if (a.key === 'copy') kit.copy(store.phone, '电话已复制'); else go('feedback') }
const nav = reactive({ show: false })
const maps = ['腾讯地图', '高德地图', '苹果地图'].map((name) => ({ name }))
const onNav = (a) => { nav.show = false; kit.toast('已打开' + a.name + '（模拟）') }

// ---- cancel
const cx = reactive({ show: false, paid: false, reason: '', other: '', err: '', busy: false })
async function askCancel() {
  kit.sweep()
  const x = o.value
  if (!['UNPAID', 'PAID'].includes(x.status)) {
    const can = kit.canRefund(x)
    const yes = await ask({ title: '现在不能取消', message: x.status === 'FULFILLED' ? '餐品已经做好，不能再取消订单。如果餐品有问题，可以申请退款。' : '订单已经不能取消。如果餐品有问题，可以在 7 天内申请退款。', ok: can ? '申请退款' : '知道了', cancel: can ? '知道了' : '' })
    if (yes && can) go('refund-apply', { id: x.no })
    return
  }
  Object.assign(cx, { show: true, paid: x.status === 'PAID', reason: '', other: '', err: '', busy: false })
}
async function doCancel() {
  if (!cx.reason) { cx.err = '请先选一个取消原因'; return }
  if (cx.reason === '其他' && cx.other.trim().length < 2) { cx.err = '选了“其他”，请写下具体原因（至少 2 个字）'; return }
  cx.busy = true; cx.err = ''
  try { const r = await kit.cancelOrder(o.value, { reason: cx.reason, other: cx.other, wasPaid: cx.paid, scene: scene.value }); cx.show = false; kit.toast(r.message, r.ok ? 'success' : 'fail') } catch (e) { cx.err = e.message } finally { cx.busy = false }
}
const refundNote = computed(() => '门店还没出餐，取消后将全额退款 ' + money(o.value.amount) + '：' + kit.channelText(kit.channelOf(o.value, o.value.amount)) + '。' + (o.value.couponRef ? '用掉的优惠券会退回（未过期的）。' : ''))

// ---- pay
const pay = reactive({ show: false, method: 'wechat', busy: false, err: '' })
const payOpts = computed(() => {
  const bal = state.db.me.balance, a = o.value.amount
  return [
    ['wechat', '微信支付', '推荐，支付 ' + money(a), true],
    ['balance', '储值余额', bal >= a ? '余额 ' + money(bal) + '，支付后剩 ' + money(bal - a) : '余额 ' + money(bal) + '，还差 ' + money(a - bal), bal >= a],
    ['mix', '储值余额 + 微信支付', bal > 0 && bal < a ? '余额抵扣 ' + money(bal) + '，再微信支付 ' + money(a - bal) : bal >= a ? '余额足够，不需要组合' : '没有可用余额', bal > 0 && bal < a],
  ]
})
function askPay() { kit.sweep(); if (o.value.status === 'CANCELLED') { kit.toast('订单已超时关闭，请重新下单', 'fail'); return } Object.assign(pay, { show: true, method: 'wechat', busy: false, err: '' }) }
async function doPay() {
  const x = o.value; pay.busy = true; pay.err = ''
  try {
    kit.sweep()
    if (x.status === 'CANCELLED') throw new Error('订单已超时关闭，请重新下单')
    try { await request(500) } catch (e) { throw new Error(e.message + '，订单没有支付，没有扣款，请稍后再试。订单为你保留中') }
    const r = kit.payWith(x, pay.method)
    if (!r.ok) throw new Error(r.reason === 'nofund' ? '储值余额不足，请改用微信支付或先去充值' : '支付没有成功，请重新支付')
    pay.show = false
    if (router.hasRoute('pay-result')) replace('pay-result', { no: x.no }); else kit.toast('支付成功，门店正在备餐', 'success')
  } catch (e) { pay.err = e.message } finally { pay.busy = false }
}
const toRefund = () => go('refund-apply', { id: o.value.no })
const progressOf = () => go('refund-apply', { id: o.value.no, rid: kit.activeRefunds(o.value)[0]?.id })
</script>

<template>
  <div class="mp-page">
    <MiniState :status="status" :rows="6" empty-text="没有找到这笔订单，订单可能已被删除，或不是你的订单" error-hint="订单没有加载出来，请检查网络后重试" @retry="load">
      <template #empty-action><van-button round @click="back()">回到订单</van-button></template>
      <template #forbidden-action><van-button round type="primary" @click="go('login')">去登录</van-button></template>
      <template v-if="o">
        <section class="hero" :class="'hero--' + hero[1]" aria-label="订单状态">
          <div class="hero-top"><h2>{{ hero[0] }}</h2><span class="muted">{{ kit.when(t.created) }} 下单</span></div>
          <p v-if="kind === 'unpaid'">请在 <van-count-down :time="left" format="mm:ss" class="cd num" @finish="kit.sweep" /> 内完成支付，超时订单将自动关闭</p>
          <p v-else>{{ hero[2] }}</p>
        </section>

        <van-cell-group v-if="pickLive" inset title="取餐码">
          <van-cell center :title="store.name" :label="kind === 'done' ? '已于 ' + kit.when(t.done) + ' 核销取餐' : '展示时请向店员出示'">
            <template #value><b class="code num" :class="{ dead: kind === 'done' }">{{ kit.code(o) }}</b></template>
          </van-cell>
          <van-cell v-if="o.pickup" title="取餐号"><template #value><b class="num">{{ o.pickup }}</b><van-tag v-if="kind === 'done'" plain class="gap" color="var(--luz-ink-2)">已取餐</van-tag></template></van-cell>
        </van-cell-group>

        <van-cell-group inset title="订单进度">
          <div class="steps">
            <van-steps direction="vertical" :active="stepActive" >
              <van-step v-for="s in T" :key="s.label">
                <template #active-icon><van-icon :name="s.state === 'bad' ? 'cross' : s.state === 'now' ? 'clock-o' : 'checked'" :class="{ bad: s.state === 'bad' }" /></template>
                <template v-if="s.state === 'bad'" #finish-icon><van-icon name="cross" class="bad" /></template>
                <span class="step-t">{{ s.label }}</span>
                <p class="muted num">{{ s.at ? kit.when(s.at) : s.state === 'now' ? '进行中' : '' }}</p>
              </van-step>
            </van-steps>
          </div>
        </van-cell-group>

        <van-cell-group inset :title="'商品明细 · 共 ' + kit.count(o) + ' 件'">
          <van-card v-for="(i, n) in o.items" :key="n" :num="i.qty" :price="(i.price / 100).toFixed(2)" :title="i.name" :desc="i.spec || '默认规格'" :thumb="i.img" />
          <van-cell title="商品小计" :value="money(sp.subtotal)" />
          <van-cell v-if="sp.act" :title="'活动优惠' + (o.actName ? '（' + o.actName + '）' : '')" :value="'-' + money(sp.act)" />
          <van-cell v-if="sp.coupon" :title="'优惠券' + (o.coupon ? '（' + o.coupon + '）' : '')" :value="'-' + money(sp.coupon)" />
          <template v-if="paid">
            <van-cell v-if="sp.balance" title="储值余额" :value="money(sp.balance)" />
            <van-cell v-if="sp.wechat" title="微信支付" :value="money(sp.wechat)" />
            <van-cell v-if="sp.card" title="会员卡抵扣" :value="money(sp.card)" />
          </template>
          <van-cell center :title="paid ? '实付' : '应付'" :label="paid ? payNote : undefined"><template #value><MiniPrice :cents="o.amount" :size="18" /></template></van-cell>
        </van-cell-group>

        <van-cell-group v-if="refunds.length" inset :title="'售后记录 · ' + refunds.length + ' 条'">
          <van-cell v-for="r in refunds" :key="r.id" is-link center :title="'退款 ' + money(r.amount)" :label="r.reason + ' · ' + kit.when(r.appliedAt)" @click="go('refund-apply', { id: o.no, rid: r.id })">
            <template #value><van-tag :type="kit.STAGE[kit.stageOf(r)][1]" plain :color="kit.tagColor(kit.STAGE[kit.stageOf(r)][1])">{{ kit.STAGE[kit.stageOf(r)][0] }}</van-tag></template>
          </van-cell>
        </van-cell-group>

        <van-cell-group v-if="o.reviewed && o.review" inset title="我的评价">
          <van-cell is-link center @click="go('review', { id: o.no })">
            <template #title><van-rate :model-value="o.review.rating" readonly size="16" /></template>
            <template #label>{{ o.review.text || '（没有文字评价）' }}</template>
          </van-cell>
        </van-cell-group>

        <van-cell-group inset title="取餐门店">
          <van-cell center :title="store.name" :label="store.addr + ' · 营业时间 ' + store.hours + ' · ' + store.phone">
            <template #right-icon><div class="round-acts"><van-button icon="phone-o" round plain aria-label="拨打电话" @click="call" /><van-button icon="guide-o" round plain aria-label="导航到门店" @click="nav.show = true" /></div></template>
          </van-cell>
        </van-cell-group>

        <van-cell-group inset title="订单信息">
          <van-cell title="订单号" clickable @click="kit.copy(o.no, '订单号已复制')"><template #value><span class="num">{{ o.no }}</span></template><template #right-icon><van-icon name="records-o" class="copy" /></template></van-cell>
          <van-cell title="下单时间" :value="t.created.slice(5)" />
          <van-cell v-if="t.paid" title="支付时间" :value="t.paid.slice(5)" />
          <van-cell title="支付方式" :value="kit.payText(o)" />
          <van-cell title="取餐方式" :value="o.pickType === 'dine' ? '堂食' : '到店自取'" />
          <van-cell title="取餐时间" :value="o.slot || '尽快取餐'" />
          <van-cell v-if="o.pickup && paid" title="取餐号" :value="o.pickup" />
          <van-cell title="备注" :value="o.remark || '无'" />
          <van-cell v-if="ended" title="删除这条订单记录" class="danger" clickable @click="remove" />
        </van-cell-group>

        <van-cell-group v-if="logs.length" inset :title="'操作记录 · ' + logs.length + ' 条'">
          <van-cell v-for="(x, n) in logShown" :key="n" :title="x.who + ' ' + x.text" :value="x.at.slice(5)" />
          <van-cell v-if="logs.length > 4" is-link :title="logAll ? '收起' : '展开全部 ' + logs.length + ' 条'" @click="logAll = !logAll" />
        </van-cell-group>
      </template>
    </MiniState>

    <!-- the bar: the one or two things worth doing in this state -->
    <template v-if="status === 'ok' && o">
      <van-submit-bar v-if="kind === 'unpaid'" :price="o.amount" label="应付" button-text="去支付" button-type="primary" placeholder @submit="askPay">
        <van-button plain round @click="askCancel">取消订单</van-button>
      </van-submit-bar>
      <van-action-bar v-else placeholder>
        <van-action-bar-icon icon="phone-o" text="联系门店" @click="contact.show = true" />
        <template v-if="kind === 'making'"><van-action-bar-button type="warning" text="取消订单" @click="askCancel" /></template>
        <template v-else-if="kind === 'ready'"><van-action-bar-button v-if="kit.canRefund(o)" type="warning" text="申请退款" @click="toRefund" /></template>
        <template v-else-if="kind === 'done'">
          <van-action-bar-button v-if="kit.canRefund(o)" type="warning" text="申请退款" @click="toRefund" />
          <van-action-bar-button v-if="!o.reviewed" type="warning" text="再来一单" @click="again" />
          <van-action-bar-button type="primary" :text="o.reviewed ? '再来一单' : '去评价'" @click="o.reviewed ? again() : go('review', { id: o.no })" />
        </template>
        <template v-else-if="kind === 'refunding'"><van-action-bar-button type="primary" text="查看退款进度" @click="progressOf" /></template>
        <template v-else><van-action-bar-button type="primary" text="再来一单" @click="again" /></template>
      </van-action-bar>
    </template>

    <!-- cancel -->
    <van-action-sheet v-model:show="cx.show" :title="cx.paid ? '取消订单并退款' : '取消订单'" round>
      <div v-if="o" class="sheet">
        <van-notice-bar v-if="cx.paid" left-icon="info-o" wrapable :scrollable="false" :text="refundNote" />
        <p v-else class="muted">取消后订单关闭{{ o.couponRef ? '，用掉的优惠券会退回' : '' }}，购物车里的商品不会恢复，可以用“再来一单”重新加入。</p>
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
      <div v-if="o" class="sheet">
        <van-radio-group v-model="pay.method">
          <van-cell-group inset>
            <van-cell v-for="[k, tx, d, ok] in payOpts" :key="k" :title="tx" :label="d" clickable center @click="ok && (pay.method = k)"><template #right-icon><van-radio :name="k" :disabled="!ok" /></template></van-cell>
          </van-cell-group>
        </van-radio-group>
        <van-cell-group v-if="state.db.me.balance < o.amount" inset><van-cell title="储值余额不够" value="去充值" is-link @click="pay.show = false; go('wallet')" /></van-cell-group>
        <van-notice-bar v-if="pay.err" class="err" left-icon="warning-o" wrapable :scrollable="false" :text="pay.err" />
        <div class="sheet-acts"><van-button block round type="primary" :loading="pay.busy" loading-text="支付中" @click="doPay">确认支付 {{ money(o.amount) }}</van-button></div>
      </div>
    </van-action-sheet>

    <van-action-sheet v-model:show="contact.show" :actions="contactActions" title="联系门店" :description="'营业时间 ' + store.hours" cancel-text="取消" close-on-click-action round @select="onContact" />
    <van-action-sheet v-model:show="nav.show" :actions="maps" :title="'导航到 ' + store.name" :description="store.addr" cancel-text="取消" close-on-click-action round @select="onNav" />
    <van-dialog v-model:show="cf.show" :title="cf.title" :message="cf.message" message-align="left" :show-cancel-button="!!cf.cancel" :cancel-button-text="cf.cancel" :confirm-button-text="cf.ok"
      :confirm-button-color="cf.danger ? 'var(--luz-danger)' : undefined" @confirm="answer(true)" @cancel="answer(false)" @closed="answer(false)" />
  </div>
</template>

<style scoped>
b { font-weight: 600; }
.mp-page { --van-rate-icon-full-color: var(--luz-warning); --van-card-background: var(--van-background-2); --van-card-thumb-size: 64px; --van-action-bar-button-warning-color: var(--luz-action-tint); --van-button-warning-color: var(--luz-action-text); --van-submit-bar-price-color: var(--luz-price); }
.hero { display: grid; gap: 6px; padding: 16px; border-radius: var(--luz-radius-card); background: var(--luz-surface); }
.hero--warn { background: var(--luz-warning-tint); }
.hero--brand { background: var(--luz-action-tint); }
.hero--ok { background: var(--luz-success-tint); }
.hero h2 { margin: 0; font-size: var(--t18); line-height: 26px; font-weight: 600; }
.hero p { margin: 0; }
.hero-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.cd { display: inline; font-size: inherit; line-height: inherit; font-weight: 600; color: var(--luz-ink); }
.code { font-size: var(--t22); line-height: 30px; font-weight: 700; letter-spacing: 2px; color: var(--luz-ink); }
.code.dead { color: var(--luz-ink-3); text-decoration: line-through; }
.gap { margin-left: 8px; }
.steps { padding: 4px 16px 8px; background: var(--van-background-2); }
.step-t { font-weight: 600; }
.bad { color: var(--luz-danger); }
.steps p { margin: 0; }
.danger { --van-cell-text-color: var(--luz-danger); }
.copy { margin-left: 8px; color: var(--luz-ink-2); align-self: center; }
.round-acts { display: flex; gap: 8px; margin-left: 12px; }
.err { --van-notice-bar-background: var(--luz-danger-tint); --van-notice-bar-text-color: var(--luz-ink); }
.sheet { display: grid; gap: 12px; padding: 0 12px 16px; }
.sheet-acts { display: flex; gap: 8px; }
</style>
