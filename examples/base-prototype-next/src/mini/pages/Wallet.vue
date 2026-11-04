<script>
// 储值（主次布局）：余额是主角（本金与赠送金分开写）→ 充值方案与限额 → 收支明细（分段、按月筛选）；充值按钮固定在底部。
export const meta = {
  id: 'wallet', label: '储值', title: '储值', group: '会员与资产', order: 4,
  layout: '主次布局',
  reason: '储值页的主角是“我还有多少钱、能充多少”：余额放大成展示字号并拆开本金与赠送金；充值方案紧随其后、底部固定一个充值按钮；明细退到下面，可按类型和月份筛',
  scenes: [
    { id: 'first-topup', label: '首次储值：须主动勾选预付卡条款' }, { id: 'topup-limit', label: '余额上限：多数档位超过限额' }, { id: 'prepaid-stopped', label: '暂停收取预付款：不能充值' },
    { id: 'paused', label: '营业状态：暂停营业（不能充值）' }, { id: 'pay-cancel', label: '支付：用户取消' }, { id: 'pay-fail', label: '支付：银行卡余额不足' }, { id: 'pay-timeout', label: '支付：确认超时' },
    { id: 'refund-review', label: '余额退款进度：审核中' }, { id: 'refund-doing', label: '余额退款进度：退款中' }, { id: 'refund-done', label: '余额退款进度：已到账' }, { id: 'refund-rejected', label: '余额退款进度：被驳回，释放冻结' },
  ],
}
</script>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { B } from '../../shared/data.js'
import { state, useScene, setScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { money } from '../../shared/format.js'
import { useNav } from '../nav.js'
import { PREPAID, featureOn, today, addD, diff, prepaidHeld, giftOf, walletLog, say, payWx } from './CardDetail.vue'

const { go } = useNav()
const scene = useScene('wallet')
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)
const guest = computed(() => state.role === 'guest')
const me = computed(() => state.db.me)
const money0 = (c) => '¥' + (c / 100).toLocaleString('zh-CN')
const scrollTop = () => document.getElementById('screen')?.scrollTo({ top: 0 })

/* ---------- 余额：总额 me.balance 里含赠送金 me.giftBalance；退款冻结的金额单独记在 me.frozen ---------- */
const bal = computed(() => me.value.balance)
const gift = computed(() => giftOf())
const principal = computed(() => bal.value - gift.value)
const myLogs = computed(() => state.db.walletLogs.filter((l) => l.userId === me.value.id))

/* ---------- 营业状态与预付限额 ---------- */
const stopped = computed(() => scene.value === 'prepaid-stopped' || !featureOn('feature.wallet'))
const paused = computed(() => scene.value === 'paused' || state.shopStatus === 'paused')
const cap = computed(() => (scene.value === 'topup-limit' ? prepaidHeld() + 6000 : PREPAID.totalCap))
const room = computed(() => Math.max(0, cap.value - prepaidHeld()))
const consentAt = computed(() => me.value.prepaidConsentAt || (myLogs.value.filter((l) => l.kind === '充值').map((l) => l.at).sort()[0] || ''))
const needConsent = computed(() => scene.value === 'first-topup' || !consentAt.value)

/* ---------- 余额退款：试算与进度（真实的存在 me.walletRefund，场景里是演出来的） ---------- */
const quote = computed(() => {
  const g = gift.value, p = bal.value - g, t = today()
  const last = myLogs.value.filter((l) => l.kind === '充值').sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  const spent = last ? myLogs.value.some((l) => l.kind === '消费' && l.at > last.at) : true
  const free = !!last && diff(last.at.slice(0, 10), t) <= 7 && !spent
  const fee = free ? 0 : Math.round((p * 5) / 100)
  return { principal: p, gift: g, fee, free, amount: Math.max(0, p - fee) }
})
const STEPS = ['已提交', '审核中', '退款中', '已到账']
const rf = computed(() => {
  const sc = scene.value
  if (/^refund-/.test(sc || '')) {
    const q = quote.value
    return { principal: q.principal, gift: q.gift, amount: q.amount, at: addD(today(), -1) + ' 14:05', step: { 'refund-review': 1, 'refund-doing': 2, 'refund-done': 3, 'refund-rejected': 1 }[sc], status: sc === 'refund-rejected' ? 'REJECTED' : 'OK', reason: sc === 'refund-rejected' ? '储值余额在审核期间发生了消费，请重新申请' : '', virtual: true }
  }
  const r = me.value.walletRefund
  return r && r.status !== 'REJECTED' && r.step < 3 ? r : null
})
const busyRefund = computed(() => !!rf.value && rf.value.status !== 'REJECTED' && rf.value.step < 3)
const frozen = computed(() => (busyRefund.value ? (rf.value.virtual ? rf.value.principal + rf.value.gift : me.value.frozen || 0) : 0))
const rfNote = computed(() => (rf.value.status === 'REJECTED' ? '申请被驳回：' + rf.value.reason + '。冻结的金额已释放，余额恢复可用。' : rf.value.step >= 3 ? '退款已原路退回，请查看支付渠道的到账通知。' : '申请时对应金额已冻结，期间不能消费；审核通过后原路退回，赠送金作废。'))

/* ---------- 充值方案 ---------- */
const plans = computed(() => state.db.walletPlans.filter((p) => p.status !== 'OFF').slice().sort((a, b) => (a.sort ?? a.id) - (b.sort ?? b.id)))
const best = computed(() => plans.value.reduce((m, p) => (p.gift / p.amount > (m ? m.gift / m.amount : 0) ? p : m), null))
const S = reactive({ plan: 0, custom: '', agree: false, pending: null, err: '', errKind: 'bad', busy: false, seg: 'all', month: '', shown: 10 })
const planId = computed(() => S.plan || (plans.value.find((p) => p.id === 3) || plans.value[0] || {}).id)
const sel = computed(() => (planId.value === 'custom' ? { amount: Math.round((parseFloat(S.custom) || 0) * 100), gift: 0, custom: true } : { ...(plans.value.find((p) => p.id === planId.value) || { amount: 0, gift: 0 }), custom: false }))
const check = computed(() => {
  const s = sel.value
  if (stopped.value) return featureOn('feature.wallet') ? '门店已暂停收取预付款，暂时不能充值' : '储值功能已关闭，暂时不能充值；已有余额仍可消费'
  if (paused.value) return '门店暂停营业，暂时不能充值'
  if (s.custom && !S.custom.trim()) return '请输入充值金额'
  if (s.custom && !/^\d+(\.\d{1,2})?$/.test(S.custom.trim())) return '金额只能是数字，最多保留两位小数'
  if (s.custom && s.amount < PREPAID.minTopup) return '最低充值 ' + money0(PREPAID.minTopup)
  if (s.custom && s.amount > PREPAID.maxTopup) return '单笔最多充值 ' + money0(PREPAID.maxTopup)
  if (s.amount + s.gift > room.value) return '充值后会超过余额上限 ' + money0(cap.value) + '，目前最多还能充 ' + money(room.value)
  return ''
})
const blocked = computed(() => !(S.pending && !stopped.value) && (!!check.value || (needConsent.value && !S.agree)))
const payCents = computed(() => (S.pending ? S.pending.amount : sel.value.amount))
const btnText = computed(() => (stopped.value ? '暂停收取预付款' : S.pending ? '继续支付' : '立即充值'))
const notice = computed(() => (S.err ? { text: S.err, kind: S.errKind } : check.value && planId.value !== 'custom' ? { text: check.value, kind: 'warn' } : null))
const pick = (id) => { S.plan = id; S.pending = null; S.err = '' }
const plansEl = ref(null)

async function charge() {
  S.err = ''
  const s = S.pending || sel.value, e = S.pending ? '' : check.value
  if (e) { S.err = e; S.errKind = 'bad'; return }
  if (needConsent.value && !S.agree) { S.err = '请先勾选预付卡与储值条款'; S.errKind = 'warn'; return }
  S.pending = { amount: s.amount, gift: s.gift }
  S.busy = true
  const res = await payWx(scene.value, { amount: s.amount, subject: '储值充值' + (s.gift ? '，赠送 ' + money(s.gift) : '') })
  if (!res.ok) { S.err = '支付没有完成：' + res.reason + '。充值单已保留，可以继续支付。'; S.errKind = res.kind === 'cancel' ? 'warn' : 'bad'; S.busy = false; return }
  try { await request(500) } catch (x) { S.err = '充值结果确认失败：' + x.message + '。如已扣款会自动退回。'; S.errKind = 'bad'; S.busy = false; return }
  const no = String(900000 + state.db.walletLogs.length * 19 + 7)
  if (s.gift) walletLog('赠送', 0, s.gift, '充值赠送 ' + no)
  walletLog('充值', s.amount, 0, '充值单 ' + no)
  me.value.prepaidConsentAt = B.fmt(B.NOW())
  S.pending = null; S.busy = false; S.agree = false; S.seg = 'all'; S.month = ''; S.shown = 10
  say('充值成功，到账 ' + money(s.amount + s.gift), 'success'); scrollTop()
}

/* ---------- 收支明细：分段、按月、分批 ---------- */
const TITLE = { 充值: '储值充值', 赠送: '充值赠送', 消费: '消费', 退款: '订单退回', 调整: '余额调整' }
const ICON = { 充值: 'balance-o', 赠送: 'gift-o', 消费: 'bag-o', 退款: 'revoke', 调整: 'edit' }
const kindOf = (l) => (l.kind === '赠送' ? '充值' : l.kind)
const SEGS = [['all', '全部'], ['充值', '充值'], ['消费', '消费'], ['退款', '退款']]
const months = computed(() => Array.from(new Set(myLogs.value.map((l) => l.at.slice(0, 7)))).sort().reverse())
const monthLabel = (m) => (m ? m.replace('-', ' 年 ') + ' 月' : '全部月份')
const monthSheet = ref(false)
const monthActions = computed(() => [{ name: '全部月份', value: '' }, ...months.value.map((m) => ({ name: monthLabel(m), value: m }))])
const rows = computed(() => myLogs.value.filter((l) => (S.seg === 'all' || kindOf(l) === S.seg) && (!S.month || l.at.startsWith(S.month))).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)))
const groups = computed(() => {
  const out = []
  rows.value.slice(0, S.shown).forEach((l) => {
    const m = l.at.slice(0, 7)
    let g = out[out.length - 1]
    if (!g || g.m !== m) {
      const inMonth = rows.value.filter((x) => x.at.startsWith(m))
      g = { m, name: Number(m.slice(5)) + ' 月' + (m.slice(0, 4) !== today().slice(0, 4) ? '（' + m.slice(0, 4) + '）' : ''), inc: inMonth.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0), out: inMonth.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0), list: [] }
      out.push(g)
    }
    g.list.push(l)
  })
  return out
})
const onSeg = () => { S.shown = 10 }
const onMonth = (a) => { S.month = a.value; S.shown = 10; monthSheet.value = false }

/* ---------- 申请退还余额 ---------- */
const refundOpen = ref(false)
const refundErr = ref('')
const refundBusy = ref(false)
function openRefund() {
  if (busyRefund.value) return say('已有一笔退款在处理中')
  refundErr.value = ''; refundOpen.value = true
}
async function submitRefund() {
  const q = quote.value
  refundErr.value = ''
  try { await showConfirmDialog({ title: '提交退款申请', message: '确认退还余额？预计退回 ' + money(q.amount) + '，赠送金 ' + money(q.gift) + ' 作废。提交后余额立即冻结，审核通过后不能撤回。', confirmButtonText: '提交申请', confirmButtonColor: 'var(--luz-danger)', teleport: '#phone-overlay' }) } catch { return }
  refundBusy.value = true
  try { await request(800) } catch (x) { refundErr.value = x.message + '，申请没有提交，请稍后再试'; refundBusy.value = false; return }
  me.value.walletRefund = { principal: q.principal, gift: q.gift, fee: q.fee, amount: q.amount, at: B.fmt(B.NOW()), step: 1, status: 'OK', reason: '' }
  me.value.frozen = q.principal + q.gift
  walletLog('调整', -q.principal, -q.gift, '余额退款申请，冻结 ' + money(q.principal + q.gift))
  refundBusy.value = false; refundOpen.value = false
  if (scene.value) setScene('wallet', null)
  say('退款申请已提交', 'success'); scrollTop()
}
</script>

<template>
  <div class="mp-page">
    <MiniState v-if="guest" status="forbidden">
      <template #forbidden-action><van-button round type="primary" @click="go('login')">去登录</van-button></template>
    </MiniState>
    <MiniState v-else :status="phase" @retry="load">
      <!-- 主角：余额，本金与赠送金分开写 -->
      <section class="brand-card" aria-label="储值余额">
        <div class="brand-top"><span>储值余额</span></div>
        <div class="brand-amount num">{{ money(bal) }}</div>
        <div class="brand-sub"><span>本金 {{ money(principal) }}</span><span>赠送金 {{ money(gift) }}</span><span v-if="frozen">退款冻结中 {{ money(frozen) }}</span></div>
        <p class="brand-note">本金永不过期；余额不能提现、转让或转赠</p>
      </section>

      <!-- 余额退款进度 -->
      <van-cell-group v-if="rf" inset title="余额退款进度">
        <van-cell title="预计退回" :value="money(rf.amount)" value-class="num" />
        <div class="steps">
          <van-steps :active="rf.step" :active-color="rf.status === 'REJECTED' ? 'var(--luz-danger)' : undefined">
            <van-step v-for="(s, i) in STEPS" :key="s">{{ rf.status === 'REJECTED' && i === 1 ? '已驳回' : s }}</van-step>
          </van-steps>
        </div>
        <van-cell :title="rfNote" :label="'提交时间 ' + rf.at" :class="{ bad: rf.status === 'REJECTED' }" />
      </van-cell-group>

      <!-- 充值方案与限额 -->
      <div ref="plansEl" class="stack-plans">
        <van-cell-group inset title="充值（赠送金与本金同样可以抵扣订单）">
          <van-radio-group :model-value="planId" :disabled="stopped" @update:model-value="pick">
            <van-cell v-for="p in plans" :key="p.id" clickable center :class="{ off: stopped || p.amount + p.gift > room }" :aria-label="'充 ' + money0(p.amount) + (p.gift ? '，送 ' + money0(p.gift) : '')" @click="!stopped && p.amount + p.gift <= room && pick(p.id)">
              <template #title><span class="plan-amt">充 {{ money0(p.amount) }}</span><van-tag v-if="best && best.id === p.id" type="danger" round plain class="plan-tag">最划算</van-tag></template>
              <template #label>{{ p.amount + p.gift > room ? '超过余额上限' : p.gift ? '送 ' + money0(p.gift) : '不赠送' }}</template>
              <template #right-icon><van-radio :name="p.id" :disabled="stopped || p.amount + p.gift > room" /></template>
            </van-cell>
            <van-cell clickable center label="不享受赠送" :class="{ off: stopped }" @click="!stopped && pick('custom')">
              <template #title><span class="plan-amt">自定义金额</span></template>
              <template #right-icon><van-radio name="custom" :disabled="stopped" /></template>
            </van-cell>
          </van-radio-group>
          <van-field v-if="planId === 'custom'" v-model="S.custom" class="big-field" type="number" label="金额（元）" :placeholder="'输入 ' + money0(PREPAID.minTopup) + ' 到 ' + money0(PREPAID.maxTopup) + ' 之间的金额'" input-align="right" :error-message="check" @update:model-value="S.pending = null; S.err = ''" />
          <van-cell title="到账" :value="money(payCents + (S.pending ? S.pending.gift : sel.gift))" value-class="num" :label="(S.pending ? S.pending.gift : sel.gift) ? '本金 ' + money(payCents) + ' + 赠送 ' + money(S.pending ? S.pending.gift : sel.gift) : '本金，不赠送'" />
          <van-cell :label="'会员卡与储值合计上限 ' + money0(cap) + '，你目前约 ' + money(prepaidHeld()) + '，最多还能充 ' + money(room)" title="余额上限" />
          <van-cell v-if="needConsent" center label="首次储值需要主动勾选；余额不能提现，七日内未使用可全额退">
            <template #title><van-checkbox v-model="S.agree" shape="square">我已阅读并同意《预付卡与储值条款》</van-checkbox></template>
          </van-cell>
          <van-cell v-else :title="'已同意预付卡与储值条款（' + consentAt.slice(0, 10) + '）'" />
        </van-cell-group>
      </div>
      <van-notice-bar v-if="notice" :class="notice.kind === 'bad' ? 'alert-bad' : 'alert-warn'" left-icon="warning-o" wrapable :scrollable="false" :text="notice.text" />

      <!-- 收支明细 -->
      <van-cell-group inset title="收支明细">
        <van-cell title="月份" is-link :value="monthLabel(S.month)" @click="monthSheet = true" />
        <van-tabs v-model:active="S.seg" @change="onSeg">
          <van-tab v-for="[id, label] in SEGS" :key="id" :name="id" :title="label" />
        </van-tabs>
      </van-cell-group>
      <MiniState v-if="!rows.length" status="empty" :empty-text="S.seg === 'all' && !S.month ? '还没有储值记录，充值、消费和退款都会记在这里' : '这个范围内没有记录'">
        <template #empty-action>
          <van-button v-if="S.seg === 'all' && !S.month" round type="primary" @click="plansEl && plansEl.scrollIntoView({ block: 'start' })">去充值</van-button>
          <van-button v-else round type="primary" @click="S.seg = 'all'; S.month = ''">看全部</van-button>
        </template>
      </MiniState>
      <van-cell-group v-for="g in groups" :key="g.m" inset>
        <template #title><div class="mhead"><b>{{ g.name }}</b><span>收入 {{ money(g.inc) }} · 支出 {{ money(g.out) }}</span></div></template>
        <van-cell v-for="l in g.list" :key="l.id" center :title="TITLE[l.kind] || l.kind" :label="l.ref + ' · ' + l.at.slice(0, 16)">
          <template #icon><van-icon :name="ICON[l.kind] || 'balance-o'" class="log-ic" :class="l.amount > 0 ? 'in' : 'out'" /></template>
          <template #value><b class="num amt" :class="{ plus: l.amount > 0 }">{{ l.amount > 0 ? '+' : '−' }}{{ money(Math.abs(l.amount)) }}</b></template>
        </van-cell>
      </van-cell-group>
      <van-cell-group v-if="rows.length > S.shown" inset><van-cell is-link :title="'加载更多（还有 ' + (rows.length - S.shown) + ' 条）'" @click="S.shown += 10" /></van-cell-group>
      <p v-else-if="rows.length > 10" class="end muted">没有更多了</p>

      <van-cell-group inset>
        <van-cell icon="revoke" :is-link="!busyRefund && bal > 0" clickable :class="{ off: busyRefund || bal <= 0 }" :aria-disabled="busyRefund || bal <= 0 ? 'true' : null" :title="busyRefund ? '退款处理中，暂不能再次申请' : bal <= 0 ? '没有可退的余额' : '申请退还余额'" label="赠送金不退现金；七日内未消费的充值免手续费" @click="bal > 0 ? openRefund() : say('没有可退的余额')" />
      </van-cell-group>

      <van-submit-bar :price="payCents" label="实付" button-type="primary" :button-text="btnText" :loading="S.busy" :disabled="blocked" placeholder @submit="charge" />
    </MiniState>

    <van-action-sheet v-model:show="monthSheet" :actions="monthActions" cancel-text="取消" description="按月份筛选收支明细" close-on-click-action @select="onMonth" />

    <!-- 申请退还余额 -->
    <van-popup v-model:show="refundOpen" position="bottom" round class="sheet-popup" :close-on-click-overlay="!refundBusy">
      <div class="sheet">
        <h2 class="sheet-title">申请退还余额</h2>
        <div class="sheet-body">
        <div class="rf-hero"><span class="muted">预计可退到微信支付</span><b class="num rf-n">{{ money(quote.amount) }}</b></div>
        <van-cell-group inset>
          <van-cell title="剩余本金" :value="money(quote.principal)" value-class="num" />
          <van-cell :title="quote.free ? '手续费（最近一次充值 7 日内且未消费）' : '手续费（5%）'" :value="quote.free ? '免收' : '−' + money(quote.fee)" value-class="num" />
          <van-cell title="赠送金（作废，不退现金）" :value="quote.gift ? '−' + money(quote.gift) : money(0)" value-class="num" />
        </van-cell-group>
        <van-cell-group inset>
          <van-cell v-for="x in ['消费时本金与赠送金按比例同时扣减，所以剩余本金对应的赠送金一并作废', '申请后对应金额立即冻结，不能再用于消费；驳回后完整释放', '原路退回，通常 1 到 3 个工作日到账；超过 365 天的充值转线下办理']" :key="x" :title="x" icon="info-o" />
        </van-cell-group>
        </div>
        <van-notice-bar v-if="refundErr" class="alert-bad" left-icon="warning-o" wrapable :scrollable="false" :text="refundErr" />
        <div class="sheet-foot">
          <van-button block plain :disabled="refundBusy" @click="refundOpen = false">再想想</van-button>
          <van-button block type="danger" :loading="refundBusy" :disabled="quote.amount <= 0" @click="submitRefund">提交退款申请</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.mp-page { --van-calendar-confirm-button-height: 44px; --van-cell-group-inset-title-padding: 12px 4px 4px; padding-bottom: 12px; }
.brand-card { padding: 16px; border-radius: var(--luz-radius-card); background: var(--luz-action); color: var(--luz-on-action); box-shadow: var(--luz-level-2); }
.brand-top, .brand-sub { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.brand-amount { margin: 8px 0; font-size: var(--t36); line-height: 44px; font-weight: 700; }
.brand-sub { font-size: var(--t14); }
.brand-note { margin: 8px 0 0; font-size: var(--t14); }
.steps { padding: 12px 16px 4px; background: var(--van-background-2); }
.plan-amt { font-size: var(--t16); font-weight: 600; }
.plan-tag { margin-left: 8px; }
.off { --van-cell-text-color: var(--luz-ink-3); }
.big-field { --van-cell-line-height: 40px; }
.bad { --van-cell-text-color: var(--luz-danger); }
.mhead { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.mhead b { color: var(--luz-ink); font-weight: 600; }
.log-ic { margin-right: 12px; font-size: 22px; }
.log-ic.in { color: var(--luz-success); }
.log-ic.out { color: var(--luz-ink-2); }
.amt { font-size: var(--t16); font-weight: 600; color: var(--luz-ink); }
.amt.plus { color: var(--luz-success); }
.end { margin: 0; text-align: center; }
.alert-bad { --van-notice-bar-background: var(--luz-danger-tint); --van-notice-bar-text-color: var(--luz-danger); border-radius: var(--luz-radius-control); }
.alert-warn { --van-notice-bar-background: var(--luz-warning-tint); --van-notice-bar-text-color: var(--luz-warning); border-radius: var(--luz-radius-control); }
.sheet-popup { display: flex; flex-direction: column; max-height: 80%; }
.sheet { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; gap: 12px; padding: 20px 0 16px; }
.sheet-body { display: grid; grid-auto-rows: max-content; gap: 12px; align-content: start; overflow-y: auto; min-height: 0; }
.sheet-title { margin: 0; padding: 0 16px; font-size: var(--t18); line-height: 26px; font-weight: 600; }
.sheet-foot { display: flex; gap: 12px; padding: 4px 16px 0; }
.sheet .alert-bad { margin: 0 16px; }
.rf-hero { display: grid; justify-items: center; gap: 4px; }
.rf-n { font-size: var(--t32); line-height: 40px; font-weight: 700; color: var(--luz-price); }
</style>
