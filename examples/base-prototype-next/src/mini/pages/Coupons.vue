<script>
// 优惠券（二级页）：“我的券”（可用、已使用、已过期）与“领券中心”两个页签；兑换码在“我的券”顶部一行。
// 读写 state.db.coupons（券模板，后台优惠券页同一份）与 state.db.myCoupons（我的券）。
export const meta = {
  id: 'coupons', label: '优惠券', title: '优惠券', group: '会员与资产', order: 5,
  layout: '主次布局',
  reason: '优惠券页的主角是“我现在能用哪张”：默认打开可用的券，面额放大、临期写剩余时间；领券和兑换码是配角，放进“领券中心”页签和顶部一行输入；已使用、已过期的券盖章退后',
  scenes: [
    { id: 'claim-sold', label: '领券失败：刚被抢光' },
    { id: 'claim-limit', label: '领券失败：已达领取上限' },
    { id: 'claim-daily', label: '领券失败：今日已领' },
    { id: 'claim-paused', label: '领券失败：活动暂停发放' },
    { id: 'redeem-locked', label: '兑换码：连续输错，需等待' },
  ],
}
</script>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { B } from '../../shared/data.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K } from '../../shared/format.js'
import { useNav } from '../nav.js'

const { go, toTab } = useNav()
const route = useRoute()
const scene = useScene('coupons')
const toast = (message, type) => showToast({ message, type, teleport: '#phone-overlay', duration: 1800 })

// ---------- 日期与金额 ----------
const todayStr = () => K.ymd(K.today())
const addD = (s, n) => K.ymd(K.addDays(new Date(s + 'T00:00:00'), n))
const diff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5)
const y0 = (cents) => '¥' + (cents % 100 ? (cents / 100).toFixed(2) : cents / 100)

// ---------- 演示数据：共用 data.js 里只有 4 张券模板，这里补上可领、未开抢、已抢光的几类和兑换码；重置演示数据后（db.users 换了新数组）再补一次 ----------
function seed() {
  const db = state.db
  const marks = (db.seedOf ??= {})
  if (marks.coupons === db.users) return
  marks.coupons = db.users
  const t = todayStr(), D = (n) => addD(t, n)
  let id = db.coupons.reduce((m, c) => Math.max(m, c.id), 0)
  const add = (seedKey, c) => { db.coupons.push({ id: ++id, seedKey, ...c }); return id }
  const newbie = add('newbie', { name: '新人礼 满 20 减 5', kind: '满减', threshold: 2000, value: 500, scope: '全部商品', days: 1, stock: 2000, claimed: 1204, used: 612, perUser: 1, status: 'ON' })
  add('weekend', { name: '周末满 60 减 15', kind: '满减', threshold: 6000, value: 1500, scope: '全部商品', days: 3, stock: 500, claimed: 0, used: 0, perUser: 1, status: 'ON', startAt: D(2) })
  add('lunch', { name: '午市满 40 减 6', kind: '满减', threshold: 4000, value: 600, scope: '主食', days: 7, stock: 200, claimed: 200, used: 144, perUser: 1, status: 'ON' })
  add('breakfast', { name: '早餐 8.5 折（封顶 8 元）', kind: '折扣', threshold: 0, value: 85, cap: 800, scope: '早餐类商品', days: 5, stock: 300, claimed: 87, used: 20, perUser: 1, status: 'ON' })
  add('m35', { name: '满 35 减 4', kind: '满减', threshold: 3500, value: 400, scope: '全部商品', days: 7, stock: 800, claimed: 344, used: 120, perUser: 2, status: 'ON', daily: 1 })
  db.myCoupons.push({ id: db.myCoupons.reduce((m, c) => Math.max(m, c.id), 0) + 1, couponId: newbie, name: '新人礼 满 20 减 5', kind: '满减', threshold: 2000, value: 500, expire: D(0), state: 'UNUSED' })
  const doneOrder = db.orders.find((o) => o.userId === db.me.id && o.status === 'DONE')
  db.myCoupons.forEach((c) => {
    const tp = db.coupons.find((x) => x.id === c.couponId) || {}
    c.scope ??= tp.scope || '全部商品'
    c.got ??= D(Math.min(-1, -(tp.days || 7) + diff(t, c.expire)))
    if (c.state === 'USED') { c.usedAt ??= D(-9) + ' 12:10'; c.orderNo ??= doneOrder ? doneOrder.no : '' }
  })
  db.redeemCodes = { WELCOME5: { seedKey: 'm35', st: 'ok' }, BREAKFAST: { seedKey: 'breakfast', st: 'ok' }, USED2026: { seedKey: 'newbie', st: 'used' }, OLD2025: { seedKey: 'lunch', st: 'expired' } }
}
seed()

// ---------- 页面状态 ----------
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); seed(); resort(); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)
const status = computed(() => (state.role === 'guest' ? 'forbidden' : phase.value))

const tab = ref(route.query.tab === 'center' ? 'center' : 'mine')
const seg = ref(['usable', 'used', 'expired'].includes(route.query.seg) ? route.query.seg : 'usable')
const SEGS = [['usable', '可用'], ['used', '已使用'], ['expired', '已过期']]
const centerOn = computed(() => { const f = state.db.config.runtime.find((x) => x.key === 'feature.coupon'); return !f || f.value !== false })
watch(centerOn, (on) => { if (!on && tab.value === 'center') tab.value = 'mine' })
const flashId = ref(0)
watch([tab, seg], () => { flashId.value = 0 })

// ---------- 券的各种说法 ----------
const tplOf = (c) => state.db.coupons.find((x) => x.id === c.couponId) || {}
const stateOf = (c) => (c.state === 'USED' ? 'used' : c.state === 'EXPIRED' || c.expire < todayStr() ? 'expired' : 'usable')
const faceOf = (c) => (c.kind === '折扣' ? { num: String(c.value / 10), unit: '折' } : c.kind === '兑换' ? { text: '兑换' } : { pre: '¥', num: String(c.value / 100) })
const thText = (c, tp) => (c.kind === '折扣' ? (c.cap || tp.cap ? '最高减 ' + y0(c.cap || tp.cap) : '无门槛') : c.threshold ? '满 ' + y0(c.threshold) + ' 可用' : '无门槛')
function expText(c) {
  const d = diff(todayStr(), c.expire)
  if (d < 0) return '有效期至 ' + c.expire
  if (d === 0) { const n = B.NOW(), left = 24 * 60 - (n.getHours() * 60 + n.getMinutes()); return '今天 23:59 到期，剩余 ' + Math.floor(left / 60) + ' 小时 ' + (left % 60) + ' 分' }
  return d <= 3 ? d + ' 天后到期（' + c.expire + '）' : '有效期至 ' + c.expire
}
function rulesOf(c, tp, days) {
  return [
    ['使用门槛', c.kind === '折扣' ? '实付金额打 ' + c.value / 10 + ' 折' + (c.cap || tp.cap ? '，优惠最多 ' + y0(c.cap || tp.cap) : '') : c.threshold ? '订单满 ' + y0(c.threshold) + ' 立减 ' + y0(c.value) : '无门槛，立减 ' + y0(c.value)],
    ['适用范围', c.scope || tp.scope || '全部商品'],
    ['叠加规则', '一笔订单限用 1 张，不与其他优惠券叠加'],
    ['有效期', days ? '领取后 ' + days + ' 天内有效，到期日 23:59 截止' : (c.got ? c.got + ' 领取，' : '') + '至 ' + c.expire + ' 23:59'],
    ['退款与退券', '订单全额退款时，未过期的券退回账户；部分退款、已过期的券不退回'],
    ['来源', c.source || '领券中心'],
  ]
}

// ---------- 我的券 ----------
const mine = computed(() => state.db.myCoupons.map((c) => ({ c, st: stateOf(c) })))
const counts = computed(() => Object.fromEntries(SEGS.map(([id]) => [id, mine.value.filter((x) => x.st === id).length])))
const soonCount = computed(() => mine.value.filter((x) => x.st === 'usable' && diff(todayStr(), x.c.expire) <= 2).length)
const mineTickets = computed(() => mine.value.filter((x) => x.st === seg.value)
  .sort((a, b) => (seg.value === 'usable' ? (a.c.expire < b.c.expire ? -1 : 1) : seg.value === 'used' ? ((a.c.usedAt || '') < (b.c.usedAt || '') ? 1 : -1) : (a.c.expire < b.c.expire ? 1 : -1)))
  .map(({ c, st }) => {
    const tp = tplOf(c), dead = st !== 'usable', soon = !dead && diff(todayStr(), c.expire) <= 0
    return {
      key: 'm' + c.id, kind: 'mine', name: c.name, face: faceOf(c), th: thText(c, tp), dead, soon, fresh: c.id === flashId.value, err: '',
      scope: (c.scope || tp.scope || '全部商品') + (st === 'used' ? ' · ' + (c.usedAt ? c.usedAt.slice(0, 10) + ' 使用' : '已使用') : ''),
      exp: st === 'used' ? (c.orderNo ? '订单 ' + c.orderNo : '已使用') : st === 'expired' ? '已于 ' + c.expire + ' 过期' : expText(c),
      stamp: st === 'used' ? '已使用' : st === 'expired' ? '已过期' : '',
      action: dead ? null : { label: '去使用', type: 'primary' },
      rules: rulesOf(c, tp),
    }
  }))

// ---------- 领券中心 ----------
const gotCount = (tp) => state.db.myCoupons.filter((c) => c.couponId === tp.id).length
function claimState(tp) {
  const got = gotCount(tp)
  if (tp.startAt && tp.startAt > todayStr()) return { k: 'soon', label: tp.startAt + ' 开抢', sub: diff(todayStr(), tp.startAt) + ' 天后 00:00 开放领取' }
  if (tp.claimed >= tp.stock) return { k: 'out', label: '已抢光', sub: '下次早点来' }
  if (got >= tp.perUser) return { k: 'got', label: '去使用', sub: '已领取 ' + got + ' 张（每人限领 ' + tp.perUser + ' 张）' }
  return { k: 'can', label: '立即领取', sub: '每人限领 ' + tp.perUser + ' 张' + (tp.stock - tp.claimed <= 100 ? '，仅剩 ' + (tp.stock - tp.claimed) + ' 张' : '') }
}
const claiming = ref(0)
const claimErr = reactive({})
// 排序只在打开页面和切到“领券中心”时算一次：领取成功或失败后，这张券留在原位，用户看得到结果
const isCenter = (t) => t.status === 'ON' && t.kind !== '兑换'
const rank = reactive({})
function resort() {
  const order = { can: 0, soon: 1, got: 2, out: 3 }
  state.db.coupons.filter(isCenter).map((tp) => [tp.id, order[claimState(tp).k]]).sort((a, b) => a[1] - b[1] || a[0] - b[0]).forEach(([id], i) => { rank[id] = i })
}
watch(tab, (t) => { if (t === 'center') resort() })
const centerTickets = computed(() => state.db.coupons.filter(isCenter)
  .sort((a, b) => (rank[a.id] ?? 999) - (rank[b.id] ?? 999) || a.id - b.id)
  .map((tp) => {
    const s = claimState(tp)
    return {
      key: 'c' + tp.id, kind: 'center', tpId: tp.id, name: tp.name, face: faceOf(tp), th: thText(tp, tp), dead: s.k === 'out' || s.k === 'soon', soon: false, fresh: false,
      err: claimErr[tp.id] || '', scope: tp.scope || '全部商品', exp: '领取后 ' + tp.days + ' 天内有效 · ' + s.sub,
      stamp: s.k === 'out' ? '已抢光' : '',
      action: { label: s.label, type: s.k === 'can' || s.k === 'got' ? 'primary' : 'default', plain: s.k === 'got', disabled: s.k === 'soon' || s.k === 'out' },
      rules: rulesOf({ ...tp, source: '领券中心' }, tp, tp.days),
    }
  }))

const tickets = computed(() => (tab.value === 'mine' ? mineTickets.value : centerTickets.value))
const emptyText = computed(() => (tab.value === 'center' ? '领券中心暂时没有券，新的券上架后会显示在这里' : seg.value === 'usable' ? '暂时没有可用的优惠券，领券中心每天更新' : seg.value === 'used' ? '还没有用过优惠券，用过的券会放在这里' : '没有过期的优惠券，过期的券会放在这里，超过 90 天自动清理'))

function grant(tp, source) {
  const db = state.db, t = todayStr()
  const nc = { id: db.myCoupons.reduce((m, x) => Math.max(m, x.id), 0) + 1, couponId: tp.id, name: tp.name, kind: tp.kind, threshold: tp.threshold, value: tp.value, expire: addD(t, tp.days), state: 'UNUSED', scope: tp.scope, got: t, source }
  db.myCoupons.unshift(nc); tp.claimed += 1
  return nc
}
const CLAIM_FAIL = {
  'claim-sold': () => '领取失败：这张券刚刚被抢光，没有放入你的账户。下次早点来，或先看看其他券。',
  'claim-limit': (tp) => '领取失败：已达到领取上限（每人限领 ' + tp.perUser + ' 张），没有再放入新的券。已领的券在“我的券”里可以直接使用。',
  'claim-daily': () => '领取失败：今天已经领过了，每天限领一次。明天再来领，已领的券在“我的券”里可以使用。',
  'claim-paused': () => '领取失败：这个活动暂时停止发放。已领的券不受影响，请稍后再看。',
}
async function claim(tpId) {
  const tp = state.db.coupons.find((x) => x.id === tpId)
  if (!tp || claiming.value) return
  claiming.value = tp.id; claimErr[tp.id] = ''
  const forced = CLAIM_FAIL[scene.value]
  try {
    await request(600, { fail: forced ? new Error(forced(tp)) : undefined })
    if (tp.claimed >= tp.stock) throw new Error('领取失败：这张券已经被抢光，没有放入你的账户。')
    if (gotCount(tp) >= tp.perUser) throw new Error('领取失败：已达到领取上限（每人限领 ' + tp.perUser + ' 张）。')
    const nc = grant(tp, '领券中心')
    flashId.value = nc.id
    toast('领取成功，已放入“可用”', 'success')
  } catch (e) {
    claimErr[tp.id] = e.message.startsWith('领取失败') ? e.message : '领取失败：' + e.message + '。券没有领到，检查网络后可以再点一次“立即领取”。'
    if (scene.value === 'claim-sold') tp.claimed = tp.stock
  } finally { claiming.value = 0 }
}
function act(t) {
  if (t.kind === 'center' && t.action.label === '立即领取') return claim(t.tpId)
  toTab('menu')
}

// ---------- 使用规则（每张券一条折叠） ----------
const openRules = ref([])
const setRules = (key, v) => { openRules.value = v.length ? [...openRules.value.filter((k) => k !== key), key] : openRules.value.filter((k) => k !== key) }

// ---------- 兑换码 ----------
const code = ref('')
const codeErr = ref('')
const redeeming = ref(false)
const fails = ref(0)
const lockUntil = ref(0)
const nowMs = ref(Date.now())
let timer = 0
const lockLeft = computed(() => Math.max(0, Math.ceil((lockUntil.value - nowMs.value) / 1000)))
const locked = computed(() => lockLeft.value > 0)
function startLock(sec) {
  lockUntil.value = Date.now() + sec * 1000; nowMs.value = Date.now()
  clearInterval(timer)
  timer = setInterval(() => { nowMs.value = Date.now(); if (lockUntil.value <= nowMs.value) { clearInterval(timer); fails.value = 0 } }, 1000)
}
watch(scene, (s) => { if (s === 'redeem-locked' && !locked.value) startLock(45) }, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))
watch(code, () => { if (!redeeming.value) codeErr.value = '' })
const fieldError = computed(() => (locked.value ? '输错次数过多，请 ' + lockLeft.value + ' 秒后再试，等待期间不能兑换' : codeErr.value))

async function redeem() {
  if (locked.value || redeeming.value) return
  codeErr.value = ''
  const raw = code.value.trim().toUpperCase().replace(/[\s-]/g, '')
  if (!/^[A-Z0-9]{6,16}$/.test(raw)) { codeErr.value = raw ? '兑换码由 6 到 16 位字母或数字组成，请检查后重新输入' : '请输入兑换码'; return }
  redeeming.value = true
  try { await request(700) } catch (e) { redeeming.value = false; codeErr.value = '兑换没有成功：' + e.message + '，兑换码没有被使用，请检查网络后再试'; return }
  redeeming.value = false
  const e = state.db.redeemCodes?.[raw]
  const bad = (text) => {
    fails.value += 1; codeErr.value = text
    if (fails.value >= 5) { startLock(60); codeErr.value = '' }
  }
  if (!e) return bad('兑换码不存在，请核对后重新输入')
  if (e.st === 'used') return bad('这个兑换码已经兑换过了，每个码只能兑换一次')
  if (e.st === 'expired') return bad('这个兑换码已过期，不能再兑换')
  const tp = state.db.coupons.find((x) => x.seedKey === e.seedKey)
  if (!tp) return bad('这个兑换码对应的券已下架，不能兑换')
  const nc = grant(tp, '兑换码')
  e.st = 'used'; fails.value = 0; code.value = ''; seg.value = 'usable'; flashId.value = nc.id
  toast('兑换成功，已放入“可用”', 'success')
}
</script>

<template>
  <div class="mp-page cp">
    <MiniState :status="status" :rows="6" error-text="优惠券加载失败" @retry="load">
      <template #forbidden-action><van-button type="primary" round size="small" @click="go('login')">去登录</van-button></template>

      <van-tabs v-model:active="tab" :swipeable="false" class="top" aria-label="优惠券分类">
        <van-tab name="mine" title="我的券" />
        <van-tab v-if="centerOn" name="center" title="领券中心" />
      </van-tabs>

      <template v-if="tab === 'mine'">
        <van-cell-group inset>
          <van-field v-model="code" class="fld" label="兑换码" placeholder="输入兑换码" maxlength="20" clearable autocomplete="off" autocapitalize="characters" :error-message="fieldError" @keyup.enter="redeem">
            <template #button><van-button size="small" type="primary" :loading="redeeming" :disabled="locked" @click="redeem">兑换</van-button></template>
          </van-field>
        </van-cell-group>
        <div class="muted hint">演示：WELCOME5 可兑换，USED2026 已兑换，OLD2025 已过期</div>
        <van-tabs v-model:active="seg" :swipeable="false" class="top" aria-label="优惠券状态">
          <van-tab v-for="s in SEGS" :key="s[0]" :name="s[0]" :title="s[1] + ' ' + counts[s[0]]" />
        </van-tabs>
        <van-notice-bar v-if="seg === 'usable' && soonCount" class="warn" left-icon="warning-o" wrapable :scrollable="false" :text="soonCount + ' 张券 2 天内到期，记得在到期前使用'" />
      </template>
      <div v-else class="muted hint">领取后自动放入“我的券”，下单时系统会选出最省的一张</div>

      <MiniState v-if="!tickets.length" status="empty" :empty-text="emptyText">
        <template #empty-action>
          <van-button v-if="tab === 'mine' && seg === 'usable' && centerOn" round type="primary" size="small" @click="tab = 'center'">去领券</van-button>
          <van-button v-else-if="tab === 'center'" round plain type="primary" size="small" @click="tab = 'mine'">看看我的券</van-button>
        </template>
      </MiniState>

      <article v-for="t in tickets" :key="t.key" class="tk" :class="{ dead: t.dead, soon: t.soon, fresh: t.fresh, stamped: t.stamp }" :aria-label="t.name">
        <div class="tk-main">
          <div class="tk-l">
            <span v-if="t.face.text" class="tk-v">{{ t.face.text }}</span>
            <span v-else class="tk-v num"><span v-if="t.face.pre" class="tk-u">{{ t.face.pre }}</span>{{ t.face.num }}<span v-if="t.face.unit" class="tk-u">{{ t.face.unit }}</span></span>
            <span class="tk-th">{{ t.th }}</span>
          </div>
          <div class="tk-r">
            <div class="tk-name">{{ t.name }}<van-tag v-if="t.fresh" type="primary" plain class="tk-tag">新到账</van-tag></div>
            <div class="muted">{{ t.scope }}</div>
            <div class="tk-exp" :class="{ hot: t.soon }">{{ t.exp }}</div>
            <div v-if="t.action" class="tk-act">
              <van-button size="small" round :type="t.action.type" :plain="t.action.plain" :disabled="t.action.disabled" :loading="claiming === t.tpId" :aria-label="t.action.label + '：' + t.name" @click="act(t)">{{ t.action.label }}</van-button>
            </div>
          </div>
          <van-tag v-if="t.stamp" plain class="tk-stamp">{{ t.stamp }}</van-tag>
        </div>
        <div v-if="t.err" class="tk-err" role="alert"><van-icon name="warning-o" /><span>{{ t.err }}</span></div>
        <van-collapse :model-value="openRules.includes(t.key) ? [t.key] : []" :border="false" @update:model-value="(v) => setRules(t.key, v)">
          <van-collapse-item title="使用规则" :name="t.key">
            <van-cell v-for="r in t.rules" :key="r[0]" :title="r[0]" :label="r[1]" :border="false" />
          </van-collapse-item>
        </van-collapse>
      </article>
    </MiniState>
  </div>
</template>

<style scoped>
.top { border-radius: var(--luz-radius-card); overflow: hidden; }
.hint { padding: 0 4px; }
.fld { --van-cell-line-height: 40px; }
.warn { border-radius: var(--luz-radius-card); --van-notice-bar-background: var(--luz-warning-tint); --van-notice-bar-text-color: var(--luz-warning); }

/* 券面：左边价值区，右边券名、范围、有效期与操作；已使用、已过期、已抢光的退后 */
.tk { position: relative; background: var(--van-background-2); border: 1px solid var(--luz-line); border-radius: var(--luz-radius-card); box-shadow: var(--luz-level-1); overflow: hidden; }
.tk.fresh { border-color: var(--luz-action); }
.tk-main { display: flex; align-items: stretch; }
.tk-l { flex: none; width: 104px; padding: 16px 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border-right: 1px dashed var(--luz-line); color: var(--luz-price); text-align: center; }
.tk-v { font-size: var(--t24); line-height: 32px; font-weight: 600; }
.tk-u { font-size: var(--t14); font-weight: 600; margin: 0 2px; }
.tk-th { font-size: var(--t14); line-height: 20px; color: var(--luz-ink-2); }
.tk-r { flex: 1 1 auto; min-width: 0; padding: 12px 12px 12px 14px; display: grid; gap: 2px; align-content: start; }
.tk-name { font-size: var(--t16); line-height: 22px; font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tk-exp { color: var(--luz-ink-2); }
.tk-exp.hot { color: var(--luz-warning); font-weight: 600; }
.tk-act { display: flex; justify-content: flex-end; margin-top: 6px; }
.tk-stamp { position: absolute; top: 10px; right: 10px; transform: rotate(8deg); }
.tk.dead .tk-l { color: var(--luz-ink-2); }
.tk.dead .tk-name { color: var(--luz-ink-2); }
.tk.stamped .tk-name { padding-right: 56px; }
.tk-err { display: flex; gap: 6px; padding: 8px 14px; color: var(--luz-danger); border-top: 1px solid var(--luz-line); }
.tk-err .van-icon { margin-top: 3px; flex: none; }
</style>
