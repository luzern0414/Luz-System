<script>
export const meta = {
  id: 'refund-apply', label: '申请售后', title: '申请售后', group: '订单', order: 3,
  layout: '横带分层',
  reason: '申请售后是一条从上往下的流程：先选退哪几样、退多少（金额当场试算），再说原因、传凭证，最后提交；提交后同一页换成退款进度，一眼看到现在走到哪一步、钱会从哪里退回',
  scenes: [
    { id: 'has-active', label: '该订单已有进行中的申请' }, { id: 'window-closed', label: '超出申请期限，不能在线申请' }, { id: 'exceed', label: '提交被拒：金额超过可退上限' },
    { id: 'conflict', label: '提交被拒：商品刚被另一笔申请占用' }, { id: 'zero', label: '0 元订单：没有可退款项' }, { id: 's-review', label: '进度：待审核' },
    { id: 's-approved', label: '进度：已通过' }, { id: 's-refunding', label: '进度：退款中' }, { id: 's-done', label: '进度：已到账' },
    { id: 's-rejected', label: '进度：被拒绝（写明原因）' }, { id: 's-failed', label: '进度：退款失败，转人工' },
  ],
}
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, money } from '../../shared/format.js'
import { useNav } from '../nav.js'
import { kit } from './Orders.vue'

const { go, back, replace } = useNav()
const route = useRoute()
const scene = useScene('refund-apply')
const guest = computed(() => state.role === 'guest')
const store = B.shop

// ---- which order, and whether it is a request to make (apply) or a request that exists (progress)
const STAGE_SCENE = { 's-review': 'REVIEW', 's-approved': 'APPROVED', 's-refunding': 'REFUNDING', 's-done': 'DONE', 's-rejected': 'REJECTED', 's-failed': 'FAILED' }
const o = ref(null)
const rec = ref(null)
const phase = ref('loading')                                            // loading | ok | error
const forced = computed(() => STAGE_SCENE[scene.value])
async function load() {
  phase.value = 'loading'
  try {
    await request(450); kit.sweep()
    const sc = scene.value, L = kit.mine()
    let x = route.query.id ? kit.byNo(String(route.query.id)) : null
    if (!x) x = forced.value || sc === 'has-active' ? kit.find('refunding') : sc === 'window-closed' ? kit.find('expired') : L.find((y) => kit.kind(y) === 'done' && kit.canRefund(y)) || L.find(kit.canRefund) || kit.find('done')
    o.value = x
    const rid = route.query.rid ? Number(route.query.rid) : null
    let r = x && rid ? state.db.refunds.find((y) => y.id === rid && y.orderNo === x.no) : null
    if (forced.value && x) r = r || kit.refundsOf(x)[0]
    rec.value = r || null
    if (x && !r) init()
    phase.value = 'ok'
  } catch { phase.value = 'error' }
}
let timer = 0
onMounted(() => { load(); timer = setInterval(kit.sweep, 1000) })
onBeforeUnmount(() => clearInterval(timer))

// ---- the request form
const S = reactive({ sel: {}, why: '', other: '', desc: '', proofs: [], busy: false, err: {}, submitErr: '', retry: false })
const WHY = ['点错了', '菜品有问题', '重复下单', '出餐太慢', '其他']
const Ls = computed(() => (o.value ? kit.lines(o.value) : []))
const free = computed(() => Ls.value.filter((l) => l.leftQty > 0 && l.leftAmt > 0 && !l.locked))
const dead = (l) => !(l.leftQty > 0 && l.leftAmt > 0 && !l.locked)
function init() { S.sel = {}; Ls.value.forEach((l) => { if (!dead(l)) S.sel[l.i] = { on: true, qty: l.leftQty } }); S.err = {}; S.submitErr = ''; S.retry = false }
const picks = computed(() => free.value.filter((l) => S.sel[l.i] && S.sel[l.i].on).map((l) => ({ l, k: S.sel[l.i].qty, amt: kit.lineAmt(l, S.sel[l.i].qty) })))
const amount = computed(() => picks.value.reduce((s, x) => s + x.amt, 0))
const raw = computed(() => picks.value.reduce((s, x) => s + x.l.it.price * x.k, 0))
const pieces = computed(() => picks.value.reduce((s, x) => s + x.k, 0))
const allOn = computed(() => free.value.length > 0 && free.value.every((l) => S.sel[l.i] && S.sel[l.i].on))
function toggleAll(v) { free.value.forEach((l) => { S.sel[l.i].on = v; S.sel[l.i].qty = l.leftQty }); S.err.lines = '' }
const channel = computed(() => kit.channelOf(o.value, amount.value))
const active = computed(() => (o.value ? kit.activeRefunds(o.value)[0] : null))
const doneSum = computed(() => (o.value ? kit.refundsOf(o.value).filter((r) => kit.stageOf(r) === 'DONE').reduce((s, r) => s + r.amount, 0) : 0))
const activeSum = computed(() => (o.value ? kit.activeRefunds(o.value).reduce((s, r) => s + r.amount, 0) : 0))
const need = computed(() => S.why === '菜品有问题')
const how = ref([])

// what stops a request from being made at all
const blocked = computed(() => {
  const x = o.value
  if (!x) return null
  if (scene.value === 'zero' || x.amount === 0) return { title: '这是 0 元订单，没有可退款项', text: '优惠后实付 0 元的订单不产生退款，如有问题请联系门店。', image: 'search' }
  if (!['PAID', 'FULFILLED', 'DONE', 'REFUNDING'].includes(x.status)) return { title: x.status === 'UNPAID' ? '待支付的订单不用退款' : x.status === 'REFUNDED' ? '这笔订单已经全额退款' : '这笔订单已关闭', text: x.status === 'UNPAID' ? '直接取消订单就可以，优惠券会退回。' : '没有可以申请的款项。', image: 'search' }
  if (scene.value === 'window-closed' || kit.now() > kit.refundWindow(x)) return { title: '已超过申请期限', text: '订单完成后 7 天内可以在线申请售后，这笔订单已过期（截止 ' + K.ymd(kit.refundWindow(x)).slice(5) + '）。如有问题请联系门店处理。', image: 'network', contact: true }
  if (!free.value.length) return { title: active.value ? '商品都在申请中' : '没有可退的商品了', text: active.value ? '同一件商品同一时间只能有一个申请，处理完才能再申请。' : '这笔订单的商品都已退款。', image: 'search' }
  return null
})
const mode = computed(() => (!o.value ? 'none' : rec.value ? 'progress' : blocked.value ? 'blocked' : 'apply'))
const status = computed(() => (guest.value ? 'forbidden' : phase.value !== 'ok' ? phase.value : mode.value === 'none' ? 'empty' : 'ok'))

// ---- refs to the sections that can show an error
const linesBox = ref(null), whyBox = ref(null), proofBox = ref(null)
const scrollTo = (r) => nextTick(() => { const el = r.value && (r.value.$el || r.value); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: state.reducedMotion ? 'auto' : 'smooth' }) })

async function afterRead(file) {
  for (const f of Array.isArray(file) ? file : [file]) {
    f.status = 'uploading'; f.message = '上传中'
    try { await request(500); f.status = 'done'; f.message = '' } catch (e) { f.status = 'failed'; f.message = '上传失败，请删除后重选' }
  }
}
async function submit() {
  if (S.busy) return
  const x = o.value, P = picks.value; S.err = {}; S.submitErr = ''; S.retry = false
  let first = null
  if (!P.length) { S.err.lines = '请至少选择一件要退的商品'; first = linesBox }
  if (!S.why) { S.err.why = '请选择退款原因'; first = first || whyBox } else if (S.why === '其他' && S.other.trim().length < 2) { S.err.why = '选了“其他”，请写下具体原因（至少 2 个字）'; first = first || whyBox }
  if (need.value && !S.proofs.length) { S.err.proof = '“菜品有问题”需要至少 1 张照片'; first = first || proofBox }
  else if (S.proofs.some((f) => f.status === 'uploading' || f.status === 'failed')) { S.err.proof = '有图片还没上传好，请等一下或删除后重选'; first = first || proofBox }
  if (first) { scrollTo(first); return }
  S.busy = true
  try { await request(600) } catch (e) { S.busy = false; S.submitErr = e.message + '，申请没有提交。请检查网络后再点一次，不会重复提交'; return }
  // what the server checks: the amount, a line taken by another request, the period
  const cur = kit.lines(x), over = P.some((p) => p.k > cur[p.l.i].leftQty || cur[p.l.i].locked)
  if (scene.value === 'exceed') { S.busy = false; S.submitErr = '退款金额超过这笔订单的可退上限（最多 ' + money(cur.reduce((s, l) => s + (l.locked ? 0 : l.leftAmt), 0) - 100) + '），请调整后再提交'; return }
  if (scene.value === 'conflict' || over) { S.busy = false; S.submitErr = '刚刚有另一笔申请占用了其中的商品，请刷新后重新选择'; S.retry = true; return }
  try {
    const r = kit.makeRefund(x, { lines: P.map((p) => ({ i: p.l.i, qty: p.k })), reason: S.why === '其他' ? '其他：' + S.other.trim() : S.why, desc: S.desc.trim(), proofs: S.proofs.map((f) => f.content || f.url), auto: true })
    kit.toast('申请已提交，等待门店审核', 'success'); replace('refund-apply', { id: x.no, rid: r.id })
  } catch (e) { S.submitErr = e.message } finally { S.busy = false }
}
const reload = () => { S.proofs = []; S.why = ''; S.other = ''; S.desc = ''; init() }

// ---- one confirm dialog for the page
const cf = reactive({ show: false, title: '', message: '', ok: '确定', cancel: '取消', danger: false, resolve: null })
function ask({ title, message, ok = '确定', cancel = '取消', danger = false }) { Object.assign(cf, { show: true, title, message, ok, cancel, danger }); return new Promise((r) => { cf.resolve = r }) }
function answer(v) { if (cf.resolve) { cf.resolve(v); cf.resolve = null } }
const call = () => ask({ title: '拨打电话', message: store.name + '\n' + store.phone, ok: '拨打' }).then((yes) => yes && kit.toast('正在呼叫（模拟）'))

// ---- progress of a request
const EXPLAIN = {
  REVIEW: ['申请已提交，等待门店审核', '门店通常会在 1 个工作日内处理，请耐心等待。审核期间可以撤销申请。'],
  APPROVED: ['审核通过，正在发起退款', '门店已同意退款，系统正在向支付渠道提交退款。'],
  REFUNDING: ['退款已发起，正在退回', '款项正在退回你的支付账户，到账时间以渠道为准。'],
  DONE: ['退款已到账', ''], REJECTED: ['申请被驳回', ''],
  FAILED: ['退款没有成功，已转人工处理', '支付渠道退款失败，客服会在 1 个工作日内联系你，不需要重复申请。'],
  WITHDRAWN: ['你已撤销申请', '订单恢复到申请前的状态，需要时可以重新申请。'],
}
const r = computed(() => {
  const x = rec.value
  if (!x) return null
  const f = forced.value
  return f ? Object.assign({}, x, { status: f === 'DONE' ? 'DONE' : f === 'REJECTED' ? 'REJECTED' : 'PENDING', stage: f, manual: f === 'FAILED', note: f === 'REJECTED' ? '凭证看不出餐品有问题，请补充清晰的照片后重新申请' : x.note, doneAt: f === 'DONE' ? x.doneAt || kit.stamp() : x.doneAt }) : x
})
const st = computed(() => (r.value ? kit.stageOf(r.value) : ''))
const ch = computed(() => (r.value ? r.value.channel || kit.channelOf(o.value, r.value.amount) : { balance: 0, wechat: 0 }))
const heroTone = computed(() => ({ DONE: 'ok', REJECTED: 'bad', FAILED: 'bad', WITHDRAWN: 'plain' }[st.value] || 'warn'))
const heroText = computed(() => {
  const x = r.value
  if (st.value === 'DONE') return money(x.amount) + ' 已' + (ch.value.wechat ? '原路退回' : '') + (ch.value.balance && ch.value.wechat ? '，其中' : '') + (ch.value.balance ? '回到储值余额 ' + money(ch.value.balance) : '') + '，' + kit.when(x.doneAt) + ' 到账'
  if (st.value === 'REJECTED') return '驳回原因：' + (x.note || '门店未说明原因') + '。你可以补充材料后重新申请。'
  return EXPLAIN[st.value][1]
})
const trailAt = (kw) => ((r.value.trail || []).find((x) => x.text.includes(kw)) || {}).at || ''
const steps = computed(() => {
  const x = r.value, s = st.value, S4 = ['REVIEW', 'APPROVED', 'REFUNDING', 'DONE'], idx = S4.indexOf(s)
  if (s === 'REJECTED' || s === 'WITHDRAWN') return [['已提交', x.appliedAt, 'done'], ['门店审核', trailAt('驳回') || trailAt('撤销'), 'done'], [s === 'REJECTED' ? '被拒绝' : '已撤销', '', 'bad']]
  if (s === 'FAILED') return [['已提交', x.appliedAt, 'done'], ['审核通过', trailAt('同意') || trailAt('通过'), 'done'], ['退款失败', '', 'bad'], ['人工处理', '', 'now']]
  const L = [['已提交', x.appliedAt, 'done'], ['门店审核', s === 'REVIEW' ? '' : trailAt('审核通过') || trailAt('同意') || trailAt('通过'), idx > 0 ? 'done' : 'now'], ['退款中', idx >= 2 ? trailAt('发起退款') : '', idx > 2 ? 'done' : idx === 2 ? 'now' : 'todo'], ['已到账', s === 'DONE' ? x.doneAt : '', s === 'DONE' ? 'done' : 'todo']]
  if (s === 'APPROVED') L[1][2] = 'done'
  return L
})
const stepActive = computed(() => { const i = steps.value.findIndex((x) => x[2] === 'now'); return i >= 0 ? i : steps.value.length - 1 })
const rows = computed(() => {
  const x = r.value
  return (x.items && x.items.length ? x.items : Ls.value.map((l) => ({ idx: l.i, qty: l.it.qty, amount: l.share }))).map((y) => ({ ...y, it: o.value.items[y.idx] })).filter((y) => y.it)
})
const trail = computed(() => (r.value.trail || []).slice().reverse())
async function withdraw() {
  const x = rec.value
  const yes = await ask({ title: '撤销退款申请', message: '撤销这笔 ' + money(x.amount) + ' 的退款申请（订单 ' + o.value.no.slice(-6) + '）。撤销后订单恢复原状，需要时可以重新申请。', ok: '撤销申请', danger: true })
  if (!yes) return
  try { await request(400) } catch (e) { kit.toast(e.message + '，没有撤销成功', 'fail'); return }
  kit.endRefund(x, 'WITHDRAWN', o.value.userName + '（会员）', '会员撤销了申请'); kit.toast('申请已撤销', 'success')
}
</script>

<template>
  <div class="mp-page">
    <MiniState :status="status" :rows="6" empty-text="没有可以申请售后的订单，已完成或已支付的订单才能申请退款" error-hint="页面没有加载出来，请检查网络后重试" @retry="load">
      <template #empty-action><van-button round @click="back()">回到订单</van-button></template>
      <template #forbidden-action><van-button round type="primary" @click="go('login')">去登录</van-button></template>

      <!-- a request that cannot be made -->
      <template v-if="mode === 'blocked'">
        <van-cell-group v-if="active" inset title="已有进行中的申请">
          <van-cell center :title="'退款 ' + money(active.amount)" :label="active.reason + ' · ' + kit.when(active.appliedAt)" is-link @click="go('refund-apply', { id: o.no, rid: active.id })">
            <template #value><van-tag :type="kit.STAGE[kit.stageOf(active)][1]" plain :color="kit.tagColor(kit.STAGE[kit.stageOf(active)][1])">{{ kit.STAGE[kit.stageOf(active)][0] }}</van-tag></template>
          </van-cell>
        </van-cell-group>
        <van-empty :image="blocked.image" :description="blocked.title">
          <p class="muted tip">{{ blocked.text }}</p>
          <div class="empty-acts"><van-button round type="primary" @click="back()">返回订单</van-button><van-button v-if="blocked.contact" round icon="phone-o" @click="call">联系门店</van-button></div>
        </van-empty>
      </template>

      <!-- progress -->
      <template v-else-if="mode === 'progress'">
        <section class="hero" :class="'hero--' + heroTone" aria-label="退款状态">
          <div class="hero-top"><h2>{{ EXPLAIN[st][0] }}</h2><van-tag :type="kit.STAGE[st][1]" plain :color="kit.tagColor(kit.STAGE[st][1])">{{ kit.STAGE[st][0] }}</van-tag></div>
          <p>{{ heroText }}</p>
        </section>
        <van-cell-group inset>
          <template #title>退款进度<span v-if="!['DONE', 'REJECTED', 'WITHDRAWN'].includes(st)" class="muted gap">约 1–3 个工作日到账</span></template>
          <div class="steps">
            <van-steps direction="vertical" :active="stepActive">
              <van-step v-for="s in steps" :key="s[0]">
                <template #active-icon><van-icon :name="s[2] === 'bad' ? 'cross' : s[2] === 'now' ? 'clock-o' : 'checked'" :class="{ bad: s[2] === 'bad' }" /></template>
                <template v-if="s[2] === 'bad'" #finish-icon><van-icon name="cross" class="bad" /></template>
                <span class="step-t">{{ s[0] }}</span>
                <p class="muted num">{{ s[1] ? kit.when(s[1]) : s[2] === 'now' ? '进行中' : '' }}</p>
              </van-step>
            </van-steps>
          </div>
        </van-cell-group>
        <van-cell-group inset title="退款明细">
          <van-card v-for="(y, n) in rows" :key="n" :num="y.qty" :price="(y.amount / 100).toFixed(2)" :title="y.it.name" :desc="y.it.spec || '默认规格'" :thumb="y.it.img" />
          <van-cell center title="退款金额"><template #value><MiniPrice :cents="r.amount" :size="18" /></template></van-cell>
          <van-cell title="退款方式" :value="r.kind || '仅退款'" />
          <van-cell title="申请原因" :value="r.reason" :label="r.desc || undefined" />
          <van-cell title="申请编号" clickable @click="kit.copy(kit.rno(r), '申请编号已复制')"><template #value><span class="num">{{ kit.rno(r) }}</span></template><template #right-icon><van-icon name="records-o" class="copy" /></template></van-cell>
          <van-cell title="申请时间" :value="kit.when(r.appliedAt)" />
          <van-cell v-if="r.proofs && r.proofs.length" title="凭证图片">
            <template #value><div class="proofs"><van-image v-for="(p, n) in r.proofs" :key="n" :src="p" alt="凭证图片" width="56" height="56" radius="8" fit="cover" /></div></template>
          </van-cell>
        </van-cell-group>
        <van-cell-group inset title="退回路径">
          <van-cell v-if="ch.balance" title="储值余额" :value="money(ch.balance) + ' · 即时退回钱包'" />
          <van-cell v-if="ch.wechat" title="原支付渠道" :value="money(ch.wechat) + ' · 原路退回，1–3 个工作日'" />
          <van-cell class="note" :title="(ch.balance ? '储值余额部分回到钱包，不折现。' : '') + '退款不会退到积分或代金券；订单有未过期的优惠券时，全部商品退完后会退回。'" />
        </van-cell-group>
        <van-cell-group inset :title="'处理记录 · ' + trail.length + ' 条'">
          <van-cell v-for="(x, n) in trail" :key="n" :title="x.who + ' ' + x.text" :value="x.at.slice(5)" />
        </van-cell-group>
        <van-action-bar placeholder>
          <template v-if="st === 'REVIEW'"><van-action-bar-button type="warning" text="撤销申请" @click="withdraw" /><van-action-bar-button type="primary" text="联系门店" @click="call" /></template>
          <template v-else-if="st === 'REJECTED' || st === 'WITHDRAWN'"><van-action-bar-button type="warning" text="查看订单" @click="replace('order-detail', { id: o.no })" /><van-action-bar-button type="primary" text="重新申请" @click="replace('refund-apply', { id: o.no })" /></template>
          <template v-else-if="st === 'FAILED'"><van-action-bar-button type="warning" text="查看订单" @click="replace('order-detail', { id: o.no })" /><van-action-bar-button type="primary" text="联系客服" @click="go('feedback')" /></template>
          <template v-else><van-action-bar-button type="warning" text="联系门店" @click="call" /><van-action-bar-button type="primary" text="查看订单" @click="replace('order-detail', { id: o.no })" /></template>
        </van-action-bar>
      </template>

      <!-- the request form -->
      <template v-else>
        <van-cell-group v-if="active" inset title="已有进行中的申请">
          <van-cell center :title="'退款 ' + money(active.amount)" :label="active.reason + ' · ' + kit.when(active.appliedAt)" is-link @click="go('refund-apply', { id: o.no, rid: active.id })">
            <template #value><van-tag :type="kit.STAGE[kit.stageOf(active)][1]" plain :color="kit.tagColor(kit.STAGE[kit.stageOf(active)][1])">{{ kit.STAGE[kit.stageOf(active)][0] }}</van-tag></template>
          </van-cell>
        </van-cell-group>
        <van-cell-group inset>
          <template #title>订单信息<van-tag :type="kit.TONE[kit.kind(o)]" plain class="gap" :color="kit.tagColor(kit.TONE[kit.kind(o)])">{{ kit.label(o) }}</van-tag></template>
          <van-cell center :title="store.name" :label="kit.when(o.createdAt) + ' · 共 ' + kit.count(o) + ' 件'">
            <template #value><div class="thumbs"><van-image v-for="(i, n) in o.items.slice(0, 3)" :key="n" :src="i.img" :alt="i.name" width="40" height="40" radius="6" fit="cover" /></div></template>
          </van-cell>
          <van-cell title="实付金额" :value="money(o.amount)" />
          <van-cell v-if="doneSum" title="已退款" :value="money(doneSum)" />
          <van-cell v-if="activeSum" title="申请中" :value="money(activeSum)" />
          <van-cell title="申请截止" :value="K.ymd(kit.refundWindow(o)).slice(5) + ' ' + kit.hm(B.fmt(kit.refundWindow(o)))" />
        </van-cell-group>

        <van-cell-group ref="linesBox" inset title="选择要退的商品">
          <van-cell center><van-checkbox :model-value="allOn" @update:model-value="toggleAll">全选</van-checkbox></van-cell>
          <van-cell v-for="l in Ls" :key="l.i" center :class="{ off: dead(l) }">
            <template #icon><van-checkbox v-if="!dead(l)" v-model="S.sel[l.i].on" class="ck" :aria-label="'选择 ' + l.it.name" @update:model-value="S.err.lines = ''" /><span v-else class="ck ph" /></template>
            <template #title>
              <div class="rl">
                <van-image :src="l.it.img" :alt="l.it.name" width="52" height="52" radius="8" fit="cover" />
                <div class="rl-t">
                  <b class="nm">{{ l.it.name }}</b>
                  <p class="muted">{{ l.it.spec || '默认规格' }} · 买了 {{ l.it.qty }} 件</p>
                  <van-tag v-if="dead(l)" plain color="var(--luz-ink-2)">{{ l.locked ? '申请中' : '已退完' }}</van-tag>
                  <p v-else class="muted">{{ l.usedQty ? '已退 ' + l.usedQty + ' 件，还可退 ' + l.leftQty + ' 件' : '最多可退 ' + l.leftQty + ' 件 · ' + money(l.leftAmt) }}</p>
                </div>
              </div>
            </template>
            <template v-if="!dead(l)" #value>
              <div class="rr"><b class="num">{{ money(kit.lineAmt(l, S.sel[l.i].qty)) }}</b><van-stepper v-if="l.leftQty > 1" v-model="S.sel[l.i].qty" :min="1" :max="l.leftQty" integer theme="round" button-size="40" input-width="32" :aria-label="'退款件数：' + l.it.name" @change="S.sel[l.i].on = true; S.err.lines = ''" /></div>
            </template>
          </van-cell>
          <van-cell v-if="S.err.lines" :border="false"><template #title><span class="field-err">{{ S.err.lines }}</span></template></van-cell>
        </van-cell-group>

        <van-cell-group inset>
          <template #title>可退金额试算<span v-if="picks.length" class="muted gap">{{ pieces }} 件</span></template>
          <van-cell v-if="!picks.length" title="请先在上面选择要退的商品，这里会算出能退多少钱" />
          <template v-else>
            <van-cell title="所选商品原价" :value="money(raw)" />
            <van-cell v-if="raw - amount > 0" title="已分摊的优惠" :value="'-' + money(raw - amount)" />
            <van-cell center title="可退金额"><template #value><MiniPrice :cents="amount" :size="18" /></template></van-cell>
            <van-collapse v-model="how">
              <van-collapse-item title="怎么算的" name="how">
                <p v-for="p in picks" :key="p.l.i" class="muted calc">{{ p.l.it.name }} ×{{ p.k }}：原价 {{ money(p.l.it.price * p.k) }}{{ p.l.it.price * p.k > p.amt ? '，分摊优惠 -' + money(p.l.it.price * p.k - p.amt) : '' }}，可退 {{ money(p.amt) }}</p>
                <p class="muted calc">订单用的优惠券、活动减免和储值赠送金，按各商品实付金额的比例分摊，退款只退你实际付出的钱。</p>
              </van-collapse-item>
            </van-collapse>
            <van-cell icon="balance-o" title="退回路径" :label="kit.channelText(channel)" />
          </template>
        </van-cell-group>

        <van-cell-group ref="whyBox" inset title="退款原因">
          <van-cell>
            <van-radio-group v-model="S.why" direction="horizontal" class="chips" @change="S.err.why = ''; S.err.proof = ''">
              <van-radio v-for="w in WHY" :key="w" :name="w">{{ w }}</van-radio>
            </van-radio-group>
          </van-cell>
          <van-field v-if="S.why === '其他'" v-model="S.other" type="textarea" rows="2" maxlength="100" show-word-limit placeholder="请写明具体原因（必填）" aria-label="其他原因" @input="S.err.why = ''" />
          <van-field v-model="S.desc" type="textarea" rows="3" maxlength="200" show-word-limit placeholder="补充说明（选填，不超过 200 字）" aria-label="补充说明" />
          <van-cell v-if="S.err.why" :border="false"><template #title><span class="field-err">{{ S.err.why }}</span></template></van-cell>
        </van-cell-group>

        <van-cell-group ref="proofBox" inset :title="'凭证图片 ' + S.proofs.length + '/3'">
          <van-cell class="note" :title="need ? '“菜品有问题”需要至少 1 张照片，方便门店核实。' : '选填，最多 3 张，有照片处理更快。'" />
          <div class="up"><van-uploader v-model="S.proofs" :max-count="3" :max-size="5 * 1024 * 1024" accept="image/*" upload-text="添加图片" :after-read="afterRead" @oversize="kit.toast('图片不能超过 5 MB')" @delete="S.err.proof = ''" /></div>
          <van-cell v-if="S.err.proof" :border="false"><template #title><span class="field-err">{{ S.err.proof }}</span></template></van-cell>
        </van-cell-group>

        <van-cell-group inset title="期望处理方式">
          <van-radio-group model-value="refund">
            <van-cell title="仅退款" label="审核通过后，款项原路退回" clickable center><template #right-icon><van-radio name="refund" /></template></van-cell>
            <van-cell title="退货退款" label="餐品不支持退货" center><template #right-icon><van-radio name="return" disabled /></template></van-cell>
          </van-radio-group>
        </van-cell-group>

        <van-submit-bar :price="amount" label="退款" :button-text="S.busy ? '提交中' : '提交申请'" button-type="primary" :loading="S.busy" placeholder @submit="submit">
          <template #top>
            <van-notice-bar v-if="S.submitErr" class="err" left-icon="warning-o" wrapable :scrollable="false" :mode="S.retry ? 'link' : ''" :text="S.submitErr + (S.retry ? '（点此刷新）' : '')" @click="S.retry && reload()" />
          </template>
          <span class="muted bar-note">{{ picks.length ? '共 ' + pieces + ' 件 · 仅退款' : '请先选择商品' }}</span>
        </van-submit-bar>
      </template>
    </MiniState>

    <van-dialog v-model:show="cf.show" :title="cf.title" :message="cf.message" message-align="left" :show-cancel-button="!!cf.cancel" :cancel-button-text="cf.cancel" :confirm-button-text="cf.ok"
      :confirm-button-color="cf.danger ? 'var(--luz-danger)' : undefined" @confirm="answer(true)" @cancel="answer(false)" @closed="answer(false)" />
  </div>
</template>

<style scoped>
b { font-weight: 600; }
.mp-page { --van-card-background: var(--van-background-2); --van-card-thumb-size: 64px; --van-action-bar-button-warning-color: var(--luz-action-tint); --van-button-warning-color: var(--luz-action-text); --van-submit-bar-price-color: var(--luz-price); }
.hero { display: grid; gap: 6px; padding: 16px; border-radius: var(--luz-radius-card); background: var(--luz-surface); }
.hero--warn { background: var(--luz-warning-tint); }
.hero--ok { background: var(--luz-success-tint); }
.hero--bad { background: var(--luz-danger-tint); }
.hero h2 { margin: 0; font-size: var(--t18); line-height: 26px; font-weight: 600; }
.hero p { margin: 0; }
.hero-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.gap { margin-left: 8px; }
.steps { padding: 4px 16px 8px; background: var(--van-background-2); }
.steps p { margin: 0; }
.step-t { font-weight: 600; }
.bad { color: var(--luz-danger); }
.copy { margin-left: 8px; color: var(--luz-ink-2); align-self: center; }
.proofs, .thumbs { display: flex; gap: 8px; justify-content: flex-end; }
.tip { margin: 0 0 16px; text-align: center; }
.empty-acts { display: flex; gap: 8px; justify-content: center; }
.ck { margin-right: 12px; }
.ck.ph { display: inline-block; width: 20px; }
.off { color: var(--luz-ink-3); }
.rl { display: flex; gap: 12px; align-items: flex-start; }
.rl-t { min-width: 0; }
.rl-t p { margin: 2px 0 0; }
.nm { font-weight: 600; }
.rr { display: grid; justify-items: end; gap: 8px; }
.chips { gap: 8px 16px; }
.calc { margin: 0 0 8px; }
.note { --van-cell-text-color: var(--luz-ink-2); }
.up { padding: 4px 16px 12px; background: var(--van-background-2); }
.field-err { color: var(--luz-danger); }
.err { --van-notice-bar-background: var(--luz-danger-tint); --van-notice-bar-text-color: var(--luz-ink); }
.bar-note { margin-right: auto; }
</style>
