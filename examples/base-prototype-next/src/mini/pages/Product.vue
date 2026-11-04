<script>
export const meta = {
  id: 'product', label: '商品详情', title: '商品详情', group: '点单', order: 5,
  layout: '主次布局',
  reason: '一张大图的图集是主角，占首屏一半以上；名称价格紧跟其后，规格、介绍、评价是次要的小块，往下才看；底部固定栏只有一个主操作“立即购买”',
  scenes: [
    { id: 'soldout', label: '已售罄' },
    { id: 'off', label: '已下架' },
    { id: 'limit', label: '已达购买上限' },
    { id: 'rest', label: '营业状态：休息中' },
    { id: 'closed', label: '营业状态：已打烊' },
    { id: 'paused', label: '营业状态：暂停营业' },
    { id: 'noreview', label: '还没有评价' },
  ],
}
</script>

<script setup>
// Product detail (opened with ?id=): the gallery is the main thing, then price and name, specs, intro and reviews; the action bar at the bottom.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { B } from '../../shared/data.js'
import { K, money } from '../../shared/format.js'
import { state, useScene } from '../../shared/state.js'
import { request } from '../../shared/request.js'
import { useNav } from '../nav.js'
import { addToCart, cartCount, qtyOf } from '../cart.js'

const route = useRoute()
const { go, back } = useNav()
const scene = useScene('product')
const teleport = '#phone-overlay'
const toast = (message) => showToast({ message, teleport, duration: 1600 })

const phase = ref('loading')
async function load() { phase.value = 'loading'; try { await request(400); phase.value = 'ok' } catch { phase.value = 'error' } }
onMounted(load)

const p = computed(() => state.db.products.find((x) => x.id === Number(route.query.id || 1)))
const viewState = computed(() => (phase.value !== 'ok' ? phase.value : p.value ? 'ok' : 'empty'))
const pics = computed(() => {
  const list = state.db.products, i = list.findIndex((x) => x.id === p.value.id), n = list.length
  return [p.value.img, list[(i + 1) % n].img, list[(i + 5) % n].img]
})

// shop status: the scene (rest / closed / paused) wins over the global one in the demo panel
const [openAt, closeAt] = B.shop.hours.split(/[–-]/).map((s) => s.trim())
const SHOP = {
  open: { label: '营业中', hint: '营业至 ' + closeAt },
  rest: { label: '休息中', hint: openAt + ' 开始营业' },
  closed: { label: '已打烊', hint: '明天 ' + openAt + ' 营业' },
  paused: { label: '暂停营业', hint: '临时暂停，预计 11:30 恢复' },
}
const status = computed(() => (['rest', 'closed', 'paused'].includes(scene.value) ? scene.value : state.shopStatus))
const shop = computed(() => SHOP[status.value])
const canOrder = computed(() => status.value === 'open')

// stock and buying rules: local demo seeds until the shared data carries them (state.db.buyRules is used when it does)
const STOCK = { 7: 0, 5: 3, 2: 6 }
const RULES = state.db.buyRules || { 9: { min: 2 }, 1: { limit: { n: 2, period: 'day' } }, 2: { max: 3 }, 11: { once: true } }
const stockOf = (x) => (x.id in STOCK ? STOCK[x.id] : x.stock)
const ruleOf = (x) => RULES[x.id] || {}
const bought = (pid, period) => {
  const today = K.ymd(B.NOW())
  return state.db.orders.filter((o) => o.userId === state.db.me.id && !['CANCELLED', 'REFUNDED'].includes(o.status) && (period === 'day' ? o.createdAt.slice(0, 10) === today : true))
    .reduce((s, o) => s + o.items.filter((i) => i.pid === pid).reduce((a, i) => a + i.qty, 0), 0)
}
const leftOf = (x) => { const r = ruleOf(x); if (r.once) return bought(x.id) > 0 ? 0 : 1; if (r.limit) return Math.max(0, r.limit.n - bought(x.id, r.limit.period)); return Infinity }
const capOf = (x) => Math.max(0, Math.min(stockOf(x), ruleOf(x).max || Infinity, leftOf(x)))
const minOf = (x) => ruleOf(x).min || 1
const roomOf = (x) => Math.max(0, capOf(x) - qtyOf(x.id))
function ruleTexts(x) {
  const r = ruleOf(x), out = []
  if (r.min > 1) out.push(r.min + ' 件起售')
  if (r.max) out.push('每单最多 ' + r.max + ' 件')
  if (r.once) out.push(bought(x.id) > 0 ? '每人限购 1 次，你已买过' : '每人限购 1 次')
  else if (r.limit) { const left = leftOf(x); out.push((r.limit.period === 'day' ? '每日限购 ' : '每人限购 ') + r.limit.n + ' 件，' + (left > 0 ? '还可买 ' + left + ' 件' : '已达上限')) }
  if (stockOf(x) > 0 && stockOf(x) <= 5) out.push('仅剩 ' + stockOf(x) + ' 件')
  return out
}
const extraOf = (x, s) => (x.specs || []).reduce((sum, g) => sum + (g.opts.find((o) => o.n === s[g.name])?.d || 0), 0)

// what can be done with the product right now: ok / limit (bought the most already) / soldout / off
const pst = computed(() => {
  const x = p.value
  if (scene.value === 'off' || x.status !== 'ON') return 'off'
  if (scene.value === 'soldout' || stockOf(x) <= 0) return 'soldout'
  if (scene.value === 'limit' || roomOf(x) < minOf(x)) return 'limit'
  return 'ok'
})
const PST_TEXT = { off: '已下架', soldout: '已售罄', limit: '已达购买上限' }

// specs: the first option of each group is the recommended one
const sel = reactive({})
watch(p, (x) => { Object.keys(sel).forEach((k) => delete sel[k]); (x?.specs || []).forEach((g) => { sel[g.name] = g.opts[0].n }) }, { immediate: true })
const unit = computed(() => p.value.price + extraOf(p.value, sel))
const oldPrice = computed(() => p.value.orig + unit.value - p.value.price)
const tags = computed(() => [...p.value.tags.map((t) => ({ t, hot: true })), ...ruleTexts(p.value).map((t) => ({ t }))])
const intro = computed(() => p.value.desc + '。食材每日新鲜采购，下单后现做现出，出餐约 8 分钟，请凭取餐号到店自取。主食搭配当季时蔬和例汤，米饭可免费续添一次；如有忌口，可在结算时备注。图片仅供参考，以实物为准。')
function priceNote() {
  showDialog({ title: '价格说明', message: '划线价是本店该商品标准规格的日常标价，不是其他渠道的价格。\n预估到手价按你的优惠券自动计算，实付以结算页为准，可能与预估不同。', messageAlign: 'left', confirmButtonText: '知道了', teleport })
}

// reviews (state.db.reviews when the shared data has them, else seeded here per product)
const NAMES = ['李', '王', '张', '陈', '刘', '周']
const WORDS = ['味道很好，分量足', '出餐很快，取餐方便', '牛腩软烂，汤汁拌饭一绝', '清淡不油腻，会再来', '早上赶时间也来得及', '包装严实，到店还是热的', '价格实惠，会员卡很划算']
const reviews = computed(() => {
  if (scene.value === 'noreview') return []
  if (state.db.reviews) return state.db.reviews.filter((r) => r.pid === p.value.id)
  const r = B.rng(53 + p.value.id), n = 3 + Math.floor(r() * 3)
  return Array.from({ length: n }, () => ({ user: NAMES[Math.floor(r() * NAMES.length)] + '**', rating: r() > 0.18 ? 5 : 4, text: WORDS[Math.floor(r() * WORDS.length)], at: K.ymd(K.addDays(K.today(), -Math.floor(r() * 20))) }))
})
const goodRate = computed(() => Math.round((reviews.value.filter((r) => r.rating >= 4).length / reviews.value.length) * 100))
const allReviews = ref(false)

// actions: adding waits for the server like every other write
const busy = ref('')
async function add(buy) {
  if (busy.value) return
  busy.value = buy ? 'buy' : 'add'
  try {
    await request(80)
    addToCart(p.value, { spec: Object.values(sel).join(' / '), specExtra: extraOf(p.value, sel), qty: Math.max(minOf(p.value), 1) })
  } catch { busy.value = ''; toast('网络不太稳定，没有加入购物车，选好的规格还在，请重试'); return }
  busy.value = ''
  if (buy) go(state.role === 'guest' ? 'login' : 'checkout'); else toast('已加入购物车')       // buying as a guest signs in first and comes back here
}
const reminded = ref(false)
async function remind() {
  if (busy.value) return
  busy.value = 'remind'
  try { await request(300) } catch { busy.value = ''; toast('网络不太稳定，没有设置成功，请重试'); return }
  busy.value = ''; reminded.value = true; toast('到货后会通知你')
}
</script>

<template>
  <div class="pg product">
    <MiniState :status="viewState" empty-text="这件商品不存在或已下架" @retry="load">
      <template #empty-action><van-button round type="primary" plain size="small" @click="back()">返回</van-button></template>
      <template v-if="p">
        <div class="gal">
          <van-swipe :autoplay="0" lazy-render>
            <van-swipe-item v-for="(src, i) in pics" :key="i"><van-image :src="src" fit="cover" width="100%" height="340" :alt="i === 0 ? p.name : p.name + '，图 ' + (i + 1)" /></van-swipe-item>
            <template #indicator="{ active, total }"><van-tag round type="default" class="count">{{ active + 1 }}/{{ total }}</van-tag></template>
          </van-swipe>
          <van-tag v-if="pst === 'off' || pst === 'soldout'" type="default" size="large" class="state">{{ PST_TEXT[pst] }}</van-tag>
        </div>

        <div class="pbody">
          <van-notice-bar v-if="!canOrder" left-icon="info-o" wrapable :scrollable="false" :text="shop.label + '，' + shop.hint + '，现在可以浏览，暂不能下单'" class="notice" />

          <section class="mp-card info">
            <div class="prow"><MiniPrice :cents="unit" :old="oldPrice" :size="22" /><span class="muted">已售 {{ p.sales }}</span></div>
            <h2 class="pname">{{ p.name }}</h2>
            <p class="muted pdesc">{{ p.desc }}</p>
            <div v-if="tags.length" class="tags"><van-tag v-for="g in tags" :key="g.t" plain :type="g.hot ? 'danger' : 'default'">{{ g.t }}</van-tag></div>
          </section>

          <section v-if="p.specs.length" class="mp-card">
            <div v-for="g in p.specs" :key="g.name" class="sgroup">
              <h3 class="sh">{{ g.name }}</h3>
              <div class="chips" role="group" :aria-label="g.name">
                <van-badge v-for="(o, i) in g.opts" :key="o.n" :content="i === 0 ? '推荐' : ''" :offset="[-8, 6]">
                  <van-button :type="sel[g.name] === o.n ? 'primary' : 'default'" :aria-pressed="sel[g.name] === o.n" @click="sel[g.name] = o.n">{{ o.n }}<template v-if="o.d"> +{{ money(o.d) }}</template></van-button>
                </van-badge>
              </div>
            </div>
          </section>

          <section class="mp-card">
            <h3 class="sh">商品介绍</h3>
            <van-text-ellipsis :content="intro" :rows="2" expand-text="展开" collapse-text="收起" />
          </section>

          <van-cell-group inset>
            <van-cell title="价格说明" label="划线价与到手价怎么算" is-link @click="priceNote" />
          </van-cell-group>

          <van-cell-group inset :title="'评价（' + reviews.length + '）'">
            <van-empty v-if="!reviews.length" description="还没有评价，下单后可以来写第一条" image-size="80" />
            <template v-else>
              <van-cell v-for="(r, i) in reviews.slice(0, 2)" :key="i">
                <template #title><span class="who">{{ r.user }}</span><van-rate :model-value="r.rating" readonly :size="14" color="var(--luz-warning)" /></template>
                <template #value>{{ r.at }}</template>
                <template #label>{{ r.text }}</template>
              </van-cell>
              <van-cell :title="'全部评价（' + reviews.length + '）'" :value="'好评率 ' + goodRate + '%'" is-link @click="allReviews = true" />
            </template>
          </van-cell-group>
        </div>

        <van-action-bar placeholder class="abar">
          <van-action-bar-icon icon="cart-o" text="购物车" :badge="cartCount || ''" @click="go('cart')" />
          <van-action-bar-button v-if="!canOrder" type="primary" disabled :text="shop.label + '，暂不能下单'" />
          <template v-else-if="pst === 'soldout'">
            <van-action-bar-button type="warning" :disabled="reminded || !!busy" :text="reminded ? '已设置到货通知' : busy === 'remind' ? '设置中' : '到货通知'" @click="remind" />
            <van-action-bar-button type="primary" disabled text="已售罄" />
          </template>
          <van-action-bar-button v-else-if="pst !== 'ok'" type="primary" disabled :text="PST_TEXT[pst]" />
          <template v-else>
            <van-action-bar-button type="warning" :disabled="!!busy" :text="busy === 'add' ? '加入中' : '加入购物车'" @click="add(false)" />
            <van-action-bar-button type="primary" :disabled="!!busy" :text="busy === 'buy' ? '加入中' : '立即购买'" @click="add(true)" />
          </template>
        </van-action-bar>

        <van-popup v-model:show="allReviews" position="bottom" round closeable class="pg-pop">
          <div class="revs">
            <h3 class="sh">全部评价（{{ reviews.length }}）</h3>
            <van-cell-group>
              <van-cell v-for="(r, i) in reviews" :key="i">
                <template #title><span class="who">{{ r.user }}</span><van-rate :model-value="r.rating" readonly :size="14" color="var(--luz-warning)" /></template>
                <template #value>{{ r.at }}</template>
                <template #label>{{ r.text }}</template>
              </van-cell>
            </van-cell-group>
          </div>
        </van-popup>
      </template>
    </MiniState>
  </div>
</template>

<style scoped>
.pg, .pg-pop {
  --van-tag-font-size: var(--van-font-size-sm); --van-tag-line-height: 20px; --van-tag-default-color: var(--luz-ink-2);
  --van-badge-font-size: var(--van-font-size-sm); --van-badge-font: var(--luz-font);
  --van-button-small-height: 40px; --van-button-small-font-size: var(--van-font-size-sm);
  --van-cell-label-font-size: var(--van-font-size-sm); --van-cell-label-line-height: 20px;
  --van-cell-group-title-font-size: var(--van-font-size-sm);
  --van-notice-bar-line-height: 22px;
  --van-text-ellipsis-action-color: var(--luz-action-text);
  --van-action-bar-icon-font-size: var(--van-font-size-sm);
  --van-action-bar-button-warning-color: var(--luz-action-tint); --van-button-warning-color: var(--luz-action-text);   /* the second action is the light one */
  --van-empty-description-font-size: var(--van-font-size-sm);
}
.product { min-height: 100%; }
@media (min-width: 901px) { .abar { padding: 0 16px 16px; } }   /* the desktop phone frame has rounded corners: keep the bar's ends inside them */
.gal { position: relative; }
.count { position: absolute; right: 12px; bottom: 12px; }
.state { position: absolute; left: 12px; top: 12px; }
.pbody { display: grid; gap: 12px; padding: 12px; align-content: start; }
.notice { border-radius: var(--luz-radius-card); }
.prow { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.prow :deep(.price small), .prow :deep(.price-old) { font-size: var(--t14); }   /* MiniPrice's 12 px parts, kept at the 14 px floor of the audit */
.pname { margin: 4px 0 0; font-size: var(--t18); line-height: 26px; font-weight: 600; }
.pdesc { margin: 2px 0 0; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.sgroup + .sgroup { margin-top: 12px; }
.sh { margin: 0 0 8px; font-size: var(--t16); line-height: 22px; font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 12px; }
.who { margin-right: 8px; font-weight: 600; }
.revs { padding: 20px 0 16px; }
.revs .sh { padding: 0 16px; }
</style>
