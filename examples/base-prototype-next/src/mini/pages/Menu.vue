<script>
export const meta = {
  id: 'menu', label: '点单', title: '点单', group: '点单', tab: true, order: 4,
  layout: '主区加侧栏变体',
  reason: '点单是高频的核心任务：商品列表是主区，左边一条窄的分类栏当导航，两边联动；门店、搜索、券条压成顶部三行，购物车悬浮在底部不占版面',
  scenes: [
    { id: 'rest', label: '营业状态：休息中（只能浏览）' },
    { id: 'closed', label: '营业状态：已打烊（只能浏览）' },
    { id: 'paused', label: '营业状态：暂停营业（只能浏览）' },
    { id: 'allsoldout', label: '商品全部售罄' },
  ],
}
</script>

<script setup>
// Menu (a tab page): shop / search / coupon rows on top, the category rail (Vant sidebar) and the product list linked to each other,
// and the cart bar (Vant submit bar) above the tab bar. Specs are chosen in a bottom popup; adding goes through cart.js.
import { computed, onMounted, reactive, ref } from 'vue'
import { B } from '../../shared/data.js'
import { K, money } from '../../shared/format.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { useNav } from '../nav.js'
import { cart, addToCart, setQty, clearCart, cartCount, cartTotal, qtyOf } from '../cart.js'

const { go } = useNav()
const scene = useScene('menu')
const teleport = '#phone-overlay'
const toast = (message) => showToast({ message, teleport, duration: 1600 })

const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

// shop status: the scene (rest / closed / paused) wins over the global one in the demo panel
const [openAt, closeAt] = B.shop.hours.split(/[–-]/).map((s) => s.trim())
const SHOP = {
  open: { type: 'success', label: '营业中', hint: '营业至 ' + closeAt },
  rest: { type: 'warning', label: '休息中', hint: openAt + ' 开始营业' },
  closed: { type: 'default', label: '已打烊', hint: '明天 ' + openAt + ' 营业' },
  paused: { type: 'warning', label: '暂停营业', hint: '临时暂停，预计 11:30 恢复' },
}
const status = computed(() => (['rest', 'closed', 'paused'].includes(scene.value) ? scene.value : state.shopStatus))
const shop = computed(() => SHOP[status.value])
const canOrder = computed(() => status.value === 'open')
const QUEUE = 3
const shopLine = computed(() => (canOrder.value ? '前方 ' + QUEUE + ' 单 · 约 ' + QUEUE * 3 + ' 分钟取餐' : shop.value.label + '，' + shop.value.hint))

// stock and buying rules: local demo seeds until the shared data carries them (state.db.buyRules is used when it does)
const STOCK = { 7: 0, 5: 3, 2: 6 }
const RULES = state.db.buyRules || { 9: { min: 2 }, 1: { limit: { n: 2, period: 'day' } }, 2: { max: 3 }, 11: { once: true } }
const stockOf = (p) => (p.id in STOCK ? STOCK[p.id] : p.stock)
const ruleOf = (p) => RULES[p.id] || {}
const bought = (pid, period) => {
  const today = K.ymd(B.NOW())
  return state.db.orders.filter((o) => o.userId === state.db.me.id && !['CANCELLED', 'REFUNDED'].includes(o.status) && (period === 'day' ? o.createdAt.slice(0, 10) === today : true))
    .reduce((s, o) => s + o.items.filter((i) => i.pid === pid).reduce((a, i) => a + i.qty, 0), 0)
}
const leftOf = (p) => { const r = ruleOf(p); if (r.once) return bought(p.id) > 0 ? 0 : 1; if (r.limit) return Math.max(0, r.limit.n - bought(p.id, r.limit.period)); return Infinity }
const capOf = (p) => Math.max(0, Math.min(stockOf(p), ruleOf(p).max || Infinity, leftOf(p)))
const minOf = (p) => ruleOf(p).min || 1
const roomOf = (p) => Math.max(0, capOf(p) - qtyOf(p.id))
function ruleTexts(p) {
  const r = ruleOf(p), out = []
  if (r.min > 1) out.push(r.min + ' 件起售')
  if (r.max) out.push('每单最多 ' + r.max + ' 件')
  if (r.once) out.push(bought(p.id) > 0 ? '每人限购 1 次，你已买过' : '每人限购 1 次')
  else if (r.limit) { const left = leftOf(p); out.push((r.limit.period === 'day' ? '每日限购 ' : '每人限购 ') + r.limit.n + ' 件，' + (left > 0 ? '还可买 ' + left + ' 件' : '已达上限')) }
  if (stockOf(p) > 0 && stockOf(p) <= 5) out.push('仅剩 ' + stockOf(p) + ' 件')
  return out
}
const pstate = (p) => (p.status !== 'ON' ? 'off' : scene.value === 'allsoldout' || stockOf(p) <= 0 ? 'soldout' : 'ok')
const tagsOf = (p) => [...(p.tags[0] ? [{ t: p.tags[0], hot: true }] : []), ...ruleTexts(p).map((t) => ({ t }))].slice(0, 2)       // marketing info stays within two tags
const extraOf = (p, sel) => (p.specs || []).reduce((s, g) => s + (g.opts.find((o) => o.n === sel[g.name])?.d || 0), 0)

// sections of the list: 热销 first (in stock, best selling), then the categories
const secs = computed(() => {
  const on = state.db.products.filter((p) => p.status === 'ON')
  const hotItems = scene.value === 'allsoldout' ? [] : on.filter((p) => stockOf(p) > 0).sort((a, b) => b.sales - a.sales).slice(0, 4)
  return [{ id: 'hot', name: '热销', sub: '大家都在点', items: hotItems }]
    .concat(B.CATS.filter((c) => c.id !== 'hot').map((c) => ({ id: c.id, name: c.name, items: state.db.products.filter((p) => p.cat === c.id && !hotItems.includes(p)).sort((a, b) => (a.status === 'ON' ? 0 : 1) - (b.status === 'ON' ? 0 : 1)) })))
    .filter((s) => s.items.length)
})
const viewState = computed(() => (phase.value !== 'ok' ? phase.value : secs.value.length ? 'ok' : 'empty'))
const countOf = (s) => s.items.reduce((n, p) => n + qtyOf(p.id), 0)

// the rail and the list follow each other
const active = ref(0)
const pane = ref(null)
const secEls = ref([])
let lockUntil = 0
function jump(i) { lockUntil = Date.now() + 600; pane.value?.scrollTo({ top: secEls.value[i].offsetTop, behavior: state.reducedMotion ? 'auto' : 'smooth' }) }
function onScroll() {
  if (Date.now() < lockUntil) return
  const el = pane.value, y = el.scrollTop + 8
  let cur = 0
  secEls.value.forEach((s, i) => { if (s && s.offsetTop <= y) cur = i })
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) cur = secEls.value.length - 1
  active.value = cur
}

// top rows
const couponOn = computed(() => state.db.config.runtime.find((c) => c.key === 'feature.coupon')?.value !== false && !state.hidden.coupons)
const usable = computed(() => { const today = K.ymd(B.NOW()); return state.db.myCoupons.filter((c) => c.state === 'UNUSED' && c.expire >= today) })
const daysTo = (ymd) => Math.round((new Date(ymd + 'T00:00:00') - K.today()) / 864e5)
const couponLine = computed(() => {
  const soon = usable.value.slice().sort((a, b) => (a.expire < b.expire ? -1 : 1))[0]
  return soon ? usable.value.length + ' 张优惠券可用 · ' + (daysTo(soon.expire) <= 0 ? '今天到期' : daysTo(soon.expire) + ' 天后到期') : ''
})

// the cart bar: the estimate takes the best coupon the cart already qualifies for, the tip says what is next
const worth = (c, sub) => (c.kind === '折扣' ? Math.min(state.db.coupons.find((x) => x.id === c.couponId)?.cap ?? Infinity, Math.floor((sub * (100 - c.value)) / 100)) : c.value)
const quote = computed(() => {
  const sub = cartTotal.value
  const coupon = usable.value.filter((c) => sub > 0 && sub >= c.threshold).sort((a, b) => worth(b, sub) - worth(a, sub))[0] || null
  const discount = coupon ? Math.min(sub, worth(coupon, sub)) : 0
  const next = usable.value.filter((c) => sub < c.threshold && c.threshold > 0).sort((a, b) => a.threshold - b.threshold)[0]
  return { sub, discount, pay: sub - discount, next: next ? { need: next.threshold - sub, name: next.name } : null }
})
const tip = computed(() => {
  if (!canOrder.value) return shop.value.label + '，只能浏览，' + shop.value.hint
  if (!cartCount.value) return '购物车是空的，先选几样吧'
  return quote.value.discount ? '已减 ' + money(quote.value.discount) + ' · 预估到手' : quote.value.next ? '再买 ' + money(quote.value.next.need) + ' 可用' + quote.value.next.name : '到店自取，无配送费'
})

// spec popup
const pick = reactive({ show: false, p: null, sel: {}, qty: 1, busy: false })
const pickUnit = computed(() => (pick.p ? pick.p.price + extraOf(pick.p, pick.sel) : 0))
const pickRoom = computed(() => (pick.p ? roomOf(pick.p) : 0))
const pickMin = computed(() => (pick.p ? minOf(pick.p) : 1))
const pickHint = computed(() => {
  const p = pick.p; if (!p) return ''
  const inCart = qtyOf(p.id), r = ruleOf(p), left = leftOf(p)
  if (pickRoom.value < pickMin.value) return left - inCart <= 0 ? '已达购买上限' : '库存不够了'
  const caps = [[stockOf(p), '库存不够了'], [r.max || Infinity, '每单最多 ' + r.max + ' 件'], [left, '已达购买上限']].filter((c) => c[0] !== Infinity).sort((x, y) => x[0] - y[0])
  if (caps[0] && pick.qty + inCart >= caps[0][0]) return caps[0][1] + (inCart ? '，购物车里已有 ' + inCart + ' 件' : '')
  if (pick.qty <= pickMin.value && pickMin.value > 1) return pickMin.value + ' 件起售'
  return ruleTexts(p).slice(0, 2).join('；')
})
function openPick(p) {
  pick.p = p
  pick.sel = Object.fromEntries((p.specs || []).map((g) => [g.name, g.opts[0].n]))
  const room = roomOf(p)
  pick.qty = room > 0 ? Math.min(Math.max(minOf(p), 1), room) : Math.max(minOf(p), 1)
  pick.show = true
}
async function confirmAdd() {
  pick.busy = true
  try {
    await request(80)
    addToCart(pick.p, { spec: Object.values(pick.sel).join(' / '), specExtra: extraOf(pick.p, pick.sel), qty: pick.qty })
    pick.show = false; toast('已加入购物车')
  } catch { toast('网络不太稳定，没有加入购物车，选好的规格还在，请重试') }
  pick.busy = false
}

// the cart popup: every line with a stepper, clear all
const cartOpen = ref(false)
const lineMax = (l) => { const p = state.db.products.find((x) => x.id === l.pid); return p ? Math.max(l.qty, capOf(p) - (qtyOf(l.pid) - l.qty)) : l.qty }
function changeQty(l, v) { setQty(l.key, Number(v)); if (!cart.lines.length) cartOpen.value = false }
function clearAll() {
  showConfirmDialog({ title: '清空购物车', message: '清空购物车里的 ' + cartCount.value + ' 件商品，清空后需要重新选购', confirmButtonText: '清空', confirmButtonColor: 'var(--luz-danger)', teleport })
    .then(() => { clearCart(); cartOpen.value = false; toast('已清空购物车') }, () => {})
}
const submit = () => go(state.role === 'guest' ? 'login' : 'checkout')       // a guest signs in first, then comes back here
</script>

<template>
  <div class="pg menu">
    <MiniState :status="viewState" empty-text="今天的菜单还没有上架" @retry="load">
      <template #empty-action><van-button round type="primary" plain size="small" @click="go('stores')">看看其他门店</van-button></template>

      <div class="top">
        <van-cell center :is-link="!state.hidden.stores" :value="state.hidden.stores ? '' : '换店'" class="shopcell" @click="!state.hidden.stores && go('stores')">
          <template #title><span class="shopname">{{ B.shop.name }}</span><van-tag round :type="shop.type" class="shoptag">{{ shop.label }}</van-tag></template>
          <template #label>{{ shopLine }}</template>
        </van-cell>
        <van-search v-if="!state.hidden.search" shape="round" placeholder="搜索菜品，例如牛腩饭" readonly class="entry" @click="go('search')" />
        <van-notice-bar v-if="couponOn && couponLine" mode="link" left-icon="coupon-o" :scrollable="false" :text="couponLine" @click="go('coupons')" />
      </div>

      <div class="body">
        <div class="rail">
          <van-sidebar v-model="active" @change="jump">
            <van-sidebar-item v-for="s in secs" :key="s.id" :title="s.name" :badge="countOf(s) || ''" />
          </van-sidebar>
        </div>
        <div ref="pane" class="pane" @scroll.passive="onScroll">
          <section v-for="(s, i) in secs" :key="s.id" :ref="(el) => (secEls[i] = el)" class="sec" :aria-label="s.name">
            <h2 class="sec-h">{{ s.name }}<span v-if="s.sub" class="muted"> {{ s.sub }}</span></h2>
            <van-card v-for="p in s.items" :key="p.id" :desc="p.desc" :thumb="p.img" @click="go('product', { id: p.id })">
              <template #title><span class="name">{{ p.name }}</span></template>
              <template v-if="pstate(p) !== 'ok'" #tag><van-tag type="default" mark>{{ pstate(p) === 'off' ? '已下架' : '已售罄' }}</van-tag></template>
              <template #tags><div v-if="tagsOf(p).length" class="tags"><van-tag v-for="g in tagsOf(p)" :key="g.t" plain :type="g.hot ? 'danger' : 'default'">{{ g.t }}</van-tag></div></template>
              <template #price>
                <div class="prow">
                  <MiniPrice :cents="p.price" :old="p.orig" />
                  <van-button v-if="pstate(p) !== 'ok'" size="small" round disabled>{{ pstate(p) === 'off' ? '已下架' : '已售罄' }}</van-button>
                  <van-button v-else-if="!canOrder" size="small" round disabled>暂未营业</van-button>
                  <van-badge v-else :content="qtyOf(p.id) || ''"><van-button size="small" round type="primary" @click.stop="openPick(p)">选规格</van-button></van-badge>
                </div>
              </template>
            </van-card>
          </section>
          <p class="end muted">没有更多了</p>
        </div>
      </div>

      <van-submit-bar :price="quote.pay" button-type="primary" :button-text="canOrder ? '去结算' : '暂未营业'" :disabled="!canOrder || !cartCount" :tip="tip" tip-icon="info-o" placeholder @submit="submit">
        <van-badge :content="cartCount || ''"><van-button icon="shopping-cart-o" round plain type="primary" aria-label="查看已选商品" @click="cartOpen = true" /></van-badge>
      </van-submit-bar>
    </MiniState>

    <van-popup v-model:show="pick.show" position="bottom" round closeable class="pg-pop">
      <div v-if="pick.p" class="pick">
        <div class="pick-head">
          <van-image :src="pick.p.img" fit="cover" width="72" height="72" radius="8" :alt="pick.p.name" />
          <div class="grow">
            <h3 class="h">{{ pick.p.name }}</h3>
            <MiniPrice :cents="pickUnit * pick.qty" :size="18" />
            <p class="muted">已选 {{ Object.values(pick.sel).join(' / ') }}</p>
          </div>
        </div>
        <div v-for="g in pick.p.specs" :key="g.name" class="sgroup">
          <h4 class="sh">{{ g.name }}</h4>
          <div class="chips" role="group" :aria-label="g.name">
            <van-badge v-for="(o, i) in g.opts" :key="o.n" :content="i === 0 ? '推荐' : ''" :offset="[-8, 6]">
              <van-button :type="pick.sel[g.name] === o.n ? 'primary' : 'default'" :aria-pressed="pick.sel[g.name] === o.n" @click="pick.sel[g.name] = o.n">{{ o.n }}<template v-if="o.d"> +{{ money(o.d) }}</template></van-button>
            </van-badge>
          </div>
        </div>
        <van-cell center class="qty">
          <template #title>数量</template>
          <template #label>{{ pickHint }}</template>
          <template #value><van-stepper v-model="pick.qty" theme="round" :min="pickMin" :max="Math.max(pickRoom, pickMin)" integer :disabled="pickRoom < pickMin" /></template>
        </van-cell>
        <van-button type="primary" block round :loading="pick.busy" :disabled="pickRoom < pickMin" @click="confirmAdd">{{ pickRoom < pickMin ? pickHint : '加入购物车' }}</van-button>
      </div>
    </van-popup>

    <van-popup v-model:show="cartOpen" position="bottom" round closeable class="pg-pop">
      <div class="cartp">
        <h3 class="h">已选商品<span class="muted"> 共 {{ cartCount }} 件</span></h3>
        <van-empty v-if="!cart.lines.length" description="购物车是空的" image-size="80" />
        <van-cell-group v-else>
          <van-cell v-for="l in cart.lines" :key="l.key" center>
            <template #title><span class="name">{{ l.name }}</span></template>
            <template #label>{{ l.spec || '默认规格' }} · <MiniPrice :cents="l.price * l.qty" :size="14" /></template>
            <template #value><van-stepper :model-value="l.qty" theme="round" :min="0" :max="lineMax(l)" integer @change="(v) => changeQty(l, v)" /></template>
          </van-cell>
        </van-cell-group>
        <van-button v-if="cart.lines.length" plain block round type="default" icon="delete-o" @click="clearAll">清空购物车</van-button>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.pg, .pg-pop {
  --van-tag-font-size: var(--van-font-size-sm); --van-tag-line-height: 20px; --van-tag-default-color: var(--luz-ink-2);
  --van-badge-font-size: var(--van-font-size-sm); --van-badge-font: var(--luz-font);
  --van-button-small-height: 40px; --van-button-small-font-size: var(--van-font-size-sm);
  --van-card-font-size: var(--van-font-size-md); --van-card-padding: 10px 12px; --van-card-background: var(--van-background-2); --van-card-price-font: var(--luz-font);
  --van-card-title-line-height: 20px; --van-card-origin-price-font-size: var(--van-font-size-sm);
  --van-cell-label-font-size: var(--van-font-size-sm); --van-cell-label-line-height: 20px;
  --van-stepper-input-height: 40px; --van-stepper-input-width: 44px; --van-stepper-input-font-size: var(--van-font-size-md);
  --van-submit-bar-price-font: var(--luz-font); --van-submit-bar-price-font-size: var(--van-font-size-sm); --van-submit-bar-price-color: var(--luz-price); --van-submit-bar-price-integer-font-size: 18px;
  --van-submit-bar-tip-font-size: var(--van-font-size-sm); --van-submit-bar-tip-color: var(--luz-warning); --van-submit-bar-tip-background: var(--luz-warning-tint);
  --van-submit-bar-button-height: 40px; --van-submit-bar-button-width: 120px;
  --van-sidebar-width: 88px; --van-sidebar-font-size: var(--van-font-size-md);
  --van-notice-bar-font-size: var(--van-font-size-md);
}
.menu { height: 100%; display: flex; flex-direction: column; contain: layout; }   /* contain: the fixed cart bar is placed in the page area, above the shell's tab bar */
.top { flex: none; background: var(--van-background-2); }
.shopname { font-weight: 600; margin-right: 8px; }
.shoptag { vertical-align: 1px; }
.entry { --van-cell-line-height: 40px; --van-search-input-height: 40px; }
.body { flex: 1 1 0; min-height: 0; display: flex; background: var(--van-background-2); }
.rail { flex: none; display: flex; background: var(--van-background); }
.pane { flex: 1 1 auto; min-width: 0; position: relative; overflow-y: auto; }
.sec-h { margin: 0; padding: 12px 12px 4px; font-size: var(--t16); line-height: 22px; font-weight: 600; }
.sec-h .muted { font-weight: 400; }
.name { font-weight: 600; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; }
.prow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.prow :deep(.price small), .prow :deep(.price-old), .pick :deep(.price small), .cartp :deep(.price small) { font-size: var(--t14); }   /* MiniPrice's 12 px parts, kept at the 14 px floor of the audit */
.end { margin: 0; padding: 16px 0 24px; text-align: center; }
.pick, .cartp { display: grid; gap: 12px; padding: 20px 16px 16px; }
.pick-head { display: flex; gap: 12px; align-items: flex-start; padding-right: 32px; }
.pick-head p { margin: 4px 0 0; }
.h { margin: 0; font-size: var(--t16); line-height: 22px; font-weight: 600; }
.sh { margin: 0 0 8px; font-size: var(--t16); line-height: 22px; font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 12px; }
.qty { padding-left: 0; padding-right: 0; }
</style>
