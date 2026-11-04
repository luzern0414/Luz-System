<script>
// 注销账号（二级页）：先挡后问。第一条带列出所有阻断项并给出路，清空后才能勾选并提交；提交后整页变成冷静期，倒计时与撤回就是主角。
export const meta = {
  id: 'cancel-account', label: '注销账号', title: '注销账号', group: '我的', order: 4,
  layout: '横带分层',
  reason: '注销是不可逆的重事，所以先挡后问：第一条带列出所有阻断项并给出路，清空后第二条带才展示须知、勾选与提交；提交后整页变成冷静期，倒计时与撤回按钮就是主角',
  scenes: [
    { id: 'clean', label: '没有阻断项：直接看注销须知' },
    { id: 'fresh', label: '登录超过 15 分钟：静默重新登录后重试' },
    { id: 'relogin-fail', label: '静默重新登录失败' },
    { id: 'new-block', label: '提交时发现新的阻断项' },
    { id: 'dup', label: '重复提交：已有注销申请' },
    { id: 'cooling', label: '冷静期中：倒计时与撤回' },
    { id: 'withdraw-fail', label: '撤回失败：申请已被处理' },
    { id: 'anonymized', label: '冷静期届满：已匿名化' },
  ],
}
</script>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { B } from '../../shared/data.js'
import { state, useScene, setScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, money } from '../../shared/format.js'
import { useNav } from '../nav.js'
import { cardState, myCards } from './CardDetail.vue'

const { go, replace } = useNav()
const scene = useScene('cancel-account')
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

const COOL_DAYS = 15
const guest = computed(() => state.role === 'guest')
const me = computed(() => state.db.me)
const reasonOf = (e) => (e && e.name === 'NetError' ? (e.kind === 'offline' ? '当前没有网络，请连上网络后再试' : '网络不太稳定，请稍后再试') : (e && e.message) || '请稍后再试')
const say = (message) => showToast({ message, teleport: '#phone-overlay', duration: 1500 })

// 演示数据的补充：注销申请（null 即没有）与一个未结束的预约。重置演示数据后（db.users 换了新数组）再补一次。
function seed(db) {
  const marks = (db.seedOf ??= {})
  if (marks.cancel === db.users) return
  marks.cancel = db.users
  db.deletion = null
  db.bookings = [{ id: 1, name: '预约自取', at: K.ymd(K.addDays(K.today(), 1)) + ' 12:00', store: B.shop.name, status: 'BOOKED' }]
}
seed(state.db)

// 确认框：ask(...) 返回 Promise<boolean>
const dlg = reactive({ show: false, title: '', message: '', ok: '确定', cancel: '取消', danger: false })
let settle = null
function ask(o) { Object.assign(dlg, { ok: '确定', cancel: '取消', danger: false }, o, { show: true }); return new Promise((resolve) => { settle = resolve }) }
function answer(v) { if (settle) { settle(v); settle = null } }
watch(() => dlg.show, (v) => { if (!v) answer(false) })

// 注销申请：真实的在 state.db.deletion；演示场景“冷静期中、撤回失败、重复提交”在没有申请时给一条虚拟的
const base = Date.now()
const virtual = computed(() => (scene.value === 'cooling' || scene.value === 'withdraw-fail' ? { at: base - 2 * 864e5 - 3 * 36e5 } : scene.value === 'dup' ? { at: base - 36e5 } : null))
const dele = computed(() => state.db.deletion || virtual.value)
const untilAt = computed(() => (dele.value ? dele.value.at + COOL_DAYS * 864e5 : 0))
const leftMs = computed(() => Math.max(0, untilAt.value - Date.now()))
const finished = ref(false)
const view = computed(() => (scene.value === 'anonymized' || finished.value ? 'done' : dele.value ? 'cooling' : 'form'))
const pad = (n) => String(n).padStart(2, '0')

// 阻断项：读真实的订单、会员卡、储值、预约；“演示提交过程”的几个场景先当作没有阻断项
const clean = computed(() => ['clean', 'fresh', 'relogin-fail', 'new-block'].includes(scene.value))
const extra = ref(false)
const fresh = ref(false)
const working = ref('')
const mine = computed(() => state.db.orders.filter((o) => o.userId === me.value.id && !o.hidden))
const unpaid = computed(() => mine.value.filter((o) => o.status === 'UNPAID'))
const refunding = computed(() => mine.value.filter((o) => o.status === 'REFUNDING'))
const holding = computed(() => myCards().filter((c) => ['ACTIVE', 'PENDING', 'FROZEN', 'LOST', 'REFUNDING'].includes(cardState(c).key)))
const booked = computed(() => (state.db.bookings || []).filter((b) => b.status === 'BOOKED'))
const frozen = computed(() => me.value.frozen || 0)

async function cancelUnpaid() {
  const list = unpaid.value
  if (!(await ask({ title: '取消待支付订单', message: '取消 ' + list.length + ' 笔待支付订单？取消后订单关闭，不会产生扣款。', ok: '取消订单', cancel: '保留', danger: true }))) return
  working.value = 'unpaid'
  try { await request(600); list.forEach((o) => { o.status = 'CANCELLED' }); say('已取消待支付订单') } catch (e) { say(reasonOf(e)) } finally { working.value = '' }
}
async function cancelBooking() {
  const list = booked.value
  if (!(await ask({ title: '取消预约', message: '取消预约：' + list[0].name + '（' + list[0].at + '）？', ok: '取消预约', cancel: '保留', danger: true }))) return
  working.value = 'booking'
  try { await request(500); list.forEach((b) => { b.status = 'CANCELLED' }); say('预约已取消') } catch (e) { say(reasonOf(e)) } finally { working.value = '' }
}
const blocks = computed(() => {
  if (clean.value) return extra.value ? [{ k: 'new', icon: 'warning-o', title: '刚刚产生了一笔新的订单退款', sub: '提交时才发现，处理完成后再来', act: '查看进度', on: () => go('orders', { seg: 'after' }) }] : []
  const out = []
  if (unpaid.value.length) out.push({ k: 'unpaid', icon: 'clock-o', title: '待支付订单 ' + unpaid.value.length + ' 笔', sub: '取消或支付后才能注销', act: '取消订单', on: cancelUnpaid })
  if (refunding.value.length || frozen.value > 0) out.push({ k: 'refund', icon: 'after-sale', title: '退款处理中' + (refunding.value.length ? ' ' + refunding.value.length + ' 笔' : '') + (frozen.value > 0 ? '，储值退款冻结 ' + money(frozen.value) : ''), sub: '退款到账后才能注销，无法加快', act: '查看进度', on: () => (frozen.value > 0 && !refunding.value.length ? go('wallet') : go('orders', { seg: 'after' })) })
  if (holding.value.length) out.push({ k: 'cards', icon: 'vip-card-o', title: '有效会员卡 ' + holding.value.length + ' 张', sub: '可以先退卡，或等卡到期、用完', act: '去处理', on: () => go('my-cards') })
  if (me.value.balance > 0) out.push({ k: 'balance', icon: 'balance-o', title: '储值余额 ' + money(me.value.balance), sub: '先用完，或申请退还余额', act: '去处理', on: () => go('wallet') })
  if (booked.value.length) out.push({ k: 'booking', icon: 'calendar-o', title: '未结束的预约 ' + booked.value.length + ' 个', sub: booked.value.map((b) => b.name + ' ' + b.at).join('、'), act: '取消预约', on: cancelBooking })
  return out
})

// 提交
const ack = ref(false)
const submitting = ref(false)
const tip = ref(null)
const why = computed(() => (blocks.value.length ? '还有 ' + blocks.value.length + ' 项需要先处理，处理完成后才能申请注销' : !ack.value ? '请先勾选“我已阅读注销须知”' : ''))
async function submit() {
  tip.value = null
  if (submitting.value || blocks.value.length || !ack.value) return
  if (!(await ask({ title: '申请注销', message: '确认申请注销账号？提交后进入 ' + COOL_DAYS + ' 天冷静期，期满后个人信息被匿名化删除，无法恢复。', ok: '提交申请', cancel: '再想想', danger: true }))) return
  submitting.value = true
  try {
    await request(800)
    if (scene.value === 'new-block' && !extra.value) { extra.value = true; tip.value = { kind: 'bad', text: '提交时发现还有新的事项没有处理，请先处理后再申请' }; return }
    if ((scene.value === 'fresh' || scene.value === 'relogin-fail') && !fresh.value) {
      say('正在验证身份…')
      await request(900)
      if (scene.value === 'relogin-fail') { tip.value = { kind: 'bad', text: '身份验证没有通过，请重新登录后再申请', act: '重新登录', on: () => go('login') }; return }
      fresh.value = true
      await request(500)
    }
    if (!state.db.deletion) state.db.deletion = { at: Date.now() }
    if (['clean', 'fresh', 'new-block'].includes(scene.value)) setScene('cancel-account', null)
    say('注销申请已提交，进入冷静期')
  } catch (e) { tip.value = { kind: 'bad', text: '提交没有成功：' + reasonOf(e) } } finally { submitting.value = false }
}

// 撤回
const withdrawing = ref(false)
async function withdraw() {
  tip.value = null
  if (!(await ask({ title: '撤回注销', message: '撤回后账号立即恢复正常使用，卡、券、余额都会保留。', ok: '撤回注销', cancel: '继续注销' }))) return
  withdrawing.value = true
  try {
    await request(700, { fail: scene.value === 'withdraw-fail' ? new Error('这个注销申请已经处理完成或不存在，无法撤回') : undefined })
    state.db.deletion = null
    if (['cooling', 'dup'].includes(scene.value)) setScene('cancel-account', null)
    say('已撤回注销，账号恢复正常')
  } catch (e) { tip.value = { kind: 'bad', text: '撤回没有成功：' + reasonOf(e) } } finally { withdrawing.value = false }
}

function backToLogin() { state.role = 'guest'; state.signedIn = false; replace('login') }
const DELETE_LIST = ['昵称、头像、性别、生日', '手机号与会员号', '会员卡、优惠券和消息', '收藏、偏好与订阅授权']
const KEEP_LIST = ['交易与支付记录', '发票与财务凭证', '按法律要求保存，期限届满后删除；匿名化后不再关联到你']
const COOL_TIPS = ['账号暂时保留，期间重新登录或点“撤回注销”，账号立即恢复正常', '期满且没有未处理事项时，个人信息会被匿名化删除，无法恢复', '匿名化后，同一个微信再次登录会是新会员，原来的卡、券、余额都不再可用', '交易与支付记录按法律要求保留，但不再关联到你本人']
</script>

<template>
  <div class="mp-page cancel">
    <MiniState v-if="guest" status="forbidden">
      <template #forbidden-action><van-button type="primary" round @click="go('login')">去登录</van-button></template>
    </MiniState>
    <MiniState v-else :status="phase" :rows="6" @retry="load">
      <!-- 冷静期届满：已匿名化 -->
      <van-empty v-if="view === 'done'" description="账号已完成注销">
        <template #image><div class="done-ico"><van-icon name="passed" size="80" color="var(--luz-success)" /></div></template>
        <div class="done-body">
          <p class="muted done-sub">个人信息已匿名化删除，交易记录按法律要求保留但不再关联到你本人。同一个微信再次登录，会是一个全新的会员。</p>
          <van-button type="primary" round @click="backToLogin">回到登录页</van-button>
        </div>
      </van-empty>

      <!-- 冷静期：倒计时与撤回是主角（本页唯一的品牌主卡） -->
      <template v-else-if="view === 'cooling'">
        <section class="brand-card" aria-label="冷静期倒计时">
          <div>注销申请已提交</div>
          <van-count-down :time="leftMs" class="cd" @finish="finished = true">
            <template #default="t">
              <span class="cdb"><b class="num">{{ pad(t.days) }}</b><span>天</span></span>
              <span class="cdb"><b class="num">{{ pad(t.hours) }}</b><span>时</span></span>
              <span class="cdb"><b class="num">{{ pad(t.minutes) }}</b><span>分</span></span>
              <span class="cdb"><b class="num">{{ pad(t.seconds) }}</b><span>秒</span></span>
            </template>
          </van-count-down>
          <div class="num">冷静期截止 {{ B.fmt(new Date(untilAt)) }}</div>
        </section>
        <van-notice-bar v-if="scene === 'dup'" left-icon="info-o" :scrollable="false" wrapable text="你已经提交过注销申请，无需重复提交" class="tip-info" />
        <van-notice-bar v-if="tip" left-icon="info-o" :scrollable="false" wrapable :text="tip.text" class="tip-bad" role="alert" />
        <van-cell-group inset title="冷静期内会发生什么">
          <van-cell v-for="t in COOL_TIPS" :key="t" :title="t" />
        </van-cell-group>
        <van-action-bar placeholder>
          <van-action-bar-button type="primary" text="撤回注销" :loading="withdrawing" @click="withdraw" />
        </van-action-bar>
      </template>

      <!-- 申请：先处理阻断项，再看须知、勾选、提交 -->
      <template v-else>
        <div>
          <van-cell-group inset>
            <template #title><span class="band-title">{{ blocks.length ? '先处理这 ' + blocks.length + ' 件事' : '没有需要处理的事项' }}</span><span v-if="blocks.length" class="band-sub">全部清空后才能申请</span></template>
            <van-cell v-for="b in blocks" :key="b.k" center :title="b.title" :label="b.sub">
              <template #icon><van-icon :name="b.icon" class="block-icon" /></template>
              <template #right-icon><van-button size="small" round :loading="working === b.k" :aria-label="b.act + '：' + b.title" @click="b.on">{{ b.act }}</van-button></template>
            </van-cell>
          </van-cell-group>
          <van-notice-bar v-if="!blocks.length" left-icon="passed" :scrollable="false" wrapable text="订单、会员卡、储值和预约都已处理完毕，可以申请注销。" class="tip-ok" />
        </div>

        <div>
          <van-cell-group inset :title="'注销须知（冷静期 ' + COOL_DAYS + ' 天）'">
            <van-cell title="将删除"><template #label><div v-for="t in DELETE_LIST" :key="t">· {{ t }}</div></template></van-cell>
            <van-cell title="会保留"><template #label><div v-for="t in KEEP_LIST" :key="t">· {{ t }}</div></template></van-cell>
            <van-cell :label="'提交后进入 ' + COOL_DAYS + ' 天冷静期，期间可以随时撤回；期满且没有未处理事项时才会匿名化。'" />
          </van-cell-group>
        </div>

        <van-notice-bar v-if="tip" left-icon="info-o" :scrollable="false" wrapable :text="tip.text" class="tip-bad" role="alert">
          <template v-if="tip.act" #right-icon><van-button size="small" type="primary" plain @click="tip.on">{{ tip.act }}</van-button></template>
        </van-notice-bar>

        <van-submit-bar button-text="申请注销" button-type="danger" button-color="var(--luz-danger-fill)" :disabled="!!blocks.length || !ack" :loading="submitting" :tip="why" placeholder @submit="submit">
          <div class="ack"><van-checkbox v-model="ack" shape="square">我已阅读注销须知</van-checkbox></div>
        </van-submit-bar>
      </template>
    </MiniState>

    <van-dialog v-model:show="dlg.show" :title="dlg.title" :message="dlg.message" show-cancel-button :confirm-button-text="dlg.ok" :cancel-button-text="dlg.cancel" :confirm-button-color="dlg.danger ? 'var(--luz-danger)' : undefined" @confirm="answer(true)" @cancel="answer(false)" />
  </div>
</template>

<style scoped>
.band-title { color: var(--luz-ink); font-weight: 600; }
.band-sub { margin-left: 8px; }
.block-icon { margin-right: 12px; font-size: 24px; color: var(--luz-warning); }
.ack { flex: 1 1 auto; min-width: 0; }
.tip-ok { --van-notice-bar-background: var(--luz-success-tint); --van-notice-bar-text-color: var(--luz-success); margin-top: 12px; }
.tip-bad { --van-notice-bar-background: var(--luz-danger-tint); --van-notice-bar-text-color: var(--luz-danger); }
.tip-info { --van-notice-bar-background: var(--luz-info-tint); --van-notice-bar-text-color: var(--luz-info); }
.brand-card { display: grid; gap: 12px; padding: 16px; border-radius: var(--luz-radius-card); background: var(--luz-action); color: var(--luz-on-action); box-shadow: var(--luz-level-2); }
.cd { --van-count-down-text-color: var(--luz-on-action); display: flex; gap: 8px; }
.cancel { --van-submit-bar-tip-color: var(--luz-warning); --van-submit-bar-tip-background: var(--luz-warning-tint); }
.cdb { display: inline-flex; flex-direction: column; align-items: center; min-width: 56px; padding: 8px 4px; border-radius: var(--luz-radius-control); background: var(--luz-action-press); }
.cdb b { font-size: var(--t28); line-height: 34px; font-weight: 700; }
.done-ico { display: flex; align-items: center; justify-content: center; height: 100%; }
.done-body { display: grid; justify-items: center; gap: 16px; }
.done-sub { margin: 0 24px; text-align: center; }
</style>
