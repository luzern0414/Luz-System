<script>
// 购卡（主次布局）：在售的第一张是主角，其余是紧凑行；限购与预付限额就近写在按钮旁，规则折叠在各卡里。
export const meta = {
  id: 'cards', label: '购卡', title: '购卡', group: '会员与资产', order: 1,
  layout: '主次布局',
  reason: '购卡是挑一张合适的卡：在售的第一张放大成主角（价格、权益、购买），其余收成紧凑行，规则折叠在行内；限额与限购就近写在按钮旁，不在页面顶部堆提示',
  scenes: [
    { id: 'prepaid-over', label: '预付限额：超过单张上限' }, { id: 'prepaid-stopped', label: '暂停收取预付款：不能购买' }, { id: 'rest', label: '营业状态：休息中（可买，营业后使用）' },
    { id: 'paused', label: '营业状态：暂停营业（不能购买）' }, { id: 'pay-cancel', label: '支付：用户取消' }, { id: 'pay-fail', label: '支付：银行卡余额不足' }, { id: 'pay-timeout', label: '支付：确认超时' },
  ],
}
</script>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { K, money } from '../../shared/format.js'
import { useNav } from '../nav.js'
import { PREPAID, featureOn, today, addD, toDate, ruleOf, rulesOf, myCards, isHeld, prepaidHeld, logCard, pushNotice, spendBalance, payWx, say } from './CardDetail.vue'

const { go, replace, back } = useNav()
const scene = useScene('cards')
const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

const guest = computed(() => state.role === 'guest')
const money0 = (c) => '¥' + (c / 100).toLocaleString('zh-CN')
const types = computed(() => state.db.cardTypes)
const onSale = computed(() => types.value.filter((t) => t.status === 'ON'))
const ordered = computed(() => onSale.value.concat(types.value.filter((t) => t.status !== 'ON')))
const status = computed(() => (phase.value !== 'ok' ? phase.value : types.value.length ? 'ok' : 'empty'))

/* ---------- 营业状态、预付限额、能不能买 ---------- */
const shop = computed(() => (scene.value === 'rest' ? 'rest' : scene.value === 'paused' ? 'paused' : state.shopStatus))
const stopped = computed(() => scene.value === 'prepaid-stopped' || !featureOn('feature.card'))
const cardCap = computed(() => (scene.value === 'prepaid-over' ? 15000 : PREPAID.cardCap))
const held = computed(() => (guest.value ? 0 : prepaidHeld()))
const limitText = computed(() => '预付限额：单张不超过 ' + money0(cardCap.value) + '，会员卡与储值合计不超过 ' + money0(PREPAID.totalCap) + (guest.value ? '' : '，你目前持有约 ' + money(held.value)))
const banner = computed(() => {
  if (stopped.value) return { bad: true, text: '门店已暂停收取预付款，会员卡和储值暂时不能购买；已有的卡和余额可以照常使用。' }
  if (shop.value === 'paused') return { bad: true, text: '门店暂停营业，暂时不能购卡，恢复营业后再来。' }
  if (shop.value === 'rest' || shop.value === 'closed') return { bad: false, text: '现在是' + (shop.value === 'rest' ? '休息中' : '已打烊') + '时间，可以先买，营业后到店使用。' }
  return null
})
function buyState(ty) {
  if (shop.value === 'paused') return { ok: false, label: '暂停营业', why: '门店暂停营业，暂时不能购买' }
  if (stopped.value) return { ok: false, label: '暂停售卖', why: '门店已暂停收取预付款，已有的卡和余额不受影响' }
  if (ty.status !== 'ON') return { ok: false, label: '暂停销售', why: '这个卡种暂时不卖，已持有的卡不受影响' }
  const n = guest.value ? 0 : myCards().filter((c) => c.typeId === ty.id && isHeld(c)).length, lim = ruleOf(ty).limit
  if (!guest.value && n >= lim) return { ok: false, label: '已达限购', why: '每人限购 ' + lim + ' 张，你已持有 ' + n + ' 张（含未生效的卡）', n }
  if (ty.price > cardCap.value) return { ok: false, label: '超过限额', why: '单张预付卡不能超过 ' + money0(cardCap.value) + '，这张卡 ' + money0(ty.price), n }
  if (held.value + ty.price > PREPAID.totalCap) return { ok: false, label: '超过限额', why: '购买后预付余额合计 ' + money(held.value + ty.price) + '，超过上限 ' + money0(PREPAID.totalCap) + '；目前还能买 ' + money(Math.max(0, PREPAID.totalCap - held.value)), n }
  return { ok: true, n }
}
const rows = computed(() => ordered.value.map((ty, i) => {
  const bs = buyState(ty), x = ruleOf(ty)
  return { ty, bs, x, hero: i === 0 && ty.status === 'ON', limit: bs.ok ? '每人限购 ' + x.limit + ' 张' + (bs.n ? '，已持有 ' + bs.n + ' 张' : '') : bs.why, perks: [x.slot ? x.slot + ' 可用' : '全天可用', x.freeze ? '可请假冻结' : '不可冻结', x.transfer ? '可转让' : '不可转让'], rules: rulesOf(ty) }
}))
const restStart = computed(() => rows.value.findIndex((r) => !r.hero))
const iconOf = (ty) => (ty.kind === '次卡' ? 'coupon-o' : ty.kind === '时段卡' ? 'clock-o' : 'vip-card-o')
const open = reactive({})

/* ---------- 购买：生效方式、支付方式、条款 ---------- */
const buying = ref(null)
const sel = reactive({ effect: 'now', date: '', pay: 'wx', agree: false, err: '', busy: false })
const popupOpen = computed({ get: () => !!buying.value, set: (x) => { if (!x) buying.value = null } })
const termsOpen = ref([])
const dateCal = ref(false)
const tomorrow = computed(() => toDate(addD(today(), 1)))
const in30 = computed(() => toDate(addD(today(), 30)))
const startOf = () => (sel.effect === 'now' ? today() : sel.date)
const balanceOk = computed(() => !!buying.value && state.db.me.balance >= buying.value.price)
const balanceLabel = computed(() => (balanceOk.value ? '可用 ' + money(state.db.me.balance) : '余额不足，还差 ' + money(buying.value.price - state.db.me.balance)))
const preview = computed(() => {
  if (!buying.value) return ''
  const s = startOf()
  return (sel.effect === 'now' ? '付款后立即生效，' : s + ' 零点生效，') + '有效期至 ' + addD(s, buying.value.days) + '（共 ' + buying.value.days + ' 天，生效当天算第 1 天）'
})
function openBuy(ty) {
  if (guest.value) return go('login')
  Object.assign(sel, { effect: 'now', date: addD(today(), 1), pay: 'wx', agree: false, err: '', busy: false })
  termsOpen.value = []; buying.value = ty
}
const onDate = (d) => { sel.date = K.ymd(d); dateCal.value = false; sel.err = '' }
const nextId = (list) => list.reduce((m, x) => Math.max(m, x.id), 0) + 1

/** 发卡：写 state.db.cards、扣次记录、消息；返回新卡 */
function issue(ty, start, payBy) {
  const db = state.db, me = db.me, id = nextId(db.cards)
  const c = { id, no: 'C' + (20260000 + id * 53), userId: me.id, userName: me.name, typeId: ty.id, typeName: ty.name, kind: ty.kind, bought: today(), start, expire: addD(start, ty.days), total: ty.times ? ty.times + ty.gift : 0, used: 0, status: 'ACTIVE', frozenDays: 0, slot: ty.slot || '', price: ty.price, pay: payBy === 'balance' ? '储值' : '线上', transfers: 0, frozenTotal: 0, freezeCount: 0 }
  db.cards.unshift(c)
  logCard(c, '开卡', '购买' + ty.name + '，' + (payBy === 'balance' ? '储值余额' : '微信') + '支付 ' + money(ty.price))
  pushNotice('会员卡', '开卡成功', '您已成功购买' + ty.name + (start > today() ? '，将于 ' + start + ' 生效。' : '，立即生效，有效期至 ' + c.expire + '。'), { page: 'card-detail', params: { id } })
  return c
}
async function submit() {
  const ty = buying.value
  sel.err = ''
  if (sel.effect === 'date' && (!sel.date || sel.date <= today() || sel.date > addD(today(), 30))) { sel.err = '生效日期要在明天到 30 天内'; return }
  const bs = buyState(ty)
  if (!bs.ok) { sel.err = bs.why; return }
  sel.busy = true
  if (sel.pay === 'balance') {
    try { await request(700); spendBalance(ty.price, '购买' + ty.name) } catch (e) { sel.err = '支付没有完成：' + e.message; sel.busy = false; return }
  } else {
    const res = await payWx(scene.value, { amount: ty.price, subject: '购买' + ty.name })
    if (!res.ok) { sel.err = '支付没有完成：' + res.reason + '。订单已保留，点“确认并支付”可以继续。'; sel.busy = false; return }
  }
  const c = issue(ty, startOf(), sel.pay)
  sel.busy = false; buying.value = null
  say('开卡成功', 'success')
  replace('my-cards', { seg: c.start > today() ? 'pending' : 'active', flash: c.id })
}
</script>

<template>
  <div class="mp-page">
    <MiniState :status="status" empty-text="暂时没有在售的会员卡，上架后会显示在这里" @retry="load">
      <template #empty-action><van-button round type="primary" @click="back()">返回</van-button></template>

      <van-notice-bar left-icon="shield-o" :text="limitText" :scrollable="false" wrapable class="notice" />
      <van-notice-bar v-if="banner" :left-icon="banner.bad ? 'warning-o' : 'info-o'" :text="banner.text" :scrollable="false" wrapable :class="banner.bad ? 'notice-bad' : 'notice'" />

      <template v-for="(r, i) in rows" :key="r.ty.id">
        <!-- 主角：在售的第一张卡，次数或天数放大 -->
        <section v-if="r.hero" class="brand-card" :aria-label="r.ty.name">
          <div class="brand-top"><span class="brand-name">{{ r.ty.name }}</span><van-tag round color="var(--luz-on-action)" text-color="var(--luz-action)">{{ r.ty.kind }}</van-tag></div>
          <div class="brand-hero"><span>{{ r.ty.times ? '共' : '有效' }}</span><b class="num brand-n">{{ r.ty.times ? r.ty.times + r.ty.gift : r.ty.days }}</b><span>{{ r.ty.times ? '次' : '天' }}</span><span v-if="r.ty.gift" class="brand-gift">含赠送 {{ r.ty.gift }} 次</span></div>
          <div class="brand-sub"><span>{{ r.ty.times ? r.ty.days + ' 天内用完' : '到期自动失效' }}</span><span>{{ r.x.scope }}</span></div>
        </section>
        <h2 v-else-if="i === restStart" class="sec">更多卡种<span class="muted">{{ rows.length - restStart }} 种</span></h2>

        <van-cell-group inset>
          <van-cell center :title="r.hero ? r.ty.desc : undefined" :label="r.hero ? undefined : r.ty.desc">
            <template v-if="!r.hero" #icon><van-icon :name="iconOf(r.ty)" class="type-ic" /></template>
            <template v-if="!r.hero" #title><span class="t-name">{{ r.ty.name }}</span></template>
            <template #value><MiniPrice :cents="r.ty.price" :old="r.x.orig" :size="r.hero ? 22 : 16" /></template>
          </van-cell>
          <van-cell v-if="r.hero">
            <template #title><span class="perks"><van-tag v-for="p in r.perks" :key="p" plain type="primary">{{ p }}</van-tag></span></template>
          </van-cell>
          <van-cell center :class="{ bad: !r.bs.ok }" :title="r.limit">
            <template #right-icon><van-button class="buy" round :type="r.bs.ok ? 'primary' : 'default'" :disabled="!r.bs.ok" :aria-label="(r.bs.ok ? '购买' : r.bs.label + '：') + r.ty.name" @click="openBuy(r.ty)">{{ r.bs.ok ? '立即购买' : r.bs.label }}</van-button></template>
          </van-cell>
          <van-collapse :model-value="open[r.ty.id] || []" @update:model-value="(x) => (open[r.ty.id] = x)">
            <van-collapse-item title="使用规则" :name="'r' + r.ty.id">
              <van-cell-group :border="false"><van-cell v-for="[k, t] in r.rules" :key="k" :title="k" :label="t" /></van-cell-group>
            </van-collapse-item>
          </van-collapse>
        </van-cell-group>
      </template>

      <p class="foot muted">购买前请阅读各卡的使用规则；七日内未使用可全额退，其余按条款折算。</p>
    </MiniState>

    <!-- 确认购买 -->
    <van-popup v-model:show="popupOpen" position="bottom" round class="sheet-popup" :close-on-click-overlay="!sel.busy">
      <div v-if="buying" class="sheet">
        <h2 class="sheet-title">确认购买</h2>
        <div class="sheet-body">
        <van-cell-group inset>
          <van-cell center :title="buying.name" :label="buying.desc"><template #value><MiniPrice :cents="buying.price" :size="18" /></template></van-cell>
        </van-cell-group>

        <van-cell-group inset title="生效方式">
          <van-radio-group v-model="sel.effect">
            <van-cell title="立即生效" label="付款后马上可以使用" clickable @click="sel.effect = 'now'"><template #right-icon><van-radio name="now" /></template></van-cell>
            <van-cell title="指定日期生效" label="提前买，到日期当天零点生效" clickable @click="sel.effect = 'date'"><template #right-icon><van-radio name="date" /></template></van-cell>
          </van-radio-group>
          <van-cell v-if="sel.effect === 'date'" title="生效日期" is-link :value="sel.date" @click="dateCal = true" />
          <van-cell :title="preview" />
        </van-cell-group>

        <van-cell-group inset title="支付方式">
          <van-radio-group v-model="sel.pay">
            <van-cell title="微信支付" icon="wechat-pay" clickable @click="sel.pay = 'wx'"><template #right-icon><van-radio name="wx" /></template></van-cell>
            <van-cell title="储值余额" icon="balance-o" :label="balanceLabel" :clickable="balanceOk" :class="{ off: !balanceOk }" @click="balanceOk && (sel.pay = 'balance')"><template #right-icon><van-radio name="balance" :disabled="!balanceOk" /></template></van-cell>
          </van-radio-group>
        </van-cell-group>

        <van-cell-group inset>
          <van-collapse v-model="termsOpen">
            <van-collapse-item title="预付卡条款与退款规则" name="terms">
              <van-cell-group :border="false"><van-cell v-for="[k, t] in rulesOf(buying)" :key="k" :title="k" :label="t" /></van-cell-group>
              <p class="foot muted">购买即表示卡内保存本次条款快照；条款以购买时的版本为准。</p>
            </van-collapse-item>
          </van-collapse>
          <van-cell center label="请主动勾选，不会默认同意">
            <template #title><van-checkbox v-model="sel.agree" shape="square">我已阅读并同意《预付卡条款与退款规则》</van-checkbox></template>
          </van-cell>
        </van-cell-group>

        </div>
        <van-notice-bar v-if="sel.err" class="alert-bad" left-icon="warning-o" wrapable :scrollable="false" :text="sel.err" />
        <div class="sheet-foot">
          <van-button block plain :disabled="sel.busy" @click="buying = null">取消</van-button>
          <van-button block type="primary" :loading="sel.busy" :disabled="!sel.agree" @click="submit">确认并支付 {{ money(buying.price) }}</van-button>
        </div>
      </div>
    </van-popup>

    <van-calendar :show-mark="false" :closeable="false" v-model:show="dateCal" title="选择生效日期" :min-date="tomorrow" :max-date="in30" color="var(--luz-action)" confirm-text="确定" @confirm="onDate" />
  </div>
</template>

<style scoped>
.mp-page { --van-calendar-confirm-button-height: 44px; --van-cell-group-inset-title-padding: 12px 4px 4px; padding-bottom: 32px; }
.notice { border-radius: var(--luz-radius-card); }
.notice-bad { --van-notice-bar-background: var(--luz-warning-tint); --van-notice-bar-text-color: var(--luz-warning); border-radius: var(--luz-radius-card); }
.brand-card { padding: 16px; border-radius: var(--luz-radius-card); background: var(--luz-action); color: var(--luz-on-action); box-shadow: var(--luz-level-2); }
.brand-top, .brand-sub { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.brand-name { font-size: var(--t18); line-height: 26px; font-weight: 600; }
.brand-hero { display: flex; align-items: baseline; gap: 6px; margin: 12px 0; }
.brand-n { font-size: var(--t40); line-height: 48px; font-weight: 700; }
.brand-gift { margin-left: auto; }
.brand-sub { font-size: var(--t14); }
.sec { margin: 4px 4px 0; display: flex; justify-content: space-between; align-items: baseline; font-size: var(--t16); line-height: 22px; font-weight: 600; }
.sec .muted { font-weight: 400; }
.t-name { font-size: var(--t16); font-weight: 600; }
.type-ic { margin-right: 12px; font-size: 22px; color: var(--luz-action-text); align-self: center; }
.perks { display: flex; flex-wrap: wrap; gap: 8px; }
.buy { flex: none; margin-left: 12px; }
.bad { --van-cell-text-color: var(--luz-danger); }
.off { --van-cell-text-color: var(--luz-ink-3); }
.foot { margin: 0; padding: 8px 16px 0; }
.sheet-popup { display: flex; flex-direction: column; max-height: 86%; }
.sheet { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; gap: 12px; padding: 20px 0 16px; }
.sheet-body { display: grid; grid-auto-rows: max-content; gap: 12px; align-content: start; overflow-y: auto; min-height: 0; }
.sheet-title { margin: 0; padding: 0 16px; font-size: var(--t18); line-height: 26px; font-weight: 600; }
.sheet-foot { display: flex; gap: 12px; padding: 4px 16px 0; }
.alert-bad { --van-notice-bar-background: var(--luz-danger-tint); --van-notice-bar-text-color: var(--luz-danger); margin: 0 16px; border-radius: var(--luz-radius-control); }
</style>
